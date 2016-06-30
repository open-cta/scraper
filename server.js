require('dotenv').config({silent: true});

// Setting some things up
var request = require('request'),
    express = require('express'),
    _ = require('underscore'),
    AWS = require("aws-sdk"),
    moment = require("moment-timezone"),
    parseString = require('xml2js').parseString,
    geohash = require('ngeohash'),
    winston = require('winston'),
    WinstonCloudWatch = require('winston-cloudwatch');


var d = new Date(),
    app  = express(),
    dd = d.getDate(),
    mm = d.getMonth()+1,
    yyyy = d.getFullYear(),
    today = yyyy + mm + dd;

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 1337;
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';

// Configuring AWS
AWS.config.update({
    region: "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ level: 'debug' }),
        new (WinstonCloudWatch)({
            logGroupName: 'opencta-scraper',
            logStreamName: today,
            level: 'info'
        })
    ]
});

winston.add(WinstonCloudWatch, {
  logGroupName: 'opencta-scraper',
  logStreamName: today
});

var docClient = new AWS.DynamoDB.DocumentClient();

logger.info("----booting up----")

// Doing stuff every 3 seconds
setInterval(function() {
        var cta_url = "http://lapi.transitchicago.com/api/1.0//ttpositions.aspx?key=" + process.env.CTA_TOKEN + "&rt=brn,red,Blue,G,Org,P,Pink,Y";
        request(cta_url, function (error, response, body) {
                if(error){
                    logger.error(error)
                    logger.error(response.body)
                }

                if(response.statusCode != 200){
                    logger.error(response.statusCode)
                    logger.error(response.body)
                }
                if (!error && response.statusCode == 200) {
                    logger.debug('request successful!'); // Show the HTML for the Google homepage.
                    save(body);
                }
        });
}, 3000);

// javascript is so dumb
var isNumberic = function(num){
    return !isNaN(num);
};

//the stuff to do every 3 seconds
var save = function(data){
        parseString(data, {mergeAttrs: true}, function (err, result) {
          var meta = {errCd: result.ctatt.errCd[0], errNm: result.ctatt.errNm[0], insertTimestamp: Date.now(), responseTimestamp: moment.tz(result.ctatt.tmst[0], "YYYYMMDD HH:mm:ss", "America/Chicago").unix()};
          var predictionResults = result.ctatt.route;

          _.each(predictionResults,function(element, index, list) {
            var trainsInRoute = element.train;
            var params = {
              TableName: process.env.AWS_DYNAMODB_TABLE_NAME_TRAINS
            };

            //parsing
            _.each(trainsInRoute, function (train, property_index,list){
              params.Item = _.mapObject(train, function(val, key) {
                if(isNumberic(val[0])){
                  return +val[0];
                }
                return val[0];
            });

            //mapping some things
            params.Item.routeName = element.name[0];
            params.Item.arrT = moment.tz(params.Item.arrT, "YYYYMMDD HH:mm:ss", "America/Chicago").unix();
            params.Item.prdt = moment.tz(params.Item.prdt, "YYYYMMDD HH:mm:ss", "America/Chicago").unix();
            params.Item.geohash = geohash.encode(params.Item.lat, params.Item.lon, 9);
            params.Item.meta = _.pick(meta, _.identity);
            params.Item =  _.pick(params.Item, _.identity);

            //pushing to DynamoDB
            docClient.put(params, function(err, data) {
                if (err) logger.error(JSON.stringify(err, null, 2));
            });
          });
        });
      });
  };

app.get('/', function (req, res) {
   res.end("It's alive!");
});

app.listen(port, ip);
console.log('Server running on ' + ip + ':' + port);
