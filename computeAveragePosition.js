//this script computes the average position of a bus line at a given time interval

//TODO sort result by vehicle
//TODO sort results by arrival location


const fs = require('fs'),
	MongoClient = require('mongodb').MongoClient,
	assert = require('assert'),
	chron = require('async'),
	geodist = require('geodist');

let startTime = 1491979144,
	interval = 1 * 60;

// Test Db connection
const dbUrl = 'mongodb://localhost:27017/busradar';
const intermediateDbUrl = 'mongodb://localhost:27017/busradar-average-positions-intermediate';
const resultDbUrl = 'mongodb://localhost:27017/busradar-average-positions';

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

			//start loop
			chron.whilst(() => {
				return startTime + interval < Date.now() / 1000;
			}, (callback) => {
				computeAveragePositionInIntervalPerLine(startTime, file, routes[file], (positions) => {
					console.log(positions);

					//sort result by startTime
					let date = new Date(startTime * 1000);
					let day = date.getDay();
					let hour = date.getHours();
					let minute = date.getMinutes();

					//increment startTime
					startTime += interval;

					//add date to positions
					positions.forEach((ele, ind, arr) => {
						ele.date = date;
						ele.day = day;
						ele.hour = hour;
						ele.minute = minute;
					});

					if (typeof positions[0] !== 'undefined') {

						MongoClient.connect(intermediateDbUrl, function(err, db) {
							assert.equal(null, err);

							db.collection('line-' + file).bulkWrite(positions, (err, res) => {
								db.close();
							});
						});
					}

					console.log('Average Positions for Line ' + file + ', day ' + day + ', hour ' + hour + ', minute ' + minute + ' have been processed!');
					callback(null, null);
				});

			}, (err, res) => {
				/*
								console.log('Computing average positions...');

								for (let iDay = 0; iDay < 7; iDay++) {
									for (let iHour = 0; iHour < 24; iHour++) {
										for (let iMinute = 0; iMinute < 60; iMinute++) {
											//delete array if empty
											if (computedRoute['day-' + iDay]['hour-' + iHour]['minute-' + iMinute][0].length == 0) {
												delete computedRoute['day-' + iDay]['hour-' + iHour]['minute-' + iMinute];
												continue;
											}
											for (let iVehicle = 0; iVehicle < 10; iVehicle++) {

												//delete array if empty
												if (computedRoute['day-' + iDay]['hour-' + iHour]['minute-' + iMinute][iVehicle].length == 0) {
													delete computedRoute['day-' + iDay]['hour-' + iHour]['minute-' + iMinute][iVehicle];
													continue;
												}

												let routePointTotal = 0;

												//add together positions
												computedRoute['day-' + iDay]['hour-' + iHour]['minute-' + iMinute][iVehicle].forEach((pos, ind, arr) => {
													routePointTotal += pos;
												});

												computedRoute['day-' + iDay]['hour-' + iHour]['minute-' + iMinute][iVehicle] = parseInt(routePointTotal / computedRoute['day-' + iDay]['hour-' + iHour]['minute-' + iMinute][iVehicle].length);

											}
										}
									}
								}

								//delete route points from result
								delete computedRoute.lon;
								delete computedRoute.lat;

								console.log(computedRoute);
								console.log(JSON.stringify(computedRoute));

								//we are done here, save the route points and their speeds as json to a line
								fs.writeFile('./routesWithAveragePosition/' + file + '.json', JSON.stringify(computedRoute), function(err) {
									if (err) {
										return console.log(err);
									}
									console.log('Route ' + file + 'has been saved!');

								});
							});
							*/
			});
		});
	});
});

function computeAveragePositionInIntervalPerLine(start, line, route, callback) {

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
					$lte: start + interval
				}
			}
			]
		}).toArray((err, res) => {

			let positionArray = [];

			let averagePositions = [];

				//break if no result
			if (typeof res === 'undefined') {
				return;
			}

				//iterate all ticks selected
			res.forEach((tick) => {
					//save current vehicle to differentiate between ticks of different vehicles
				let vehicle = tick.vehicleId;
					/*
									//search ofr vehicle id
									let vehicleIndex = vehicleArray.indexOf(vehicle);

									//push vehicle to vehicle array if not found
									if (vehicleIndex <= -1) {
										vehicleArray.push(vehicle);
										vehicleIndex = vehicleArray.indexOf(vehicle);
										positionArray[vehicleIndex] = [];
									}
					*/
					//console.dir(averageTick);

				let closestRoutePoint = {
					index: 0,
					distance: Number.MAX_SAFE_INTEGER
				};

					//FIND NEAREST ROUTE POINT TO TICK
				route.lat.forEach((lat, ind) => {

						//get lon matching to lat
					let lon = route.lon[ind];
						//sanity check
					if (typeof lat !== 'undefined' && typeof lon !== 'undefined') {

						let distanceToCurrentRoutePoint = geodist({
							lat: lat,
							lon: lon
						}, {
							lat: tick.lat,
							lon: tick.lon
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

					//create array for positions if it does not exits
				if (!(positionArray[vehicle] instanceof Array)) {
					positionArray[vehicle] = [];
				}

				let position = {
					routePoint: closestRoutePoint.index,
					line: tick.line,
					arrival: tick.ZielShort,
					vehicle: vehicle
				};

				positionArray[vehicle].push(position);

			});

				//compute average positions
			Object.keys(positionArray).forEach(function(key, ind, arr) {
				let positionTotal = 0;
				let posCount = 0;

				positionArray[key].forEach((pos, posInd) => {
					positionTotal += pos.routePoint;
					posCount++;
				});

				positionArray[key][0].routePoint = parseInt(positionTotal / posCount);
				averagePositions[ind] = positionArray[key][0];

			});


			callback(averagePositions);
		},
			function(err) {
				console.log(err);
				db.close();
			});

	});
}
