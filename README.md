StatsD
======

This is Tiny Speck's fork of statsd, with a bunch modifications that don't need to be merged back to trunk, but are useful to us. This includes:

* service.js wrapper
* removing the config class
* adding hostname into stat paths and making them more uniform


Modified architecture
---------------------

The original StatsD at flickr was built with a centralized design - web hosts would send UDP packets to a single StatsD server, which would then periodically aggregate the data down into 
local RRD files. Since Etsy's StatsD writes to graphite, which can be remote and is good at aggrgating at draw-time, we don't need all data to flow into one server at once. We're fairly 
network-bound in our EC2 setup, so instead of sending thousands of extra packets per second across the network, we aggregate data locally on each web host and then send simple stats to 
graphite every flush period. Once in graphite, we sum or average stats from all hosts into a single graph.

<img src="http://www.iamcal.com/images/statsd_arch.png" width="625" height="727" />


Installation
------------

If you really want to install this, create a wrapper script like init-prod.sh, pointing to the config file you want, then:

    ln -s /usr/local/statsd/init-prod.sh /etc/init.d/statsd
    chkconfig --add statsd
    chkconfig statsd on
    /etc/init.d/statsd start
