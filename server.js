require('dotenv').config({silent: true});

var request = require('request');
var express = require('express');
var Firebase = require("firebase");
var md5 = require('md5');
var MongoClient = require('mongodb').MongoClient;
var _ = require('underscore');
var d = new Date();
var app  = express();
var Cloudant = require('cloudant');
var me = 'opencta'; // Replace with your account.
var password = process.env.CLOUDANT_PASSWORD;


var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 1337;
var ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';

// Connection URLs
var url = process.env.OPENSHIFT_MONGODB_DB_URL;
var dataRef = new Firebase("https://cta-cache.firebaseio.com/data/");
var rtref = new Firebase("https://cta-rt.firebaseio.com/");

setInterval(function() {
        var cta_url = "http://lapi.transitchicago.com/api/1.0//ttpositions.aspx?key=" + process.env.CTA_TOKEN + "&rt=brn,red,Blue,G,Org,P,Pink,Y";
        request(cta_url, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log('request successful!'); // Show the HTML for the Google homepage.
                    save(body);
                }
        })
}, 3000);

var save = function(data){
        var parseString = require('xml2js').parseString;
        parseString(data, {mergeAttrs: true}, function (err, result) {
            var insert = {};
            var routes = {};
            var meta = {tmst: result.ctatt.tmst[0], errCd: result.ctatt.errCd[0], errNm: result.ctatt.errNm[0]};


            result = result.ctatt.route;

             _.each(result,function(element, index, list) {
                    routes[element.name[0]] = element.train;
                });

            _.each(routes,function(route, rt_index, list) {
                _.each(route, function (train, train_index,list){
                    _.each(train, function (property, property_index,list){
                        routes[rt_index][train_index][property_index] = property[0];
                    });
                });
            });

            insert['data'] = routes;
            insert['meta'] = meta;
            insert['timestamp'] = Date.now();
            insert['hash'] = md5(JSON.stringify(result));
            dataRef.child(insert['hash']).set(insert);

            rtref.set(insert);

            // Use connect method to connect to the Server
            Cloudant({account:me, password:password}, function(err, cloudant) {
                if (err) {
                    console.log('Unable to connect to the mongoDB server. Error:', err);
                } else {
                    //HURRAY!! We are connected. :)
                    console.log('Connection established to', url);

                    // Get the documents collection
                    var collection = cloudant.db.use('trains-test')
                        // Insert some users
                        insert['_id'] = insert['hash'];
                        collection.insert(insert, function (err) {
                            if (err) {
                                console.log(err);
                            } else {
                              //  console.log('Inserted %d documents into the "trains" collection. The documents inserted with "_id" are:', result.length, result);
                            }
                        });
                }
            })
        });
    };

app.get('/', function (req, res) {
   res.end("It's alive!");
});

app.listen(port, ip);
console.log('Server running on ' + ip + ':' + port);
