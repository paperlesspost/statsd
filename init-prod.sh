#!/bin/sh
# chkconfig: 2345 95 20
# description: statsd
# processname: node

/usr/local/statsd/stats.js '/usr/local/statsd/config_prod.js' "$@"
