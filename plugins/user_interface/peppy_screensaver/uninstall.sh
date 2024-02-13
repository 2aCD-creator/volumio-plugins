#!/bin/bash

# Uninstall dependendencies
# apt-get remove -y

ID=$(awk '/VERSION_ID=/' /etc/*-release | sed 's/VERSION_ID=//' | sed 's/\"//g')
# set current directory
dest_path=/data/plugins/user_interface/peppy_screensaver
cd $dest_path

########################################
# remove additional output for Peppymeter
MPD=/volumio/app/plugins/music_service/mpd/mpd.conf.tmpl
echo "___Restore additional peppymeter output..."
df $MPD | grep $MPD && sudo umount $MPD

node createConf.js

########################################
# for jessie
if [ ! "$ID" = "10" ]; then
    echo "___Restore additional modifications for jessie..."

	# restore airplay template
	AIR=/volumio/app/plugins/music_service/airplay_emulation/shairport-sync.conf.tmpl
    df $AIR | grep $AIR && sudo umount $AIR

    node restoreAsound.js
fi


#sudo systemctl restart mpd
    
echo "Done"
echo "pluginuninstallend"