#!/bin/bash

# Uninstall dependendencies
# apt-get remove -y


# restore css file
www3=/volumio/http/www3
cd ${www3}/styles

ID=$(ls app-*.css)
ID=${ID#*app-}
ID=${ID%.*}

df ${www3}/styles/app-${ID}.css | grep ${www3}/styles/app-${ID}.css && sudo umount ${www3}/styles/app-${ID}.css

fstab=/etc/fstab
cd $dest_path
if grep -q 'MPDindex.js' $fstab; then
    sudo sed -i '/MPDindex.js/d' $fstab
fi

echo "Done"
echo "pluginuninstallend"