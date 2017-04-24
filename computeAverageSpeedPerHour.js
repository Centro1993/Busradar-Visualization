const fs = require('fs'),
    readline = require('readline'),
    MongoClient = require('mongodb').MongoClient,
    assert = require('assert'),
    geodist = require('geodist');

let startTime = 1491979144,
    endTime = startTime + 3600;

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
            lon: []
        };
        fs.readFile('./routes/cropped/' + file, 'utf-8', (err, data) => {
            data.toString().split('\n').forEach(function(line) {
                //check if line is filled
                if (typeof line !== "undefined" && line !== null && line !== "") {
                    //save longitude and latitude
                    line = line.split(',');
                    routes[file].lon.push(line[0]);
                    routes[file].lat.push(line[1]);
                }
            });

            //iterate over hours beginning from startTime
            while (endTime < Date.now() / 1000) {
                computeAverageRouteSpeedInHourPerLine(startTime, endTime, file, routes[file]);

                //increment start- and endtime
                startTime += 3600;
                endTime += 3600;
            }

        });
    });
});

function computeAverageRouteSpeedInHourPerLine(start, end, line, route) {

    //get ticks for specific line from db
    MongoClient.connect(dbUrl, function(err, db) {
        assert.equal(null, err);

        db.collection("line-" + line).find({
            $and: [{
                    LastModified: {
                        $gte: start+1
                    }
                },
                {
                    LastModified: {
                        $lte: end
                    }
                }
            ]
        }).toArray((err, res) => {

          let speedTickNumber = [];
          let allSpeedsAdded = [];
          let averageSpeed = [];

          //fill helper arrays
          route.lat.forEach(() => {
            speedTickNumber.push(0);
            allSpeedsAdded.push(0);
            averageSpeed.push(0);
          });

            //break if no result
            if (typeof res[0] === "undefined") {
                return;
            }

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

                    //iterate route to find nearest point
                    route.lat.forEach((lat, ind, arr) => {

                        //get lon matching to lat
                        let lon = route.lon[ind];
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
                    //sanity check
                    if (typeof speedTickNumber[parseInt(closestRoutePoint.index)] !== 'undefined') {
                        //now that we know the route point closest to the average tick, add average speed to the route point
                        speedTickNumber[parseInt(closestRoutePoint.index)]++;
                        allSpeedsAdded[parseInt(closestRoutePoint.index)] += averageTick.speed;
                    }
                }

                //save current tick to compute the median with the next tick
                lastTick[vehicle] = tick;

            }, function(err) {
                console.log(err);
                db.close();
            });

            //all ticks averaged and sorted to their closest route points
            //now, compute the average speed of each route point
            averageSpeed.forEach((ele, ind, arr) => {
                //when no data is given for a route point, interpolate by getting data from the nearest neighbours
                if (speedTickNumber[ind] === 0) {
                    allSpeedsAdded[ind] = allSpeedsAdded[ind - 1] + allSpeedsAdded[ind + 1];
                    speedTickNumber[ind] = speedTickNumber[ind - 1] + speedTickNumber[ind + 1];
                }

                //compute average speed
                arr[ind] = allSpeedsAdded[ind] / speedTickNumber[ind];
            });

            //save avereage speeds to local instance of route
            route.averageSpeed = averageSpeed;

            //we are done here, save the route points and their speeds as json to a line
            fs.writeFile("./routesWithAverageSpeed/" + line + " " + start + ".json", JSON.stringify(route), function(err) {
                if (err) {
                    return console.log(err);
                }

                console.log("Average Speeds for Line " + line + " from " + startTime + " to " + endTime + "  have been saved!");
            });
        });
    });
}
