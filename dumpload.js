var Statsd = require('./statsd').Statsd;
var exec = require('child_process').exec;


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

Statsd.readFromDumpFile(dumpfile, start, function(read) {
  console.log('Finished read ', read, 'lines');
  // truncate the file to read bytes
  exec(['tail -n +', read, ' ', dumpfile, ' > ', dumpfile + '.tmp'].join(''), function(err, stdout, stderr) {
    process.exit(err ? 1 : 0);
  });
});
