#!/bin/sh

dumpfile=$2
cat $dumpfile >> ${dumpfile}.reading
> $dumpfile
node ./dumpload.js $1 $dumpfile.reading && cp ${dumpfile}.reading.tmp $dumpfile.reading
