#!/usr/bin/env node

var dgram  = require('dgram')
  , util    = require('util')
  , net    = require('net')
  , fs     = require('fs')

var node = process.argv.shift();
var file = process.argv.shift();
var config_file = process.argv.shift();

process.argv.unshift(file);
process.argv.unshift(node);

// this needs to be an abs path, or relative to the cd
var config = require(config_file).config;

var counters = {};
var timers = {};
var gauges = {};
var gauges_sent = {};
var debugInt, flushInt, server;
var _makeArray = function(nonarray) { return Array.prototype.slice.call(nonarray); };
var nonNull = function(el) { return !!el };
// make a graphite key, assumes the last two args are value and timestamp
// and everything before that is a key to be joined by '.'
var makeGraphiteKey = function() {
  var args = _makeArray(arguments);
  var ts = args.pop(),
      val = args.pop();

  return [args.filter(nonNull).join('.'), val, ts].join(' ');
};

var Statsd = {
  server: null,
  flushInterval: null,

  start: function() {
    console.log('Statsd starting', Date().toString());
    if (!this.server) {
      var port = config.port || 8125;
      this.server = dgram.createSocket('udp4', this.handleUDPMessage);
      this.server.bind(port);
      console.log("Listening for UDP packets on ", port);
    }
    if (!this.flushInterval) {
      var frequency = Number(config.flushInterval || 10000);
      var statsd = this;
      this.flushInterval = setInterval(function () {
        var statString = statsd.processStats();
        statsd.logStatus(statString);
        process.nextTick(function() {
          statsd.sendToGraphite(statString);
        });
      }, frequency);
      console.log("Flushing to graphite every ", frequency);
    }
  },

  processStats: function() {
    var statString = '';
    var ts = Math.round(new Date().getTime() / 1000);
    var numStats = 0;
    var key;

    for (key in counters) {
      var value = counters[key] / (flushInterval / 1000);
      var message = "";
      message += makeGraphiteKey('stats.counters', key, config.hostname, 'value', value, ts) + "\n";
      message += makeGraphiteKey('stats.counters', key, config.hostname, 'count', counters[key], ts) + "\n";
      statString += message;
      delete counters[key];

      numStats += 1;
    }

    for (key in timers) {
      if (timers[key].length > 0) {
        var percents = config.percents || [10,50,90];

        var values = timers[key].sort(function (a,b) { return a-b; });
        var count = values.length;
        var min = values[0];
        var max = values[count - 1];

        var percent_values = {}, i = 0, l = percents.length;
        for (; i < l; i++) {
          var idx = (count - Math.round(((100 - percents[i]) / 100) * count)) - 1;
          if (idx < 0) idx = 0;
          percent_values["percent_"+percents[i]] = values[idx];
        }

        var sum = 0, i = 0;
        for (; i < count; i++) sum += values[i];
        var mean = sum / count;

        delete timers[key];

        var message = "";
        message += makeGraphiteKey('stats.timers', key, config.hostname, 'min', min, ts) + "\n";
        message += makeGraphiteKey('stats.timers', key, config.hostname, 'max', max, ts) + "\n";
        message += makeGraphiteKey('stats.timers', key, config.hostname, 'mean', mean, ts) + "\n";
        message += makeGraphiteKey('stats.timers', key, config.hostname, 'count', count, ts) + "\n";
        for (var i in percent_values) {
          message += makeGraphiteKey('stats.timers', key, config.hostname, i, percent_values[i], ts) + "\n";
        }
        statString += message;

        numStats += 1;
      }
    }

    for (key in gauges) {
       statString += gauges[key].map(function(value) {
         numStats += 1;
         return makeGraphiteKey('stats.gauges', key, value[0], value[1]);
       }).join("\n") + "\n";
       gauges_sent[key] = true;
    }

    statString += makeGraphiteKey('statsd', config.hostname, 'numStats', numStats, ts) + "\n";

    return statsString;
  },

  sendToGraphite: function(statString) {
    try {
      var graphite = net.createConnection(config.graphitePort, config.graphiteHost);
      graphite.on('error', function(err) {
        //log error'd stats in case we want to get them later
        //this is a common case - we shouldn't go down just because graphite is down
        console.log('error', err);
        console.log(statString);
      });
      graphite.on('connect', function() {
        this.write(statString);
        console.log('Wrote to graphite ', statString.length);
        this.end();
      });
    } catch(e){
      //log error'd stats in case we want to get them later
      console.log("Error: " + e);
      console.log(statString);
    }
  },

  handleUDPMessage: function (msg, rinfo) {
    if (config.dumpMessages) { console.log(msg.toString()); }
    var bits = msg.toString().split(':');
    var key = bits.shift()
                  .replace(/\s+/g, '_')
                  .replace(/\//g, '-')
                  .replace(/[^a-zA-Z_\-0-9\.]/g, '');

    if (key && bits.length >= 1) {
      var i = 0, l = bits.length;
      for (; i < l; i++) {
        var sampleRate = 1;
        var fields = bits[i].split("|");
        if (fields[1] === undefined) {
          console.log('Bad line: ' + fields);
          return null;
        }
        if (fields[1].trim() == "g") {
            if (!gauges[key] || gauges_sent[key]) {
              gauges[key] = [];
              gauges_sent[key] = false;
            }
            gauges[key].push([fields[0], Math.round(Date.now() / 1000)]);
        } else if (fields[1].trim() == "ms") {
          if (!timers[key]) {
            timers[key] = [];
          }
          timers[key].push(Number(fields[0] || 0));
        } else {
          if (fields[2] && fields[2].match(/^@([\d\.]+)/)) {
            sampleRate = Number(fields[2].match(/^@([\d\.]+)/)[1]);
          }
          if (!counters[key]) {
            counters[key] = 0;
          }
          counters[key] += Number(fields[0] || 1) * (1 / sampleRate);
        }
      }
    }
  },

  logStatus: function(statsString) {
    console.log("\n Stats string: ", statString.length, "counters", counters.toString().length, "timers", timers.toString().length, "gauges", gauges.toString().length);
    console.log("\n *** RSS: ", process.memoryUsage().rss / 1024 / 1024, "mb")
  }
};

// start it up
Statsd.start();
