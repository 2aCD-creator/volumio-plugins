## PeppyScreensaver
PeppyMeter as screensaver for Volumio on raspberry pi
>Many thanks to peppy.player, who provided the conditions for this

-----
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

 
