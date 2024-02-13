#!/bin/bash
cd /data/plugins/user_interface/peppy_screensaver/peppymeter

#if ! pgrep -x "python3" > /dev/null
#then
	export DISPLAY=:0
	python3 volumio_peppymeter.py
#fi
