#!/bin/bash

ARCH=$(cat /etc/os-release | grep ^VOLUMIO_ARCH | tr -d 'VOLUMIO_ARCH="')
TOTAL_MEM=$(free -m | grep Mem: | awk '{print $2}')
echo "Installing peppy-screensaver Dependencies"

# define check python modul available 
checkModul () {
  python3 -c "\
try:
    import $1  
    print('1')
except ImportError:
    pass"
}

# define change meters.ini to set meter.x = 1
# prevent segmentation fault
changeINI () {
    sed -i 's|meter.x.*|meter.x = 1|g' $1
    sect=$(grep "^\[" $1 | sed 's,^\[,,' | sed 's,\],,')
    for i in $sect; do
        changeSection "$i" "$1"
    done
}
# define meter.x = 1 to section, whitch have it missing
# prevent segmentation fault
changeSection () {
    ret=$(sed -nr "/^\[$1\]/ { :l /^meter.x[ ]*=/ { s/[^=]*=[ ]*//; p; q;}; n; b l;}" $2)
    if [ ! $ret ]; then 
        sed -i "/^\[$1\]/a\meter.x = 1" $2
    fi
}
# ----------------------------------


# If you need to differentiate install for armhf and i386 you can get the variable like this
#DPKG_ARCH=`dpkg --print-architecture`
# Then use it to differentiate your install

# set current directory
PLUGIN_path=$(cd $(dirname $0) && pwd -P)
PLUGIN_name=$(grep '\"name\":' ${PLUGIN_path}/package.json | cut -d "\"" -f 4)
PPA_path=/home/volumio/peppyalsa
PEPPYMETER_path=${PLUGIN_path}/screensaver/peppymeter
PEPPYSPECTRUM_path=${PLUGIN_path}/screensaver/spectrum
DATA_path=/data/INTERNAL/${PLUGIN_name}

ID=$(awk '/VERSION_ID=/' /etc/*-release | sed 's/VERSION_ID=//' | sed 's/\"//g')
VER=$(awk '/VOLUMIO_VERSION=/' /etc/*-release | sed 's/VOLUMIO_VERSION=//' | sed 's/\"//g')
APTUPD = "false"
PIPUPD = "false"

########################################
# install peppyalsa     
if [ ! -f "/usr/local/lib/libpeppyalsa.so" ]; then
    # for pi3/4/5 used precompiled version
    if [ $ARCH = "arm" ]; then
        echo "___Install peppyalsa ..."
        sudo tar -xzf ${PLUGIN_path}/dependencies/peppyalsa.tar.gz  -C /usr/local/lib
        
        echo "___Install peppyalsa client ..."
        PA_CLIENT=/home/volumio/peppyalsa/src
        mkdir -p ${PA_CLIENT}
        cp -p ${PLUGIN_path}/dependencies/peppyalsa-client ${PA_CLIENT}/
        chmod 755 ${PA_CLIENT}/peppyalsa-client
    
    # otherwise start compilation
    else
        echo "___Install peppyalsa dependencies..."
        sudo apt-get update && APTUPD=true
        mkdir $PPA_path
        git clone https://github.com/project-owner/peppyalsa.git $PPA_path
        cd $PPA_path
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


########################################
# build peppyalsa commandline client for test of installed peppyalsa
if [ -d "${PPA_path}" ] && [ ! -f "${PPA_path}/src/peppyalsa-client" ]; then
    echo "___Compile peppyalsa-client commandline tool..."
    cd ${PPA_path}/src
    if grep -q '/home/pi/myfifo' peppyalsa-client.c; then
        sudo sed -i 's/\/home\/pi\/myfifo/\/tmp\/myfifo/g' peppyalsa-client.c
    fi
    sudo gcc peppyalsa-client.c -o peppyalsa-client
else
    echo "___commandline tool already compiled"
fi

    
########################################
# install PeppyMeter
if [ ! -d "${PEPPYMETER_path}" ]; then
    echo "___Install PeppyMeter..."
    git clone https://github.com/project-owner/PeppyMeter.git $PEPPYMETER_path
#    chmod -R 777 $PEPPYMETER_path
#    chown -R volumio:volumio $PEPPYMETER_path
else
    echo "___PeppyMeter already installed"
fi

# copy volumio integration
cp -rf ${PLUGIN_path}/volumio_peppymeter/* ${PLUGIN_path}/screensaver/ 
rm -rd ${PLUGIN_path}/volumio_peppymeter
chmod +x ${PLUGIN_path}/run_peppymeter.sh

# templates
mkdir -p ${DATA_path} 
cp -rf ${PLUGIN_path}/templates ${DATA_path}/
rm -rd ${PLUGIN_path}/templates 
cp -rf ${PEPPYMETER_path}/*0x* ${DATA_path}/templates/
rm -rd ${PEPPYMETER_path}/*0x*

# prevent segmentation fault on pi
if [ $ARCH = "arm" ]; then
    ini_320=${DATA_path}/templates/320x240/meters.txt
    ini_480=${DATA_path}/templates/480x320/meters.txt
    changeINI "$ini_320"
    changeINI "$ini_480"
fi

########################################
# install PeppySpectrum
if [ ! -d "${PEPPYSPECTRUM_path}" ]; then
    echo "___Install PeppySpectrum..."
    git clone https://github.com/project-owner/PeppySpectrum.git $PEPPYSPECTRUM_path
#    chmod -R 777 $PEPPYSPECTRUM_path
#    chown -R volumio:volumio $PEPPYSPECTRUM_path
else
    echo "___PeppySpectrum already installed"
fi

# templates 
cp -rf ${PLUGIN_path}/templates_spectrum ${DATA_path}/
rm -rd ${PLUGIN_path}/templates_spectrum 
cp -rf ${PEPPYSPECTRUM_path}/*0x* ${DATA_path}/templates_spectrum/
rm -rd ${PEPPYSPECTRUM_path}/*0x*

chmod -R 744 ${DATA_path}
chown -R volumio:volumio ${DATA_path}
chmod -R 755 ${PLUGIN_path}/screensaver
chown -R volumio:volumio ${PLUGIN_path}/screensaver
    
########################################
# install python and pygame

if [ $(checkModul "pygame" | grep -c '1') -eq 0 ]; then 

    # for pi3/4/5 used precompiled version of pygame2
    echo "___Install python pygame..."
    if [ $ARCH = "arm" ]; then
        sudo tar -xzf ${PLUGIN_path}/dependencies/pygame2.tar.gz  -C /usr
    
    # otherwise install older version 1.9.4
    else
        if [ $APTUPD = "false" ]; then sudo apt-get update && APTUPD=true; fi
        sudo apt-get -y install python3-pip && PIPUPD=true
    
        # default pygame 1.9.4
        sudo apt-get -y install python3-pygame
        #sudo apt-get -y install python3-pygame=1.9.4.post1+dfsg-3
    
        # pygame 2.5.2 
        #sudo apt install libsdl2-image-2.0-0 libsdl2-ttf-2.0-0
        #python3 -m pip install pygame==2.5.2
    fi
else
    echo "___Python pygame already installed"
fi


if [ $(checkModul "socketio" | grep -c '1') -eq 0 ]; then     
    echo "___Install python socket-IO..."
    if [ $ARCH = "arm" ]; then
        sudo tar -xzf ${PLUGIN_path}/dependencies/socketio.tar.gz  -C /usr/local/lib/python3.7/dist-packages
    else
        if [ $APTUPD = "false" ]; then sudo apt-get update && APTUPD=true; fi
        if [ $PIPUPD = "false" ]; then sudo apt-get -y install python3-pip && PIPUPD=true; fi
        sudo python3 -m pip install python-engineio==3.14.2 python-socketio[client]==4.6.0
    fi
else
        echo "___Python sockt-IO already installed"
fi

if [ $(checkModul "cairosvg" | grep -c '1') -eq 0 ]; then

    if [ $ARCH = "arm" ]; then
        echo "___Install python pillow..."
        sudo tar -xzf ${PLUGIN_path}/dependencies/PIL.tar.gz  -C /usr/local/lib/python3.7/dist-packages
    else
        echo "___Install python cairoSVG..."
        if [ $APTUPD = "false" ]; then sudo apt-get update && APTUPD=true; fi
        if [ $PIPUPD = "false" ]; then sudo apt-get -y install python3-pip && PIPUPD=true; fi
        sudo apt install libjpeg-dev zlib1g-dev
        sudo python3 -m pip install cairosvg
    fi
else
        echo "___Python cairoSVG already installed"
fi    

if [ $(checkModul "pyscreenshot" | grep -c '1') -eq 0 ]; then

    if [ $ARCH = "arm" ]; then
        echo "___Install python screenshot..."
        sudo tar -xzf ${PLUGIN_path}/dependencies/pyscreenshot.tar.gz  -C /usr/local/lib/python3.7/dist-packages
    else
        echo "___Install python cairoSVG..."
        if [ $APTUPD = "false" ]; then sudo apt-get update && APTUPD=true; fi
        if [ $PIPUPD = "false" ]; then sudo apt-get -y install python3-pip && PIPUPD=true; fi
        sudo python3 -m pip install pyscreenshot
    fi
else
        echo "___Python pyscreenshot already installed"
fi  

sudo rm -rd ${PLUGIN_path}/dependencies

########################################
# modify PeppyMeter config for Volumio
echo "___Modify PeppyMeter config for Volumio..."
CFG=${PEPPYMETER_path}/config.txt


# section current
sed -i 's|random.meter.interval.*|random.meter.interval = 60|g' $CFG
sed -i 's|exit.on.touch.*|exit.on.touch = True|g' $CFG
sed -i 's|stop.display.on.touch.*|stop.display.on.touch = True|g' $CFG
sed -i "s|base.folder.*|base.folder = ${DATA_path}/templates|g" $CFG
if [ $TOTAL_MEM -lt 3000 ] ; then
    sed -i 's|use.cache.*|use.cache = False|g' $CFG
else
    sed -i 's|use.cache.*|use.cache = True|g' $CFG
fi

if ! grep -q 'volumio entries' $CFG; then
    sed -i '/\[sdl.env\]/i\
# --- volumio entries -------\
random.change.title = True\
color.depth = 24\
position.type = center\
position.x = 0\
position.y = 0\
start.animation = True\
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
sed -i 's|framebuffer.device.*|framebuffer.device = /dev/fb0|g' $CFG
sed -i 's|mouse.device.*|mouse.device = /dev/input/event0|g' $CFG
sed -i 's|double.buffer.*|double.buffer = True|g' $CFG
sed -i 's|no.frame.*|no.frame = True|g' $CFG
# section data.source
sed -i 's|pipe.name.*|pipe.name = /tmp/myfifo|g' $CFG
sed -i 's|smooth.buffer.size.*|smooth.buffer.size = 8|g' $CFG

########################################
# modify PeppySpectrum config for Volumio
echo "___Modify PeppySpectrum config for Volumio..."
CFG=${PEPPYSPECTRUM_path}/config.txt

# section current
sed -i "s|base.folder.*|base.folder = ${DATA_path}/templates_spectrum|g" $CFG
sed -i 's|exit.on.touch.*|exit.on.touch = True|g' $CFG
sed -i 's|pipe.name.*|pipe.name = /tmp/myfifosa|g' $CFG
sed -i 's|size.*|size = 20|g' $CFG
sed -i 's|update.ui.interval.*|update.ui.interval = 0.04|g' $CFG

# section sdl.env
sed -i 's|framebuffer.device.*|framebuffer.device = /dev/fb0|g' $CFG
sed -i 's|mouse.device.*|mouse.device = /dev/input/event0|g' $CFG
sed -i 's|double.buffer.*|double.buffer = False|g' $CFG
sed -i 's|no.frame.*|no.frame = True|g' $CFG

echo "___Finished"        
    
   
#requred to end the plugin install
echo "plugininstallend"
