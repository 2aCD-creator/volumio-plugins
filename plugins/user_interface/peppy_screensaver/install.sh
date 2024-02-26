#!/bin/bash

ARCH=$(cat /etc/os-release | grep ^VOLUMIO_ARCH | tr -d 'VOLUMIO_ARCH="')

echo "Installing peppy-screensaver Dependencies"

# If you need to differentiate install for armhf and i386 you can get the variable like this
#DPKG_ARCH=`dpkg --print-architecture`
# Then use it to differentiate your install

# set current directory
dest_path=/data/plugins/user_interface/peppy_screensaver
ppa_path=/home/volumio/peppyalsa
peppy_path=${dest_path}/peppymeter
data_path=/data/INTERNAL/peppy_screensaver/templates

ID=$(awk '/VERSION_ID=/' /etc/*-release | sed 's/VERSION_ID=//' | sed 's/\"//g')
VER=$(awk '/VOLUMIO_VERSION=/' /etc/*-release | sed 's/VOLUMIO_VERSION=//' | sed 's/\"//g')
APTUPD = "false"

########################################
# install peppyalsa     
if [ ! -f "/usr/local/lib/libpeppyalsa.so" ]; then
    if [ $ARCH = "arm" ]; then
        echo "___Install peppyalsa ..."
        cd /usr/local/lib 
        sudo cp -f ${dest_path}/peppyalsa/* ./
        sudo chmod 644 libpeppyalsa.a
        sudo chmod 755 libpeppyalsa.la
        sudo chmod 755 libpeppyalsa.so.0.0.0
        sudo rm -f libpeppyalsa.so.0
        sudo rm -f libpeppyalsa.so
        sudo ln -s libpeppyalsa.so.0.0.0 libpeppyalsa.so.0
        sudo ln -s libpeppyalsa.so.0.0.0 libpeppyalsa.so
        
        echo "___Install peppyalsa client ..."
        PA_CLIENT=/home/volumio/peppyalsa/src
        mkdir -p ${PA_CLIENT}
        cp -p ${dest_path}/peppyalsa/peppyalsa-client ${PA_CLIENT}/
        chmod 755 ${PA_CLIENT}/peppyalsa-client

    else
        echo "___Install peppyalsa dependencies..."
        if [ ! $APTUPD = "true" ]; then sudo apt-get update && APTUPD=true; fi
        mkdir $ppa_path
        git clone https://github.com/project-owner/peppyalsa.git $ppa_path
        cd $ppa_path
        sudo apt-get -y install build-essential autoconf automake libtool libasound2-dev libfftw3-dev
    
        echo "___Compile peppyalsa..."
        aclocal && libtoolize
        autoconf && automake --add-missing
        ./configure && make

        echo "___Install peppyalsa..."
        sudo make install
    fi
else
    echo "___peppyalsa already installed"
fi
sudo rm -rd ${dest_path}/peppyalsa

########################################
# build peppyalsa commandline client for test of installed peppyalsa
if [ -d "${ppa_path}" ] && [ ! -f "${ppa_path}/src/peppyalsa-client" ]; then
    echo "___Compile peppyalsa-client commandline tool..."
    cd ${ppa_path}/src
    if grep -q '/home/pi/myfifo' peppyalsa-client.c; then
        sudo sed -i 's/\/home\/pi\/myfifo/\/tmp\/myfifo/g' peppyalsa-client.c
    fi
    sudo gcc peppyalsa-client.c -o peppyalsa-client
else
    echo "___commandline tool already compiled"
fi

    
########################################
# install PeppyMeter
if [ ! -d "${peppy_path}" ]; then
    echo "___Install PeppyMeter..."
    git clone https://github.com/project-owner/PeppyMeter.git $peppy_path
    chmod 777 -R $peppy_path
    sudo chown volumio $peppy_path
    sudo chgrp volumio $peppy_path
else
    echo "___PeppyMeter already installed"
fi

# copy volumio integration
mv -f ${dest_path}/volumio_peppymeter/* ${peppy_path}/ 
rm -rd ${dest_path}/volumio_peppymeter
sudo chmod +x ${peppy_path}/run_peppymeter.sh
# templates
mkdir -p ${data_path} 
mv -f ${dest_path}/templates/* ${data_path}/
rm -rd ${dest_path}/templates 
mv -f ${peppy_path}/320x240 ${data_path}/
mv -f ${peppy_path}/480x320 ${data_path}/
mv -f ${peppy_path}/800x480 ${data_path}/
mv -f ${peppy_path}/1280x400 ${data_path}/ 
rm -rd ${peppy_path}/320x240
rm -rd ${peppy_path}/480x320
rm -rd ${peppy_path}/800x480
rm -rd ${peppy_path}/1280x400 
sudo chmod -R 777 ${data_path}

########################################
# install python and pygame
if [ $(python3 -m pip show  pygame | grep -c "pygame") -eq 0 ]; then 
    echo "___Install python pygame..."
    if [ ! $APTUPD = "true" ]; then sudo apt-get update && APTUPD=true; fi
    sudo apt-get -y install python3-pip
    sudo apt-get -y install python3-pygame
    #sudo apt-get -y install python3-pygame=1.9.4.post1+dfsg-3
else
    echo "___Python pygame already installed"
fi

# for buster
if [ "$ID" = "10" ]; then
    if [ $(python3 -m pip show  socketIO-client | grep -c "socketIO-client") -eq 0 ]; then 
        echo "___Install python socket-IO..."
        if [ ! $APTUPD = "true" ]; then sudo apt-get update && APTUPD=true; fi
        sudo python3 -m pip install socketIO-client
    else
        echo "___Python sockt-IO already installed"
    fi
    if [ $(python3 -m pip show CairoSVG | grep -c "CairoSVG") -eq 0 ]; then
        echo "___Install python cairoSVG..."
        if [ ! $APTUPD = "true" ]; then sudo apt-get update && APTUPD=true; fi
        sudo apt install libjpeg-dev zlib1g-dev
        sudo python3 -m pip install cairosvg
    else
        echo "___Python cairoSVG already installed"
    fi    
    
else
    echo "___jessie not more supported"
fi

########################################
# modify PeppyMeter config for Volumio
echo "___Modify PeppyMeter config for Volumio..."
CFG=${peppy_path}/config.txt


# section current
sed -i 's/random.meter.interval.*/random.meter.interval = 60/g' $CFG
sed -i 's/exit.on.touch.*/exit.on.touch = True/g' $CFG
sed -i 's/base.folder.*/base.folder = \/data\/INTERNAL\/peppy_screensaver\/templates/g' $CFG
if ! grep -q 'volumio entries' $CFG; then
    sed -i '/\[sdl.env\]/i\
# --- volumio entries -------\
random.change.title = True\
font.path = /volumio/http/www3/app/themes/volumio3/assets/variants/volumio/fonts\
font.light = /Lato-Light.ttf\
font.regular = /Lato-Regular.ttf\
font.bold = /Lato-Bold.ttf\
# for Thai ---\
#font.path = /usr/share/fonts/truetype\
#font.light = /tlwg/Laksaman.ttf\
#font.regular = /tlwg/Laksaman.ttf\
#font.bold = /tlwg/Laksaman-Bold.ttf\
# for Chinese ---\
#font.path = /usr/share/fonts/truetype\
#font.light = /arphic/ukai.ttc\
#font.regular = /arphic/ukai.ttc\
#font.bold = /arphic/ukai.ttc\
' $CFG
fi 
# section sdl.env
sed -i 's/framebuffer.device.*/framebuffer.device = \/dev\/fb0/g' $CFG
sed -i 's/mouse.device.*/mouse.device = \/dev\/input\/event0/g' $CFG
sed -i 's/no.frame.*/no.frame = True/g' $CFG
# section data.source
sed -i 's/pipe.name.*/pipe.name = \/tmp\/myfifo/g' $CFG
sed -i 's/smooth.buffer.size.*/smooth.buffer.size = 8/g' $CFG
echo "___Finished"        
    
   
#requred to end the plugin install
echo "plugininstallend"
