#!/bin/bash

# Uninstall dependendencies
# apt-get remove -y

ID=$(awk '/VERSION_ID=/' /etc/*-release | sed 's/VERSION_ID=//' | sed 's/\"//g')
# set current directory
dest_path=/data/plugins/miscellanea/peppy_screensaver


########################################
# remove additional output for Peppymeter
MPD=/volumio/app/plugins/music_service/mpd/mpd.conf.tmpl
if grep -q '"mpd_peppyalsa"' $MPD; then
    echo "___Remove additional peppymeter output..."
    sed -n -i '/---> output peppymeter/,/<--- end peppymeter/!p' $MPD
else
    echo "___additional output already removed"
fi

cd $dest_path
########################################
# for Buster
if [ "$ID" = "10" ]; then
    if grep -q '"allowed_formats"' $MPD; then
        echo "___Remove allowed formates..."
        sed -i '/allowed_formats/d' $MPD
    else
        echo "___allowed formates already removed"
    fi
    # create new active mpd.conf
    node createConf.js


########################################
# for jessie
else
    echo "___Remove additional modifications for jessie..."

    
	# restore standard mpd output
	if grep -q '"mpd_alsa"' $MPD; then
		echo "___Restore mpd standard output..."
        sed -i '0,/\t\tname\t\t"mpd_alsa"/ s//\t\tname\t\t"alsa"/' $MPD
		sed -i '0,/\t\tdevice\t\t"mpd_alsa"/ s//\t\tdevice\t\t"${device}"/' $MPD
    else
        echo "___mpd template file already restored"
	fi

	# restore airplay template
	AIR=/volumio/app/plugins/music_service/airplay_emulation/shairport-sync.conf.tmpl
	if grep -q '"peppyalsa"' $AIR; then
		echo "___Restore airplay output..."
        sed -i '0,/output_device = "peppyalsa";/ s//output_device = "${device}";/' $AIR	
	else
        echo "___airplay output already restored"
    fi

    # create new active mpd.conf
    node createConf.js
    node restoreAsound.js
fi


#sudo systemctl restart mpd
    
echo "Done"
echo "pluginuninstallend"