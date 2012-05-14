var Statsd = require('./statsd').Statsd;
var exec = require('child_process').exec,
    fs = require('fs');


var node = process.argv.shift();
var file = process.argv.shift();
var config_file = process.argv.shift();
var dumpfile = process.argv.shift();
var start = process.argv.shift() || null;
process.argv.unshift(file);
process.argv.unshift(node);

// this needs to be an abs path, or relative to the cd
var config = require(config_file).config;

Statsd.config = config;

//
// head -1000 input > output && tail -n +1000 input > input.tmp && cp input.tmp input && rm input.tmp

function readChunkFromFile(chunkSize) {
  var stat = fs.statSync(dumpfile);
  if (stat.size > 0) {
    exec(['head -', chunkSize, ' ', dumpfile, ' > ', dumpfile, '.reading && tail -n +', chunkSize, ' ', dumpfile, ' > ', dumpfile, '.tmp && cp ', dumpfile, '.tmp ', dumpfile, ' && rm ', dumpfile, '.tmp'].join(''), function(err, stdout, stderr) {
      if (err) {
        throw(stderr);
      } else {
        Statsd.readFromDumpFile(dumpfile + '.reading', start, function(read) {
          console.log('Finished read ', read, 'lines');
          readChunkFromFile(chunkSize);
        });
      }
    });
  } else {
    console.log('Done');
    setTimeout(function() {
      process.exit(0);
    }, 10000);
  }
};

readChunkFromFile(10000);
