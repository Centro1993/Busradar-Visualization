const fs = require('fs'),
    readline = require('readline'),
    MongoClient = require('mongodb').MongoClient,
    assert = require('assert'),
    geodist = require('geodist');

const startTime = 1491979144;

// Test Db connection
const dbUrl = 'mongodb://localhost:27017/busradar';
// Use connect method to connect to the DB
MongoClient.connect(dbUrl, function(err, db) {
    assert.equal(null, err);
    console.log("Connected correctly to DB");

    db.close();
});

//variables
let routes = {};

//load cropped routes from folder
fs.readdir('./routes/cropped/', (err, files) => {
    files.forEach(file => {
        console.log(file);
        routes[file] = {
            lat: [],
            lon: []
        };
        fs.readFile('./routes/cropped/' + file, 'utf-8', (err, data) => {
            data.toString().split('\n').forEach(function(line) {
                //save longitude and latitude
                line = line.split(',');
                routes[file].lon.push(line[0]);
                routes[file].lat.push(line[1]);
            });

            //get ticks for specific line from db
            MongoClient.connect(dbUrl, function(err, db) {
                assert.equal(null, err);

                //save the last tick
                let lastTick = "";

                db.collection("line-" + file).find({
                    $and: [{
                            LastModified: {
                                $gte: startTime
                            }
                        },
                        {
                            LastModified: {
                                $lte: startTime + 3600
                            }
                        }
                    ]
                }, function(err, res) {
                    //iterate all ticks selected
                    res.forEach((tick) => {
                        //check if last tick is set
                        if (lastTick !== "") {
                            //compute median coordinate, time and speed
                            let averageLat = (tick.lat + lastTick.lat) / 2;
                            let averageLon = (tick.lon + lastTick.lon) / 2;
                            let distance = geodist(tick, lastTick, {
                                exact: true,
                                unit: 'meters'
                            });
                            let time = tick.LastModified - lastTick.LastModified;
                            let speed = distance / time * 3.6;

                            let averageTick = {
                                lat: averageLat,
                                lon: averageLon,
                                distance: distance,
                                time: time,
                                speed: speed
                            };

                            console.dir(averageTick);

                            let closestRoutePoint = {
                                index: 0,
                                distance: Number.MAX_SAFE_INTEGER
                            };

                            //find nearest point in route
                            routes[file].lat.forEach((lat, ind, arr) => {

                                //get lon matching to lat
                                let lon = routes[file].lon[ind];
                                //sanity check
                                if (typeof lat !== "undefined" && typeof lon !== "undefined") {

                                    let distanceToCurrentRoutePoint = geodist({
                                        lat: lat,
                                        lon: lon
                                    }, {
                                      lat: averageTick.lat,
                                      lon: averageTick. lon
                                    }, {
                                        exact: true,
                                        unit: "meters"
                                    });
                                    console.log(distanceToCurrentRoutePoint);

                                    //check if distance to current route route pint is shorter than the one we saved
                                    if (distanceToCurrentRoutePoint < closestRoutePoint.distance) {
                                        //save current distance and route point index
                                        closestRoutePoint = {
                                            index: ind,
                                            distance: distanceToCurrentRoutePoint
                                        };
                                    }
                                }

                            });
                            console.log(closestRoutePoint);
                            process.exit();
                        }

                        //save current tick
                        lastTick = tick;

                    }, function(err) {
                        console.log(err);
                        db.close();
                    });
                });
            });
        });
    });
});
