## PeppyScreensaver
PeppyMeter as screensaver for Volumio on raspberry pi
>Many thanks to peppy.player, who provided the conditions for this

-----
##### Version 2.2.1
* fix stop screensaver on title end
* add volume fadeIn also for spectrum
* add animation on startup and on close of screensaver
* add the possibility to change the position of screensaver window if it smaller then screen
* disable cache mode per default for systems with installed memory smaller then 4Gb

##### Version 2.2.0
* update socketIO to 4.6 to make it compatible to updated volumio socketIO server

##### Version 2.1.0
* complete spectrum templates for all resolutions
* add an option for USB-DAC's to prevent abbort playing with spotify
* add the possibility to disable screensaver explicit for Spotify
 
##### Version 2.0.0 Beta
* add peppy spectrum (samples available at time for 1920x1080 and 1280x800, more coming soon with stable version)
* add transitions between different albumarts and different styles in random mode for a better look
* add check for list mode, are all sections available which you want use
* upper and lower character now allowed in meter sections and list mode
* add UI option for cache size configuration (default is now 20 different meters) to use also bigger meter folders
* exit peppy meter screen now also when music ends
* fix some graphical artefacts on random mode with title change

##### Version 1.5.0
* fix title info change issue
* convert to pygame 2.6 with arm neon fpu support based on SDL2 for Raspberry pi3/4/5
* all dependecies (peppyalsa, pygame2, cairosvg, socketIO) now precompiled for Raspberry pi3/4/5 
* therefore no more compilation at installation time, no developer librarys needed -> very easy installation 

##### Version 1.4.2
* add Airplay integration
* fix some graphical issues for random mode on title change
* performance optimizations

##### Version 1.4.1
* fix Spotify stops playing in combination of PeppyMeter and some USB-DAC's
* now an external stop of PeppyMeter possible with deletion of /tmp/peppyrunning
* it's possible now to set timeout to 0 - disable screensaver function
  
##### Version 1.4.0
* better compatibility with FusionDSP
* Spotify now with FusionDSP working
* add an external folder for meter templates (/data/INTERNAL/peppy_screensaver/templates)
* add an option to switch displayport:0 to 1 (Volumio Primo)

##### Version 1.3.9 Beta
* now compatibel with fusionDSP
* add new random mode to change meters randomly, when a new song begins
* add new optional config entries in meter.txt
   for separate color:
	playinfo.title.color
	playinfo.artist.color
	playinfo.album.color
   for separate maxwidth:
	playinfo.title.maxwidth
	playinfo.artist.maxwidth
	playinfo.album.maxwidth
   for separate aligment of title, artist, album and the rest
	playinfo.text.center
* add the possibility to use a masked albumart with a grayscaled jpg image
	albumart.mask
* fix missing pictures for filetype (mp3, flac, tidal...)
 
##### Version: 1.3.1

* conform with buster 3.569

##### Version: 1.3.0

* add resolution 1280x720

##### Version: 1.2.0

* add resolution 1920x 480
* prepare the plugin to allow a volumio system update if the plugin deactivated

##### Version 1.0.0

* initial version

 
