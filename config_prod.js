exports.config = {
  graphite: [
    {host: 'testing-graphite01.pp.local', port: 2003}
  ],
  port: 8125,
  dumpFile: 'dump.txt',
  flushInterval: 5000
};
