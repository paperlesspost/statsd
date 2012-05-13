#!/usr/bin/env node

var Statsd = require('./statsd').Statsd;

var node = process.argv.shift();
var file = process.argv.shift();
var config_file = process.argv.shift();

process.argv.unshift(file);
process.argv.unshift(node);

// this needs to be an abs path, or relative to the cd
var config = require(config_file).config;

// start it up
Statsd.start(config);
