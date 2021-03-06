#!/bin/bash

echo "Installing peppy-screensaver Dependencies"
# refresh packages
#echo "Updating packages"
sudo apt-get update

# Install the required packages via apt-get
#sudo apt-get -y install

# If you need to differentiate install for armhf and i386 you can get the variable like this
#DPKG_ARCH=`dpkg --print-architecture`
# Then use it to differentiate your install

# set current directory
dest_path=/data/plugins/miscellanea/peppy_screensaver
ppa_path=/home/volumio/peppyalsa
peppy_path=${dest_path}/peppymeter

ID=$(awk '/VERSION_ID=/' /etc/*-release | sed 's/VERSION_ID=//' | sed 's/\"//g')
VER=$(awk '/VOLUMIO_VERSION=/' /etc/*-release | sed 's/VOLUMIO_VERSION=//' | sed 's/\"//g')

########################################
# install build essentials, needed since 2.882
if [ ! "$ID" = "10" ]; then
    if $(dpkg --compare-versions $VER "gt" "2.88"); then
        if [ $(dpkg-query -W -f='${Status}' gcc-4.9 2>/dev/null | grep -c "ok installed") -eq 0 ]; then

            echo "___Install missing build essentials..."
            SRC=/etc/apt/sources.list
            if ! grep -q 'stretch' $SRC; then
                sudo sed -i '$adeb http://raspbian.raspberrypi.org/raspbian/ stretch main contrib non-free rpi' $SRC
            fi
            sudo apt-get update

            echo "___Install binutils..."
            sudo apt-get -y install binutils

            sudo apt-get -y install libstdc++-4.9-dev
            sudo apt-get -y install gcc-4.9 gcc g++-4.9 g++ dpkg-dev

            sudo sed -i '/stretch/d' $SRC
            sudo apt-get update
        else
            echo "___build essentials already installed"
        fi
    fi
fi
  

########################################
# install peppyalsa     
if [ ! -f "/usr/local/lib/libpeppyalsa.so" ]; then
    echo "___Install peppyalsa dependencies..."
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
else
    echo "___peppyalsa already installed"
fi


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
rm -d -r ${dest_path}/volumio_peppymeter
sudo chmod +x ${peppy_path}/run_peppymeter.sh


########################################
# install python and pygame
if [ $(python3 -m pip show  pygame | grep -c "pygame") -eq 0 ]; then 
    echo "___Install python pygame..."
    sudo apt-get -y install python3-pip
    sudo apt-get -y install python3-pygame
else
    echo "___Python pygame already installed"
fi

# for buster
if [ "$ID" = "10" ]; then #for buster
    if [ $(python3 -m pip show  socketIO-client | grep -c "socketIO-client") -eq 0 ]; then 
        echo "___Install python socket-IO..."
        sudo python3 -m pip install socketIO-client
    else
        echo "___Python sockt-IO already installed"
    fi
    if [ $(python3 -m pip show  CairoSVG | grep -c "CairoSVG") -eq 0 ]; then
        echo "___Install python cairoSVG..."
        sudo python3 -m pip install cairosvg
    else
        echo "___Python cairoSVG already installed"
    fi    

    # remove asound template for jessie
    rm ${dest_path}/asound.conf.tmpl
    
# for jessie
else
    if [ $(python3 -m pip --version | grep -c "pip 19.1.1") -eq 0 ]; then
        echo "___Update python pip to 19.1.1..." 
        sudo python3 -m pip install pip==19.1.1
        sudo mv /usr/lib/python3/dist-packages/pip-1.5.6.egg-info/ /usr/lib/python3/dist-packages/pip-1.5.6.egg-info_/
        sudo mv /usr/lib/python3/dist-packages/pip/ /usr/lib/python3/dist-packages/pip_/
    else
        echo "___Python pip already on v19.1.1"
    fi
    if [ $(python3 -m pip show  socketIO-client | grep -c "socketIO-client") -eq 0 ]; then
        echo "___Install python socket-IO..."
        sudo python3 -m pip install socketIO-client
        yes | sudo python3 -m pip uninstall websocket websocket-client
        sudo python3 -m pip install websocket-client==0.53
    else
        echo "___Python sockt-IO already installed"
    fi
    
    if [ $(python3 -m pip show  CairoSVG | grep -c "CairoSVG") -eq 0 ]; then
        echo "___Install python cairoSVG..."
        sudo apt-get -y install libffi-dev
        sudo python3 -m pip install --upgrade Pillow==5.4.1 --global-option="build_ext" --global-option="--disable-jpeg"
        sudo python3 -m pip install cffi
        sudo python3 -m pip install cairocffi==0.9.0
        sudo python3 -m pip install cairosvg==2.2.0
    else
        echo "___Python cairoSVG already installed"
    fi

    # remove asound dir for buster
    rm -d -r ${dest_path}/asound
    rm ${dest_path}/Peppyalsa.postPeppyalsa.5.conf.tmpl
fi

########################################
# modify PeppyMeter config for Volumio
echo "___Modify PeppyMeter config for Volumio..."
CFG=${peppy_path}/config.txt

# section current
sed -i 's/random.meter.interval.*/random.meter.interval = 60/g' $CFG
sed -i 's/exit.on.touch.*/exit.on.touch = True/g' $CFG
if ! grep -q 'volumio entries' $CFG; then
    sed -i '/\[sdl.env\]/i\
# --- volumio entries -------\
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
    
#sudo /bin/systemctl restart mpd.service
#volumio vrestart    
#requred to end the plugin install
echo "plugininstallend"
