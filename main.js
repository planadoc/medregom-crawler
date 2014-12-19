/**
 * The MIT License (MIT)
 * 
 * Copyright (c) 2014 Francois Vessaz <francois.vessaz@gmail.com>
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 **/

// Imports
var fs = require('fs');
var http = require('http');
var https = require('https');
var Q = require('q');
var unzip = require('unzip');
var sax = require('sax');
var mysql = require('mysql');

// Global constants & variables
var INDEX_FILE_NAME = 'index.xlsx';
var EXTRACTED_DIR = 'index_data/';
var MYSQL_SETTINGS = {
	host: 'localhost',
	user: 'planadoc',
	password: 'planadoc',
	database: 'PLANADOC'
};
var connection2;

// Main entry point
if (process.argv[2] === '-a') {
	// -a argument: do all steps
	console.log(">> Start a complete update process...");

	Q.fcall(initDB)
		.then(downloadAllLabels)
		.then(downloadIndex)
		.then(extractIndex)
		.then(parseSharedStrings)
		.then(parseSheetAndPersist)
		.then(checkRecordsToUpdate)
		.then(displayStats)
		.catch(function(err) {
			console.log(">> " + err);
		});
} else if (process.argv[2] === '-l') {
	// -l argument: use local index instead of dowloading it
	console.log(">> Start a complete update process, without downloading the index...");

	Q.fcall(initDB)
		.then(downloadAllLabels)
		.then(extractIndex)
		.then(parseSharedStrings)
		.then(parseSheetAndPersist)
		.then(checkRecordsToUpdate)
		.then(displayStats)
		.catch(function(err) {
			console.log(">> " + err);
		});
} else if (process.argv[2] === '-r') {
	// -r argument, recovery mode
	console.log(">> Start the process in recovery mode...");

	Q.fcall(checkRecordsToUpdate, true)
		.then(displayStats)
		.catch(function(err) {
			console.log(">> " + err);
		});
} else {
	console.log(">> Use 'node main.js' with one of those arguments:\n>> -a : dowload index and update each record\n>> -l : keep index and update each record\n>> -r : update only record in ERROR state or not yet updated");
}


// Initialize the DB schema if needed
function initDB() {
	console.log(">> Checking DB...");
	var deferred = Q.defer();
	var settings = MYSQL_SETTINGS;
	settings.multipleStatements = true;
	var connection = mysql.createConnection(settings);
	var SCHEMA = 'schema.sql';

	connection.connect(function(err) {
		if (err) {
			return deferred.reject(new Error("Unable to connect DB, cause: " + err));
		}
	});
	connection.query("SHOW TABLES;", function(err, rows) {
		if (err) {
			return deferred.reject(new Error("Unable to get tables list, cause: " + err));
		}
		if (rows.length == 0) {
			console.log(">> Creating DB schema...");
			fs.readFile(SCHEMA, 'utf8', function(err, data) {
				if (err) {
					return deferred.reject(new Error("Unable to read <" + SCHEMA + ">, cause: " + err));
				}
				connection.query(data, function(err) {
					if (err) {
						return deferred.reject(new Error("Unable to create DB schema, cause: " + err));
					}
					connection.end(function(err) {
						if (err) {
							return deferred.reject(new Error("Unable to close DB connection, cause: " + err));
						}
						deferred.resolve();
					});
				});
			});
		} else {
			connection.end(function(err) {
				if (err) {
					return deferred.reject(new Error("Unable to close DB connection, cause: " + err));
				}
				deferred.resolve();
			});
		}
	});
	return deferred.promise;
}

// Get all the labels for german, french and italian.
function downloadAllLabels() {
	console.log(">> Downloading labels...");
	var deferred = Q.defer();

	var connection = mysql.createConnection(MYSQL_SETTINGS);
	Q.all([
		downloadLabels('http://www.medregom.admin.ch', 'DE', connection),
		downloadLabels('http://www.medregom.admin.ch/FR', 'FR', connection),
		downloadLabels('http://www.medregom.admin.ch/IT', 'IT', connection),
	]).catch(deferred.reject).finally(function() {
		connection.end(function(err) {
			if (err) {
				return deferred.reject(new Error("Unable to close connection to DB, cause: " + err));
			}
			deferred.resolve();
		});
	});

	return deferred.promise;
}

// Download all labels for a given language and persist them in DB
function downloadLabels(url, languageCode, connection) {
	var deferred = Q.defer();

	var parser = sax.createStream();
	var labelFor = undefined;
	var labelValue = undefined;
	parser.on('text', function(text) {
		labelValue += text;
	});
	parser.on('opentag', function(node) {
		if (node.name == 'LABEL' && node.attributes.FOR && node.attributes.FOR.split('_').length == 2) {
			labelFor = node.attributes.FOR.split('_')[1];
			labelValue = '';
		} else if (labelFor) {
			connection.query("INSERT INTO LABELS (labelFor, labelValue, language) VALUES (?,?,?)"
				+ " ON DUPLICATE KEY UPDATE labelValue = ?;",
				[labelFor,labelValue,languageCode,labelValue], function(err) {
					if (err) {
						return deferred.reject(new Error("Unable to persist labels, cause: " + err));
					}
				});
			labelFor = undefined;
			labelValue = undefined;
		}
	});
	parser.on('end', function() {
		deferred.resolve();
	});
	parser.on('error', function(err) {
		return deferred.reject(new Error("Unable to parse " + url + " to get " + languageCode + " labels, cause: " + err));
	});

	var req = http.get(url, function(res) {
		if (res.statusCode == 200) {
			res.pipe(parser)
				.on('error', function(err) {
					return deferred.reject(new Error("Unable to download " + url + ", cause: " + err));
				});
		} else {
			req.abort();
			return deferred.reject(new Error("Unable to GET " + url + ": HTTP " + res.statusCode + " (" + http.STATUS_CODES[res.statusCode] + ")"));
		}
	}).on('error', function(err) {
		return deferred.reject(new Error("Unable to connect " + url + ", cause: " + err));
	});

	return deferred.promise;
}

// Get the .xlsx file containing the index of doctors
function downloadIndex() {
	console.log(">> Downloading index...");
	var deferred = Q.defer();
	var INDEX_URL = 'https://www.medregbm.admin.ch/Publikation/CreateExcelListMedizinalPersons';

	var req = https.get(INDEX_URL, function(response) {
		if (response.statusCode == 200) {
			response.pipe(fs.createWriteStream(INDEX_FILE_NAME))
				.on('close', deferred.resolve)
				.on('error', function(err) {
					return deferred.reject(new Error("Unable to write " + INDEX_FILE_NAME + " file, cause: " + err));
				});
		} else {
			req.abort();
			return deferred.reject(new Error("Unable to GET " + INDEX_URL + ": HTTP " + response.statusCode + " (" + http.STATUS_CODES[response.statusCode] + ")"));
		}
	}).on('error', function(err) {
		return deferred.reject(new Error("Unable to connect " + INDEX_URL + ", cause: " + err));
	});

	return deferred.promise;
}

// Extract the index.xlsx file to index_data folder
function extractIndex() {
	console.log(">> Extracting index...");
	var deferred = Q.defer();

	var extractor = unzip.Extract({ path: EXTRACTED_DIR })
		.on('close', deferred.resolve)
		.on('error', function(err){
			return deferred.reject(new Error("Unable to extract files to <" + EXTRACTED_DIR + ">, cause: " + err));
		});
	fs.createReadStream(INDEX_FILE_NAME)
		.on('error', function(err) {
			return deferred.reject(new Error("Unable to read <" + INDEX_FILE_NAME + ">, cause: " + err));
		})
		.pipe(extractor);

	return deferred.promise;
}

// Parse de sharedStrings.xml file contained in index.xlsx file to get all individual strings
function parseSharedStrings() {
	console.log(">> Parsing index...");
	var deferred = Q.defer();
	var SHARED_STRING_FILE = EXTRACTED_DIR + 'xl/sharedStrings.xml';

	var parser = sax.createStream();
	var strings = [];
	parser.on('text', function(text) {
		strings.push(text);
	});
	parser.on('end', function() {
		deferred.resolve(strings);
	});
	parser.on('error', function(err) {
		return deferred.reject(new Error("While parsing <" + SHARED_STRING_FILE + ">, cause: " + err));
	});
	fs.createReadStream(SHARED_STRING_FILE)
		.on('error', function(err) {
			return deferred.reject(new Error("Unable to read <" + SHARED_STRING_FILE + ">, cause: " + err));
		})
		.pipe(parser);

	return deferred.promise;
}

// Parse the sheet.xml file contained index.xlsx file to build excel sheet
function parseSheetAndPersist(strings) {
	console.log(">> Parsing and persisting index...");
	var deferred = Q.defer();
	var SHEET_FILE = EXTRACTED_DIR + 'xl/worksheets/sheet.xml';

	var parser = sax.createStream();
	var row = undefined;
	var currentText = undefined;
	var currentCell = undefined;
	var currentCellValue = undefined;
	var updateTime = fs.statSync(INDEX_FILE_NAME).ctime;
	var connection = mysql.createConnection(MYSQL_SETTINGS);

	connection.connect(function(err) {
		if (err) {
			return deferred.reject(new Error("while connecting DB, cause: " + err));
		}
	});
	connection.query("UPDATE DOCTORS SET status = 'WILL_UPDATE';");

	parser.on('text', function(text) {
		currentText += text;
	});
	parser.on('opentag', function(node) {
		if (node.name === 'X:ROW') {
			row = {
				rowNumber: node.attributes.R
			};
		} else if (node.name === 'X:V') {
			currentText = '';
		} else if (node.name === 'X:C' && node.attributes.T === 's') {
			currentCell = node.attributes.R;
		}
	});
	parser.on('closetag', function(tagName) {
		if (tagName === 'X:ROW' && row.rowNumber > 1) {
			connection.query("INSERT INTO DOCTORS (gln, lastName, firstName, status, lastUpdate) VALUES (?,?,?,'ADDING',?)"
				+ " ON DUPLICATE KEY UPDATE status = 'UPDATING'",
				[row.gln, row.lastName, row.firstName, updateTime], function(err, rows) {
					if (err) {
						return deferred.reject(new Error("Unable to persist index row " + row.rowNumber + ", cause: " + err));
					}
				});
			row = undefined;
		} else if (tagName === 'X:V') {
			currentCellValue = currentText;
			currentText = undefined;
		} else if (tagName === 'X:C') {
			if (currentCell.charAt(0) === 'A') {
				row.gln = strings[parseInt(currentCellValue)];
			} else if (currentCell.charAt(0) === 'B') {
				row.lastName = strings[parseInt(currentCellValue)];
			} else if (currentCell.charAt(0) === 'C') {
				row.firstName = strings[parseInt(currentCellValue)];
			}
			currentCell = undefined;
			currentCellValue = undefined;
		}
	});
	parser.on('end', function() {
		connection.query("UPDATE DOCTORS SET status = 'DELETED', lastUpdate = ? WHERE status = 'WILL_UPDATE';",[new Date()]);
		connection.query("UPDATE DOCTORS SET status = 'ADDING' WHERE status = 'UPDATING' AND lastUpdate = ?;",[updateTime]);
		connection.end(function(err) {
			if (err) {
				return deferred.reject(new Error("while closing connection to DB, cause: " + err));
			}
			deferred.resolve();
		});
	});
	parser.on('error', function(err) {
		return deferred.reject(new Error("While parsing <" + SHEET_FILE + ">, cause: " + err));
	});
	fs.createReadStream(SHEET_FILE).pipe(parser);

	return deferred.promise;
}

// Check each record to update with web service in the ascending order of GLN
function checkRecordsToUpdate(recoveryMode) {
	console.log(">> Checking records to update with search form...");
	var deferred = Q.defer();

	var connection = mysql.createConnection(MYSQL_SETTINGS);
	connection2 = mysql.createConnection(MYSQL_SETTINGS);
	if (!recoveryMode) {
		connection.query("UPDATE ADDRESSES SET status = 'UPDATING' WHERE status = 'ADDED' OR status = 'NOT_MODIFIED';", function(err) {
			if (err) {
				return deferred.reject(new Error("unable to set status to UPDATING, cause: " + err));
			}
		});
		connection.query("UPDATE SPECIALIZATIONS SET status = 'UPDATING' WHERE status = 'ADDED' OR status = 'NOT_MODIFIED';", function(err) {
			if (err) {
				return deferred.reject(new Error("unable to set status to UPDATING, cause: " + err));
			}
		});
	}
	var nbRowToCheck = 0;
	var currentRow = 0;
	connection.query("SELECT COUNT(*) AS total FROM DOCTORS WHERE (status = 'UPDATING' OR status = 'ADDING' OR status = 'ERROR');", function(err, rows) {
		if (err) {
			return deferred.reject(new Error("unable to count rows to update, cause: " + err));
		}
		nbRowToCheck = rows[0].total;
	});
	var query = connection.query("SELECT * FROM DOCTORS WHERE (status = 'UPDATING' OR status = 'ADDING' OR status = 'ERROR') ORDER BY gln ASC;");
	query.on('result', function(row) {
		connection.pause();
		currentRow += 1;
		process.stdout.write(">> Progress: " + currentRow + "/" + nbRowToCheck + " (GLN " + row.gln + ")\r");

		Q.fcall(downloadRecord, row)
			.then(updateRecord)
			.catch(function(err) {
				console.log(">> " + err);
			})
			.finally(function() {
				connection.resume();
			})			
			.done();
	});
	query.on('end', function() {
		connection.end(function(err) {
			if (err) {
				return deferred.reject(new Error("while closing connection to DB, cause: " + err));
			}
			connection2.query("UPDATE ADDRESSES SET status = 'DELETED', lastUpdate = ? WHERE status = 'UPDATING';",[new Date()]);
			connection2.query("UPDATE SPECIALIZATIONS SET status = 'DELETED', lastUpdate = ? WHERE status = 'UPDATING';",[new Date()]);
			connection2.end(function(err) {
				if (err) {
					return deferred.reject(new Error("while closing connection2 to DB, cause: " + err));
				}
				deferred.resolve();
			});
		});
	});
	query.on('error', function(err) {
		return deferred.reject(new Error("with SQL query to get all GLN, cause: " + err));
	});

	return deferred.promise;
}

// Dowload an individual record for a given GLN from web service
function downloadRecord(row) {
	var deferred = Q.defer();
	var HTTP_REQ_OPTIONS = {
		host: 'www.medregom.admin.ch',
		path: '/FR/Suche/GetSearchData',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		}
	};

	var req = http.request(HTTP_REQ_OPTIONS, function(res) {
		if (res.statusCode == 200) {
			var responseString = '';
			res.setEncoding('utf8');
			res.on('data',function(data) {
				responseString += data;
			});
			res.on('end', function() {
				var response = JSON.parse(responseString);
				if (response.rows && response.rows.length == 1 && response.settings.totalrecords == 1) {
					var data = [];
					data[0] = row;
					data[1] = response;
					deferred.resolve(data);
				} else {
					req.abort();
					connection2.query("UPDATE DOCTORS SET status = 'EMPTY', lastUpdate = ? WHERE gln = ?;", [new Date(), row.gln], function(err) {
						var message = "Empty record for GLN " + row.gln;
						if (err) {
							message += "\nAdditionally an error occured while setting this row status as EMPTY: " + err;
						}
						return deferred.reject(new Error(message));
					});
				}
			});
		} else {
			req.abort();
			connection2.query("UPDATE DOCTORS SET status = 'ERROR', lastUpdate = ? where gln = ?;", [new Date(), row.gln], function(err) {
				var message = "Unable to get data for GLN " + row.gln + ": HTTP " + res.statusCode;
				if (err) {
					message += "\nAdditionally an error occured while setting this row status as ERROR: " + err;
				}
				return deferred.reject(new Error(message));
			});
		}
		res.on('error', function(err) {
			connection2.query("UPDATE DOCTORS SET status = 'ERROR', lastUpdate = ? where gln = ?;", [new Date(), row.gln], function(err2) {
				var message = "Unable to get data for GLN " + row.gln + ": cause: " + err;
				if (err2) {
					message += "\nAdditionally an error occured while setting this row status as ERROR: " + err2;
				}
				return deferred.reject(new Error(message));
			});
		});
	});
	req.write('Gln=' + row.gln);
	req.end();
	req.on('error', function(err) {
		connection2.query("UPDATE DOCTORS SET status = 'ERROR', lastUpdate = ? where gln = ?;", [new Date(), row.gln], function(err2) {
			var message = "with HTTP request for GLN " + row.gln + ", cause: " + err;
			if (err2) {
				message += "\nAdditionally an error occured while setting this row status as ERROR: " + err2;
			}
			return deferred.reject(new Error(message));
		});
	});

	return deferred.promise;
}

// Update a record in DB
function updateRecord(data) {
	var dbData = data[0];
	var rowData = data[1].rows[0];
	var settingsData = data[1].settings;
	var infoData = data[1].additionalInfo;

	if (dbData.status === 'ADDING' || dbData.status === 'ERROR') {
		for (var i=0; i<rowData.Plz.length; i++) {
			var street = '';
			if (rowData.Strasse[i]) {
				street = rowData.Strasse[i];
			}
			var plz = '';
			if (rowData.Plz[i]) {
				plz = rowData.Plz[i];
			}
			connection2.query("INSERT INTO ADDRESSES (gln, street, zip, city, status, lastUpdate) VALUES (?,?,?,?,'ADDED',?);",
				[dbData.gln, street, plz, rowData.Ort[i], new Date()], function(err) {
					if (err && err.code !== 'ER_DUP_ENTRY') {
						console.log(">> ERROR: while persisting GLN " + dbData.gln + ", cause: " + err);
					}
				});
		}
		var specialities = Object.keys(infoData.Spezialisierungen);
		for (var i=0; i<specialities.length; i++) {
			connection2.query("INSERT INTO SPECIALIZATIONS (gln, speciality, status, lastUpdate) VALUES (?,?,'ADDED',?);",
				[dbData.gln, specialities[i], new Date()], function(err) {
					if (err && err.code !== 'ER_DUP_ENTRY') {
						console.log(">> ERROR: while persisting GLN " + dbData.gln + ", cause: " + err);
					}
				});
		}
		var diplomaCode = Object.keys(infoData.Diplome)[0];
		var gender;
		if (infoData.Geschlecht[12000]) {
			gender = 'M';
		} else if (infoData.Geschlecht[12001]) {
			gender = 'F';
		}
		connection2.query("UPDATE DOCTORS SET lastName = ?, firstName = ?, diploma = ?, family = ?, license = ?, gender = ?, status = 'ADDED', lastUpdate = ? WHERE gln = ?;",
			[rowData.LastName, rowData.FirstName, diplomaCode, infoData.Diplome[999999], infoData.Bewilligungen[5002], gender, new Date(), dbData.gln], function(err) {
				if (err) {
					console.log(">> ERROR: while persisting GLN " + dbData.gln + ", cause: " + err);
				}
			});
	} else if (dbData.status === 'UPDATING') {
		for (var i=0; i<rowData.Plz.length; i++) {
			var street = '';
			if (rowData.Strasse[i]) {
				street = rowData.Strasse[i];
			}
			var plz = '';
			if (rowData.Plz[i]) {
				plz = rowData.Plz[i];
			}
			connection2.query("INSERT INTO ADDRESSES (gln, street, zip, city, status, lastUpdate) VALUES (?,?,?,?,'ADDED',?)"
				+ " ON DUPLICATE KEY UPDATE status = 'NOT_MODIFIED';",
				[dbData.gln, street, plz, rowData.Ort[i], new Date()], function(err) {
					if (err) {
						console.log(">> ERROR: while updating GLN " + dbData.gln + ", cause: " + err);
					}
				});
		}
		var specialities = Object.keys(infoData.Spezialisierungen);
		for (var i=0; i<specialities.length; i++) {
			connection2.query("INSERT INTO SPECIALIZATIONS (gln, speciality, status, lastUpdate) VALUES (?,?,'ADDED',?)"
				+ " ON DUPLICATE KEY UPDATE status = 'NOT_MODIFIED';",
				[dbData.gln, specialities[i], new Date()], function(err) {
					if (err) {
						console.log(">> ERROR: while updating GLN " + dbData.gln + ", cause: " + err);
					}
				});
		}
		var diplomaCode = Object.keys(infoData.Diplome)[0];
		var gender;
		if (infoData.Geschlecht[12000]) {
			gender = 'M';
		} else if (infoData.Geschlecht[12001]) {
			gender = 'F';
		}
		if (dbData.lastName == rowData.LastName
			&& dbData.firstName == rowData.FirstName
			&& dbData.diploma == diplomaCode
			&& dbData.family == infoData.Diplome[999999]
			&& dbData.license == infoData.Bewilligungen[5002]
			&& dbData.gender == gender) {
			connection2.query("UPDATE DOCTORS SET status = 'NOT_MODIFIED' WHERE gln = ?", [dbData.gln], function(err) {
				if (err) {
					console.log(">> ERROR: while updating GLN " + dbData.gln + ", cause: " + err);
				}
			});
		} else {
			connection2.query("UPDATE DOCTORS SET lastName = ?, firstName = ?, diploma = ?, family = ?, license = ?, gender = ?, status = 'MODIFIED', lastUpdate = ? WHERE gln = ?",
				[rowData.LastName, rowData.FirstName, diplomaCode, infoData.Diplome[999999], infoData.Bewilligungen[5002], gender, new Date(), dbData.gln], function(err) {
					if (err) {
						console.log(">> ERROR: while updating GLN " + dbData.gln + ", cause: " + err);
					}
				});
		}
	}
}

// Print stats about changes in DB
function displayStats() {
	console.log(">> Sync done!                              \n");
	var deferred = Q.defer();

	var connection = mysql.createConnection(MYSQL_SETTINGS);
	connection.query("SELECT status, COUNT(*) AS total FROM DOCTORS GROUP BY status;",function(err, rows) {
		if (err) {
			return deferred.reject(new Error("Unable to count status, cause: " + err));
		}
		console.log("TABLE DOCTORS:\n");
		console.log(rows);
		console.log("\n");
	});
	connection.query("SELECT status, COUNT(*) AS total FROM ADDRESSES GROUP BY status;",function(err, rows) {
		if (err) {
			return deferred.reject(new Error("Unable to count status, cause: " + err));
		}
		console.log("TABLE ADDRESSES:\n");
		console.log(rows);
		console.log("\n");
	});
	connection.query("SELECT status, COUNT(*) AS total FROM SPECIALIZATIONS GROUP BY status;",function(err, rows) {
		if (err) {
			return deferred.reject(new Error("Unable to count status, cause: " + err));
		}
		console.log("TABLE SPECIALIZATIONS:\n");
		console.log(rows);
		console.log("\n");
	});
	connection.end(function(err) {
		if (err) {
			return deferred.reject(new Error("While closing connection: " + err));
		}
		deferred.resolve();
	});

	return deferred.promise;
}