//TODO multithreaden

const fs = require('fs');

let routes = {};

//load average speeds from folder
fs.readdir('./routesWithAverageSpeed/', (err, files) => {
	files.forEach(file => {
		console.log(file);
		routes[file] = {
			//longitude and latidute from route files
			lat: [],
			lon: []
		};
		fs.readFile('./routesWithAverageSpeed/' + file, 'utf-8', (err, data) => {
			let line = file.replace('.json', '');
			data = JSON.parse(data);

			let routeSpeedDeltas = [];

			//instantiate temporary arrays
			for (let iDay = 0; iDay < 7; iDay++) {
				routeSpeedDeltas[iDay] = [];
				for (let iHour = 0; iHour < 24; iHour++) {
					routeSpeedDeltas[iDay][iHour] = {};
				}
			}

			//iterate all average speeds and compute deltas
			for (let dayInd = 0; dayInd < 7; dayInd++) {
				for (let hourInd = 0; hourInd < 24; hourInd++) {
					let directions = Object.keys(data[dayInd][hourInd]);

					let lastTick = null;

					directions.forEach((direction) => {
						data[dayInd][hourInd][direction].averageSpeed.forEach((averageSpeed, ind, arr) => {
							//instantiate arrays and fill with zeroes if neccesary
							if (!(routeSpeedDeltas[dayInd][hourInd][direction] instanceof Object)) {
								routeSpeedDeltas[dayInd][hourInd][direction] = {};
								routeSpeedDeltas[dayInd][hourInd][direction] = [];

								data[dayInd][hourInd][direction].averageSpeed.forEach((ele, ind, arr) => {
									routeSpeedDeltas[dayInd][hourInd][direction].push(0);
								});
							}
							//delta speed is the difference between speeds between two ticks, the route point is inbetween the last two ticks
							if (lastTick !== null && averageSpeed !== null) {
								let indexBetweenTicks = lastTick.index+parseInt((ind-lastTick.index)/2);
								routeSpeedDeltas[dayInd][hourInd][direction][indexBetweenTicks] = lastTick.averageSpeed-averageSpeed;
							}
							//save last ticks
							if(averageSpeed !== null) {
								lastTick = {
									averageSpeed: averageSpeed,
									index: ind
								};
							}
						});
					});
				}
			}

			console.log('Average Speed Deltas for Line ' + line +' have been processed!');
			//console.log(JSON.stringify(routeSpeedDeltas));

			//we are done here, save the route points and their speeds as json to a line
			fs.writeFile('./averageSpeedDeltas/' + line + '.json', JSON.stringify(routeSpeedDeltas), function(err) {
				if (err) {
					return console.log(err);
				}
				console.log('Route ' + line + ' has been saved!');
			});
		});
	});
});
