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

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

CREATE TABLE `LABELS` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `labelFor` int(11) NOT NULL,
  `labelValue` varchar(128) NOT NULL DEFAULT '',
  `language` char(2) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `LABEL_LANGUAGE` (`labelFor`,`language`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `DOCTORS` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `gln` varchar(13) NOT NULL DEFAULT '',
  `lastName` varchar(64) NOT NULL DEFAULT '',
  `firstName` varchar(64) NOT NULL DEFAULT '',
  `diploma` int(11) DEFAULT NULL,
  `family` tinyint(1) unsigned DEFAULT NULL,
  `license` tinyint(1) unsigned DEFAULT NULL,
  `gender` char(1) DEFAULT NULL,
  `status` varchar(12) NOT NULL DEFAULT '',
  `lastUpdate` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `GLN` (`gln`),
  KEY `DOCTORS_LABELS` (`diploma`),
  CONSTRAINT `DOCTORS_LABELS` FOREIGN KEY (`diploma`) REFERENCES `LABELS` (`labelFor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `ADDRESSES` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `gln` varchar(13) NOT NULL DEFAULT '',
  `street` varchar(64) NOT NULL DEFAULT '',
  `zip` varchar(11) NOT NULL DEFAULT '',
  `city` varchar(64) NOT NULL DEFAULT '',
  `status` varchar(12) NOT NULL DEFAULT '',
  `lastUpdate` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ADDRESSES` (`gln`,`street`,`zip`,`city`),
  CONSTRAINT `ADDRESSES_DOCTORS` FOREIGN KEY (`gln`) REFERENCES `DOCTORS` (`gln`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `SPECIALIZATIONS` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `gln` varchar(13) NOT NULL DEFAULT '',
  `speciality` int(11) NOT NULL,
  `status` varchar(12) NOT NULL DEFAULT '',
  `lastUpdate` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `SPECIALIZATIONS` (`gln`,`speciality`),
  KEY `SPECIALIZATIONS_LABELS` (`speciality`),
  CONSTRAINT `SPECIALIZATIONS_DOCTORS` FOREIGN KEY (`gln`) REFERENCES `DOCTORS` (`gln`),
  CONSTRAINT `SPECIALIZATIONS_LABELS` FOREIGN KEY (`speciality`) REFERENCES `LABELS` (`labelFor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
