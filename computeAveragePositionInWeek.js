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

//variables
let routes = {};

//load cropped routes from folder
fs.readdir('./routes/cropped/', (err, files) => {
	files.forEach(file => {

		let computedRoute = [];

		//create an array for the average positions of each vehiche every minute/ interval
		for (let iDay = 0; iDay < 7; iDay++) {
			computedRoute['day-' + iDay] = {};
			for (let iHour = 0; iHour < 24; iHour++) {
				computedRoute['day-' + iDay]['hour-' + iHour] = {};
				for (let iMinute = 0; iMinute < 60; iMinute++) {

					//get average positions for specific line and minute
					MongoClient.connect(intermediateDbUrl, function(err, db) {
						assert.equal(null, err);

						db.collection('line-' + file).find({
							$and: [{
								day: {
									$eq: iDay
								}
							},
							{
								hour: {
									$eq: iHour
								}
							},
							{
								minute: {
									$eq: iMinute
								}
							}
							]
						}).toArray((err, res) => {
							//find the avreage route point of all positions of this minute
							let positionTotal = 0;

							res.forEach((pos) => {
								positionTotal += pos.routePoint;
							});

							computedRoute['day-' + iDay]['hour-' + iHour]['minute-' + iMinute] = positionTotal / res.length;
						});
					});
				}
			}
		}

	});
});
