
var redis = require("redis"),
    url = require("url"),
    client = redis.createClient()

function dataRequest()
{
    this.requestType = ""
    this.tableName = ""
    this.filterById = ""
    this.body = "testbody"
    
}

function dataResponse()
{ 
    this.entities = []

}

function fieldMetadata()
{ 
    this.fieldName = ""
    this.fieldType = ""
}
function getFieldMetadata(instance)
{ 
    fields = []

     for (var field in instance)
     { 
         var fMetadata = new fieldMetadata()
         fMetadata.fieldName = field
         fMetadata.fieldType = typeof instance[field]

         fields.push(JSON.stringify(fMetadata))
     }

     return fields
}

function addMetadata(dataRequest)
{ 
     var metadataAllEntitiesSet = "entities"

     // add tableName to list of entities

     console.log("adding ",dataRequest.tableName," to ", metadataAllEntitiesSet)

     client.sadd(metadataAllEntitiesSet,JSON.stringify(dataRequest.tableName))

     // store field info to entity metadata for tableName

     var fields = getFieldMetadata(dataRequest.body)

     var entityFieldsSet = "metadata".concat(dataRequest.tableName)

     console.log("calling sadd on ", entityFieldsSet, " with ", fields)

     client.sadd(entityFieldsSet,fields)
}

function addItem(dataRequest)
{ 

    // add the item and its metadata.

    if (dataRequest.tableName == "metadata")
    {
        return;
    }

    // add the tablename to metaddata list.

    addMetadata(dataRequest)

    // add the item to the list of records for that table.


    var allEntitiesList = dataRequest.tableName

    var key = dataRequest.tableName.concat(dataRequest.filterById)

    client.set(key,JSON.stringify(dataRequest.body))

    client.lpush(allEntitiesList, JSON.stringify(dataRequest.body))
}
function executeRequest(dataRequest, res)
{
    switch (dataRequest.requestType)
    {
        case "post":
              addItem(dataRequest)

            break;

        case "get":

            if (dataRequest.tableName == "metadata")
            { 
                 getMetadata(dataRequest,res)
            }

            if (dataRequest.filterById != "") {

                getItem(dataRequest, res)

            }
            else {
                getItems(dataRequest, res)

            }

            break;
    }
}

function getMetadata(dataRequest, res)
{
    if (dataRequest.filterById != "") 
    {
        getMetadataForEntity(dataRequest.filterById, res) //TODO: clean this up - dataRequest should always have a clean entityName property irrespective of whether it is a data req or metadata req.
    }
    else
    { 
        getMetadataAllEntities(dataRequest, res)
    }
}

function getMetadataAllEntities(dataRequest, res)
{
    
     var metadataAllEntitiesSet = "entities"

     client.smembers(metadataAllEntitiesSet, function(err, value) {
                 if (err) {
                     console.error("error");
                 } else {
                     console.log("smembers Worked: " + value);
                     var response = new dataResponse()
                     response.entities = value
                     res.send(response)
                 }
                })
}

function getMetadataForEntity(entityName, res)
{
    
     var entityFieldsSet = "metadata".concat(entityName) 

     client.smembers(entityFieldsSet, function(err, value) {
                 if (err) {
                     console.error("error");
                 } else {
                     console.log("smembers on " + entityFieldsSet + " Worked: " + value);
                     var response = new dataResponse()
                     response.entities = value //TODO: clean up the way json.stringify/parse are used...
                     res.send(response)
                 }
                })
}

function getItem(dataRequest, res)
{ 

    var key = dataRequest.tableName.concat(dataRequest.filterById)

    var retVal

    client.get(key, function(err, value) {
                 if (err) {
                     console.error("error");
                 } else {
                     console.log("Worked: " + value);
                     res.send(value)
                 }
                })


}

function getItems(dataRequest, res)
{ 
    var allEntitiesList = dataRequest.tableName

    client.lrange(allEntitiesList, 0, -1, function (err, value) {
        if (err) {
            console.error("error");
        } else {
            console.log("Worked: " + value);
		     // redis gives back an array of strings.
		     // conver it into an array of json objects so the right serialization will happen when returning results.
		    for(var i = 0; i < value.length; i++)
		    {
			    value[i] = JSON.parse(value[i])

		    }
		    console.log("sending: ", value)
		    res.send(value)
        }
    })
}
// valid urls:
// /odata/contacts -- return all contacts
// /odata/contacts/foo - return contact foo
// /odata or /odata/metadata - return all entities
// /odata/metaddata/contacts - return metadata for contacts entity

function parseUri(req)
{
    var r = new dataRequest()

    r.requestType = req.method.toLowerCase()

    if (r.requestType == "post")
    { 
        console.log("reqbody ", req.body)

        r.body = req.body
    
    }

    var parts = url.parse(req.url)

    var pathname = parts.pathname

    var pathParts = pathname.split('/')

    console.log("path parts = ",pathParts)

    if (pathParts.length == 2 || pathParts[2] == "") // ie /odata or /odata/
    { 
          r.tableName = "metadata"

          return r
    }

    r.tableName = pathParts[2] // tableName == "metadata" for metdata requests - clean this up.

    if (pathParts.length == 4)
    { 
        r.filterById = pathParts[3].toLowerCase() //filterById == entityname (contacts) for metadata requests - clean this up.
    
    }

    return r
}

exports.redisDatasvc = function (req, res) {

    var request = parseUri(req)

    console.log("parsed request: ", request)

    executeRequest(request, res)

}