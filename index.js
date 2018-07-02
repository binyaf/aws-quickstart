'use strict';

console.log('Loading function');

var _ = require('lodash');
var AWS = require('aws-sdk');
var dynamo = new AWS.DynamoDB();
let tableName = 'quickStart';
let NUMBER_OF_QS = 12;

exports.handler = (event, context, callback) => {
    console.log('FCID=', event.headers['fcid'], ', Received event:', JSON.stringify(event, null, 2));

    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? JSON.stringify({errMsg :err.message}) : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
        },
    });

    let householdId;
    
    console.log('lambda function got ' + event.httpMethod + ' request');
        
    switch (event.httpMethod) {
        
        case 'GET':
           
            householdId = extractHouseholdFromHeader(event);
           
            getQuickStartOfHousehold(householdId, function(qsOfHousehold, err) {
                
                if (err) {
                    console.log("Error", err);
                    done(err);
                }
                
                //qs doesn't exist for hh
                if (! qsOfHousehold) {
                    done(null, {});
                } else {
                    var arrayOfChannels = [];
                    _.forEach(qsOfHousehold, function(qs) {
                        var channelObj = {itemId:qs.S, type:"LINEAR"};
                        arrayOfChannels.push(channelObj);
                    });
                    console.log('lambda function finished');
                    done(null, arrayOfChannels);
                }
         
            });
            break;
        case 'PUT':
            
           householdId = extractHouseholdFromHeader(event);
           let channel = JSON.parse(event.body).itemId ;
          
            console.log("request params: hhid: " + householdId + ", channel: " + channel);
            
            getQuickStartOfHousehold(householdId, function(qsOfHousehold, err) {
                
                if (err) {
                    console.log("Error", err);
                    done(err);
                }
                
                //qs doesn't exist for hh
                if (! qsOfHousehold) {
                    addNewQuickStartToHousehold(householdId, channel);
                } else {
                    addChannelToExistingQuickStart(householdId, channel, qsOfHousehold);
                }
         
            });
            done(null, {result:'Added QS to household'});
            break;
        default:
            done(new Error('recieved event.httpMethod:' + event.httpMethod + `.Unsupported method "${event.httpMethod}"`));
    }
    
    function getQuickStartOfHousehold(hhid, cb) {
        var params = {
            TableName: tableName,
            Key: {
                'householdId' : {S: hhid},
            }
        };

        // Call DynamoDB to read the item from the table
        dynamo.getItem(params, function(err, data) {
            if (err) {
                console.log("getQuickStartOfHousehold - Error", err);
                cb(err);
            } else if (! data.Item) {
                console.log("getQuickStartOfHousehold - didn't find item");
                cb();
            } else if (data.Item) {
                var list = data.Item.channel.L;
                cb(list);
            }
        });
    }
    
    function addNewQuickStartToHousehold(hhid, channel) {
        var params = {
            TableName: tableName,
            Item: {
            'householdId' : {S: hhid},
            'channel' : {L: [{"S" : channel}]} 
          }
        };

        // Call DynamoDB to add the item to the table
        dynamo.putItem(params, function(err, data) {
            if (err) {
                console.log("Error adding channel to household. params:" + JSON.stringify(params), err);
            } else {
                console.log("Success adding channel to household which didn't have QS", data);
            }
        });
    }
    
    function addChannelToExistingQuickStart(hhid, newChannel, qsOfHousehold) {
        console.log("calling addChannelToExistingQuickStart with", "hhid=" + hhid, "channel=" + newChannel, "qsOfHousehold=" + JSON.stringify(qsOfHousehold));
      
        let arr = [{"S":newChannel}, ...qsOfHousehold];
        let newQuickStartSet = _.uniqBy(arr, "S");
          
        console.log("newQuickStartSet#" + JSON.stringify(newQuickStartSet));
        if (newQuickStartSet.length > NUMBER_OF_QS) {
            newQuickStartSet = _.slice(newQuickStartSet, 0, NUMBER_OF_QS -1);
        }
        var params = {
            TableName: tableName,
            Item: {
                'householdId' : {S: hhid},
                'channel' : {L: newQuickStartSet},
            }
        };

        // Call dynamo to add the item to the DB
        dynamo.putItem(params, function(err, data) {
            if (err) {
                console.log("Error adding channel to household", err);
            } else {
                console.log("Success adding channel to household", data);
            }
        });
    }
    
    function extractHouseholdFromHeader(event) {
            let hhidObj = event.headers['x-cisco-vcs-identity'] ? JSON.parse(event.headers['x-cisco-vcs-identity']) : {};
                   
            if (! hhidObj.hhId) {
               done(new Error('didn\'t find household in the request')); 
            }
            
            return hhidObj.hhId;
    }
};
