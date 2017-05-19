//TODO multithreaden

const fs = require('fs'),
	//readline = require('readline'),
	MongoClient = require('mongodb').MongoClient,
	assert = require('assert'),
	geodist = require('geodist'),
	chron = require('async');

let startTime = 1491979144,
	endTime = startTime + 3600;

// Test Db connection
const dbUrl = 'mongodb://localhost:27017/busradar';
// Use connect method to connect to the DB
MongoClient.connect(dbUrl, function(err, db) {
	assert.equal(null, err);
	console.log('Connected correctly to DB');

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
				if (typeof line !== 'undefined' && line !== null && line !== '') {
					//save longitude and latitude
					line = line.split(',');
					routes[file].lon.push(line[0]);
					routes[file].lat.push(line[1]);
				}
			});

			let computedRoute = {
				lat: routes[file].lat,
				lon: routes[file].lon
			};

			let computedRouteTotalAverage = [];

			//instantiate temporary arrays
			for (let iDay = 0; iDay < 7; iDay++) {
				computedRouteTotalAverage[iDay] = [];
				for (let iHour = 0; iHour < 24; iHour++) {
					computedRouteTotalAverage[iDay][iHour] = {};
				}
			}

			computedRoute.allSpeedsAdded = [];
			computedRoute.speedTickNumber = [];

			chron.whilst(() => {
				return endTime < Date.now() / 1000; //1491979144 + 3600 * 20;//
			}, (callback) => {

				computeAverageRouteSpeedInHourPerLine(startTime, endTime, file, routes[file], (allSpeedsAdded, speedTickNumber) => {

					let directions = Object.keys(allSpeedsAdded);

					//sort result by startTime
					let date = new Date(startTime * 1000);
					let day = date.getDay();
					let hour = date.getHours();

					//increment start- and endtime
					startTime += 3600;
					endTime += 3600;

					//add speeds and ticknumber to sorted array for each direction
					directions.forEach((direction) => {
						routes[file].lat.forEach((ele, ind, arr) => {
							//instantiate arrays and fill with zeroes if neccesary
							if (!(computedRouteTotalAverage[day][hour][direction] instanceof Object)) {
								computedRouteTotalAverage[day][hour][direction] = {};
								computedRouteTotalAverage[day][hour][direction].speedTickNumber = [];
								computedRouteTotalAverage[day][hour][direction].allSpeedsAdded = [];
								computedRouteTotalAverage[day][hour][direction].averageSpeed = [];

								routes[file].lat.forEach((ele, ind, arr) => {
									computedRouteTotalAverage[day][hour][direction].speedTickNumber.push(0);
									computedRouteTotalAverage[day][hour][direction].allSpeedsAdded.push(0);
								});
							}

							computedRouteTotalAverage[day][hour][direction].allSpeedsAdded[ind] += allSpeedsAdded[direction][ind];
							computedRouteTotalAverage[day][hour][direction].speedTickNumber[ind] += speedTickNumber[direction][ind];
						});
					});

					console.log('Average Speeds for Line ' + file + ', day ' + day + ', hour ' + hour + ' have been processed!');
					callback(null, null);
				});

			}, (err, res) => {

				console.dir(computedRouteTotalAverage);

				fs.writeFile('./routesWithAverageSpeed/' + file + '-debug.json', JSON.stringify(computedRouteTotalAverage), function(err) {
					if (err) {
						return console.log(err);
					}
					console.log('Route ' + file + 'has been saved!');
				});

				//compute average values for each day, hour and route tick
				for (let dayInd = 0; dayInd < 7; dayInd++) {
					for (let hourInd = 0; hourInd < 24; hourInd++) {
						let directions = Object.keys(computedRouteTotalAverage[dayInd][hourInd]);

						directions.forEach((direction) => {
							let hasValuesFlag = false;

							computedRoute.lat.forEach((ele, ind) => {

								//check if values are set
								let newAverageSpeed = computedRouteTotalAverage[dayInd][hourInd][direction].allSpeedsAdded[ind] / computedRouteTotalAverage[dayInd][hourInd][direction].speedTickNumber[ind];

								//console.log(newAverageSpeed);
								if (!isNaN(newAverageSpeed)) {
									//console.log(newAverageSpeed);
									hasValuesFlag = true;
									computedRouteTotalAverage[dayInd][hourInd][direction].averageSpeed[ind] = newAverageSpeed;

								}
							});

							//delete computiation data arrays
							delete computedRouteTotalAverage[dayInd][hourInd][direction].speedTickNumber;
							delete computedRouteTotalAverage[dayInd][hourInd][direction].allSpeedsAdded;

							//delete averagespeedArray if it has no values
							if (!hasValuesFlag) {
								console.log('delete averagespeed');
								delete computedRouteTotalAverage[dayInd][hourInd][direction].averageSpeed;
							} else {
								console.log('Average Speeds for Line ' + file + ', day ' + dayInd + ', hour ' + hourInd + ', Direction: '+direction+', have been saved!');
							}
						});
					}
				}

				console.dir(computedRouteTotalAverage);
				//console.log(JSON.stringify(computedRouteTotalAverage));

				//we are done here, save the route points and their speeds as json to a line
				fs.writeFile('./routesWithAverageSpeed/' + file + '.json', JSON.stringify(computedRouteTotalAverage), function(err) {
					if (err) {
						return console.log(err);
					}
					console.log('Route ' + file + 'has been saved!');
				});
			});
		});
	});
});

function computeAverageRouteSpeedInHourPerLine(start, end, line, route, callback) {

	//get ticks for specific line from db
	MongoClient.connect(dbUrl, function(err, db) {
		assert.equal(null, err);

		db.collection('line-' + line).find({
			$and: [{
				LastModified: {
					$gte: start + 1
				}
			},
			{
				LastModified: {
					$lte: end
				}
			}
			]
		}).sort({
			'timestamp': 1
		}).toArray((err, resUnsorted) => {

			//break if no result
			if (typeof resUnsorted === 'undefined') {
				return;
			}

			let resSortedByDestination = {};
			let speedTickNumber = {};
			let allSpeedsAdded = {};

			//sort results by directions
			resUnsorted.forEach((tick) => {
				if (!(resSortedByDestination[tick.ZielShort] instanceof Array)) {
					resSortedByDestination[tick.ZielShort] = [];
					allSpeedsAdded[tick.ZielShort] = [];
					speedTickNumber[tick.ZielShort] = [];
					//fill helper arrays with zeroes
					route.lat.forEach(() => {
						allSpeedsAdded[tick.ZielShort].push(0);
						speedTickNumber[tick.ZielShort].push(0);
					});
				}
				resSortedByDestination[tick.ZielShort].push(tick);
			});

			for (let destination in resSortedByDestination) {

				//let averageSpeed = [];

				//fill helper arrays with as many values as their are route markers
				/*
				route.lat.forEach(() => {
					//averageSpeed.push(0);
				});
				*/

				//save the last tick
				let lastTick = [];

				//iterate all ticks selected
				resSortedByDestination[destination].forEach((tick) => {
					//save current vehicle to differentiate between ticks of different vehicles
					let vehicle = tick.vehicleId;

					//check if last tick is set and some time has passed
					if (typeof lastTick[vehicle] !== 'undefined' && tick.LastModified - lastTick[vehicle].LastModified > 0) {

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
						route.lat.forEach((lat, ind) => {

							//get lon matching to lat
							let lon = route.lon[ind];
							//sanity check
							if (typeof lat !== 'undefined' && typeof lon !== 'undefined') {

								let distanceToCurrentRoutePoint = geodist({
									lat: lat,
									lon: lon
								}, {
									lat: averageTick.lat,
									lon: averageTick.lon
								}, {
									exact: true,
									unit: 'meters'
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
						if (typeof speedTickNumber[tick.ZielShort][parseInt(closestRoutePoint.index)] !== 'undefined') {
							//now that we know the route point closest to the average tick, add average speed to the route point
							speedTickNumber[tick.ZielShort][parseInt(closestRoutePoint.index)]++;
							allSpeedsAdded[tick.ZielShort][parseInt(closestRoutePoint.index)] += averageTick.speed;
						}
					}

					//save current tick to compute the median with the next tick
					lastTick[vehicle] = tick;

				}, function(err) {
					console.log(err);
					db.close();
				});

				/*

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

				*/
			}

			callback(allSpeedsAdded, speedTickNumber);
		});
	});
}
