#!/usr/bin/env node

var dgram  = require('dgram')
  , util   = require('util')
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
  flushInt: null,
  flushInterval: config.flushInterval || 10000,
  port: config.port || 8125,

  start: function() {
    console.log('Statsd starting', Date().toString());
    if (!this.server) {
      this.server = dgram.createSocket('udp4', this.handleUDPMessage);
      this.server.bind(this.port);
      console.log("Listening for UDP packets on", this.port);
    }
    if (!this.flushInt) {
      var statsd = this;
      this.flushInt = setInterval(function () {
        var statString = statsd.processStats();
        statsd.logStatus(statString);
        process.nextTick(function() {
          statsd.sendToGraphite(statString);
        });
      }, this.flushInterval);
      console.log("Flushing to graphite every", this.flushInterval);
    }
  },

  processStats: function() {
    var statString = '';
    var ts = Math.round(new Date().getTime() / 1000);
    var numStats = 0;
    var key;

    for (key in counters) {
      var value = counters[key] / (this.flushInterval / 1000);
      var message = "";
      message += makeGraphiteKey('stats.counters', key, config.hostname, 'value', value, ts) + "\n";
      message += makeGraphiteKey('stats.counters', key, config.hostname, 'count', counters[key], ts) + "\n";
      statString += message;
      counters[key] = 0;

      numStats += 1;
    }

    for (key in timers) {
      if (timers[key].length > 0) {
        var timer = timers[key];
        timers[key] = [];
        var percents = config.percents || [10,50,90];

        var values = timer.sort(function (a,b) { return a-b; });
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

    return statString;
  },

  sendToGraphite: function(statString) {
    try {
      var pipeline = config.pipeline || 5;
      var statsd = this;
      statsd.pipeline = statsd.pipeline || 0;
      var close = function(graphite) {
        console.log('Closing connection to graphite');
        graphite.end();
        delete statsd['graphite'];
      };
      var write = function(graphite) {
        graphite.write(statString);
        console.log('Wrote to graphite ', statString.length);
        statsd.pipeline++;
        if (statsd.pipeline > pipeline) {
          close(graphite);
          statsd.pipeline = 0;
        }
      };
      if (!statsd.graphite) {
        statsd.graphite = net.createConnection(config.graphitePort, config.graphiteHost);
        statsd.graphite.on('error', function(err) {
          //log error'd stats in case we want to get them later
          //this is a common case - we shouldn't go down just because graphite is down
          console.log('error', err);
          console.log(statString);
          close(this);
        });
        statsd.graphite.on('end', function() { close(this); });
        statsd.graphite.on('close', function() { close(this); });
        statsd.graphite.on('connect', function() {
          console.log('Opened new connection to graphite');
          write(this);
        });
      } else {
        write(statsd.graphite);
      }
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

  logStatus: function(statString) {
    console.log("\n Stats string: ", statString.length, "counters", util.inspect(counters).length, "timers", util.inspect(timers).length, "gauges", util.inspect(gauges).length);
    console.log("\n *** RSS: ", process.memoryUsage().rss / 1024 / 1024, "mb")
  }
};

// start it up
Statsd.start();
