exports.config = {
  graphitePort: 2003,
  graphiteHost: 'graphite1',
  port: 8125,
  lock_file: '/var/run/statsd.pid',
  log_file : '/var/log/statsd.log',
  flushInterval: 60000,
};
