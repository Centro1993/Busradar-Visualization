const request = require('request'),
    MongoClient = require('mongodb').MongoClient,
    assert = require('assert');

let lastModifiedArray = [];

// Test Db connection
const dbUrl = 'mongodb://localhost:27017/busradar';
// Use connect method to connect to the DB
MongoClient.connect(dbUrl, function(err, db) {
    assert.equal(null, err);
    console.log("Connected correctly to DB");

    db.close();
});

let scrape = function() {
    request.get('http://www.busradar-flensburg.de/json/busradar/vehiclepos', function(err, res, body) {

        try {
            body = JSON.parse(body);
        } catch (e) {
            return;
        }

        body.result.forEach(function(el) {

            //parse line and last modified timestamp to int
            el.line = parseInt(el.line);
            el.LastModified = parseInt(el.LastModified);

            //skip empty buses and data with no changes
            if (el.line !== 0 && lastModifiedArray[el.line] != el.LastModified) {

                //save timestamp
                el.timestamp = Date.now();

                //save last modified timestamp
                lastModifiedArray[el.line] = el.LastModified;

                //save to mongodb
                MongoClient.connect(dbUrl, function(err, db) {
                    assert.equal(null, err);
                    db.collection('line-' + el.line).insert(el, function(err, res) {
                        assert.equal(err, null);
                        db.close();
                    });
                });
            }
        });
    });
};

let repeatTimeout = function() {
    setTimeout(function() {
        scrape();
        repeatTimeout();
    }, 1000);
};

//start scraper
repeatTimeout();
