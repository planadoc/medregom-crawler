medregom-crawler
================

**Builds a mysql database of health professionals in Switzerland based on information available on [medregom.admin.ch](http://medregom.admin.ch)**

## Requirements

* Node & NPM
* A MySQL database

## Installation

* Edit `main.js` to set database connection settings (`MYSQL_SETTINGS`)
* `npm install`

## Usage

`node main.js -a`: dowload index and update each record

* Create database schema if needed
* Download all labels
* Download index of health professionals
* Persist index in database
* For each health professional, get information from web service
* Display stats

`node main.js -l`: keep index and update each record

* Create database schema if needed
* Download all labels
* Use local index of health professionals (`index.xlsx`)
* Persist index in database
* For each health professional, get information from web service
* Display stats

`node main.js -r`: update only record in `ERROR` state or not updated yet

* For each health professional in `ADDING`, `UPDATING` or `ERROR` state, get information from web service
* Display stats
