//this script computes the average position of a bus line at a given time interval

//TODO sort result by vehicle
//TODO sort results by arrival location


const fs = require('fs'),
	MongoClient = require('mongodb').MongoClient,
	assert = require('assert');

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

//load cropped routes from folder
fs.readdir('./routes/cropped/', (err, files) => {
	files.forEach(file => {

		let computedRoute = [];

		//fill temporary arrays with enough zeroes
		for (let iDay = 0; iDay < 7; iDay++) {
			computedRoute[iDay] = [];
			for (let iHour = 0; iHour < 24; iHour++) {
				computedRoute[iDay][iHour] = [];
				for (let iMinute = 0; iMinute < 24; iMinute++) {
					computedRoute[iDay][iHour][iMinute] = [];
				}
			}
		}

		//create an array for the average positions of each vehiche every minute/ interval

		let computeNextMinute = function(line, day, hour, minute, pos) {
/*
			console.log('min'+minute);
			console.log('hour '+hour);
			console.log('day '+day);
			*/
			computedRoute[day][hour][minute] = pos;

			console.log(computedRoute[day][hour][minute]);

			if (minute < 59) {
				++minute;
				computeAveragePositionOverWeek(line, day, hour, minute, computeNextMinute);
			} else if (hour < 23) {
				minute = 0;
				++hour;
				computeAveragePositionOverWeek(line, day, hour, minute, computeNextMinute);
			} else if (day < 6) {
				minute = 0;
				hour = 0;
				++day;
				computeAveragePositionOverWeek(line, day, hour, minute, computeNextMinute);
			} else {
				console.log(computedRoute);
				fs.writeFile('./averagePositionOverWeek/' + file + '.json', JSON.stringify({route : computedRoute}), function(err) {
					if (err) {
						return console.log(err);
					}
					console.log('Route ' + file + 'has been saved!');
				});
			}
		};

		computeNextMinute(file, 0, 0, 0, null);
	});
});

let computeAveragePositionOverWeek = function(line, day, hour, minute, callback) {
	//get average positions for specific line and minute
	MongoClient.connect(intermediateDbUrl, function(err, db) {
		assert.equal(null, err);

		db.collection('line-' + line).find({
			$and: [{
				day: {
					$eq: day
				}
			},
			{
				hour: {
					$eq: hour
				}
			},
			{
				minute: {
					$eq: minute
				}
			}
			]
		}).toArray((err, res) => {

			//find the avreage route point of all positions of this minute
			let averagePositions = {};

			res.forEach((pos) => {
				if(!(averagePositions[pos.arrival] instanceof Array)) {
					averagePositions[pos.arrival] = [];
				}

				averagePositions[pos.arrival].push(pos.routePoint);
			});

			callback(line, day, hour, minute, averagePositions);
		});
	});


};
