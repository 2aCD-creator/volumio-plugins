#!/bin/bash
cd /data/plugins/miscellanea/peppy_screensaver/peppymeter

if ! pgrep -x "python3" > /dev/null
then
	export DISPLAY=:0
	python3 volumio_peppymeter.py
fi
