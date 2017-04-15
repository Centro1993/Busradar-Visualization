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
            //longitude and latidute from route files
            lat: [],
            lon: [],
            //all speeds in total and the number of ticks which we use to compute that speed go here (will be deleted later on)
            allSpeedsAdded: [],
            speedTickNumber: [],
            //placeholder for average speed result ( will be computed at the end),
            averageSpeed: []
        };
        fs.readFile('./routes/cropped/' + file, 'utf-8', (err, data) => {
            data.toString().split('\n').forEach(function(line) {
                //check if line is filled
                if (typeof line !== "undefined" && line !== null && line !== "") {
                    //save longitude and latitude
                    line = line.split(',');
                    routes[file].lon.push(line[0]);
                    routes[file].lat.push(line[1]);
                    //init all other values
                    routes[file].allSpeedsAdded.push(0);
                    routes[file].speedTickNumber.push(0);
                    routes[file].averageSpeed.push(0);
                }
            });

            //get ticks for specific line from db
            MongoClient.connect(dbUrl, function(err, db) {
                assert.equal(null, err);

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
                }).toArray((err, res) => {
                    //save the last tick
                    let lastTick = [];

                    //iterate all ticks selected
                    res.forEach((tick) => {
                        //save current vehicle to differentiate between ticks of different vehicles
                        let vehicle = tick.vehicleId;

                        //check if last tick is set and some time has passed
                        if (typeof lastTick[vehicle] !== "undefined" && tick.LastModified - lastTick[vehicle].LastModified > 0) {

                            //compute median coordinate, time and speed
                            let averageLat = (tick.lat + lastTick[vehicle].lat) / 2;
                            let averageLon = (tick.lon + lastTick[vehicle].lon) / 2;
                            let distance = geodist(tick, lastTick[vehicle], {
                                exact: true,
                                unit: 'meters'
                            });
                            let time = tick.LastModified - lastTick[vehicle].LastModified;
                            let speed = distance / time * 3.6;

                            let averageTick = {
                                lat: averageLat,
                                lon: averageLon,
                                distance: distance,
                                time: time,
                                speed: speed
                            };

                            //console.dir(averageTick);

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
                                        lon: averageTick.lon
                                    }, {
                                        exact: true,
                                        unit: "meters"
                                    });

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

                            //now that we know the route point closest to the average tick, add average speed to the route point
                            routes[file].speedTickNumber[parseInt(closestRoutePoint.index)]++;
                            routes[file].allSpeedsAdded[parseInt(closestRoutePoint.index)] += averageTick.speed;
                        }

                        //save current tick to compute the median with the next tick
                        lastTick[vehicle] = tick;

                    }, function(err) {
                        console.log(err);
                        db.close();
                    });

                    //all ticks averaged and sorted to their closest route points
                    //now, compute the average speed of each route point
                    routes[file].averageSpeed.forEach((ele, ind, arr) => {
                        //when no data is given for a route point, interpolate by getting data from the nearest neighbours
                        if(routes[file].speedTickNumber[ind] === 0) {
                          routes[file].allSpeedsAdded[ind] = routes[file].allSpeedsAdded[ind-1] + routes[file].allSpeedsAdded[ind+1];
                          routes[file].speedTickNumber[ind] = routes[file].speedTickNumber[ind-1] + routes[file].speedTickNumber[ind+1];
                        }

                        //compute average speed
                        arr[ind] = routes[file].allSpeedsAdded[ind] / routes[file].speedTickNumber[ind];
                    });

                    //delete helper arrays from routes array for this file
                    delete routes[file].allSpeedsAdded;
                    delete routes[file].speedTickNumber;

                    //we are done here, save the route points and their speeds as json to a file
                    fs.writeFile("./routesWithAverageSpeed/" + file + ".json", JSON.stringify(routes[file]), function(err) {
                        if (err) {
                            return console.log(err);
                        }

                        console.log("Average Speeds for Line " + file + " have been saved!");
                    });
                });
            });
        });
    });
});
