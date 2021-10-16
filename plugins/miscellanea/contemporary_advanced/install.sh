#!/bin/bash

echo "Installing contemporary advanced Dependencies"
# sudo apt-get update
# Install the required packages via apt-get
# sudo apt-get -y install

# If you need to differentiate install for armhf and i386 you can get the variable like this
#DPKG_ARCH=`dpkg --print-architecture`
# Then use it to differentiate your install

dest_path=/data/plugins/miscellanea/contemporary_advanced

www3=/volumio/http/www3
ID=$(ls ${www3}/styles/app-*.css)
ID=${ID#*app-}
ID=${ID%.*}

cd $dest_path
if [ -d "$ID" ]; then 
    [ ! -d "backup" ] && mkdir -p backup
    cp ${www3}/styles/app-${ID}.css backup
    #cp ${www3}/styles/vendor-*.css backup

    #mkdir -p styles
    #ln -s ${dest_path}/${ID}/app-${ID}_1.css styles/app-${ID}.css
    #cp ${www3}/styles/vendor-*.css styles
    
    chmod 777 -R backup
    sudo chown -R volumio backup
    sudo chgrp -R volumio backup

else
	echo "No matching version - no installation possible!!"
	exit -1
fi

sed -i '/--InsertColorOptions--/r colors.json' UIConfig.json
sed -i '/--InsertColorOptions--/d' UIConfig.json
sed -i '/--InsertOpacities--/r opacities.json' UIConfig.json
sed -i '/--InsertOpacities--/d' UIConfig.json

#requred to end the plugin install
echo "plugininstallend"
