# Copyright 2021 PeppyMeter for Volumio by 2aCD
# 
# This file is part of PeppyMeter for Volumio
# 

import os
from configparser import ConfigParser

CURRENT = "current"
BASE_FOLDER = "base.folder"
METER_FOLDER = "meter.folder"
FILE_CONFIG = "config.txt"
FILE_METER_CONFIG = "meters.txt"

RANDOM_TITLE = "random.change.title"
FONT_PATH = "font.path"
FONT_LIGHT = "font.light"
FONT_REGULAR = "font.regular"
FONT_BOLD = "font.bold"

EXTENDED_CONF = "config.extend"
ALBUMART_POS = "albumart.pos"
ALBUMART_DIM = "albumart.dimension"
ALBUMART_MSK = "albumart.mask"
ALBUMBORDER = "albumart.border"

PLAY_TXT_CENTER = "playinfo.text.center"
PLAY_TITLE_POS = "playinfo.title.pos"
PLAY_TITLE_COLOR = "playinfo.title.color"
PLAY_TITLE_MAX = "playinfo.title.maxwidth"
PLAY_ARTIST_POS = "playinfo.artist.pos"
PLAY_ARTIST_COLOR = "playinfo.artist.color"
PLAY_ARTIST_MAX = "playinfo.artist.maxwidth"
PLAY_ALBUM_POS = "playinfo.album.pos"
PLAY_ALBUM_COLOR = "playinfo.album.color"
PLAY_ALBUM_MAX = "playinfo.album.maxwidth"
PLAY_TITLE_STYLE = "PLAY_TITLE_STYLE"
PLAY_ARTIST_STYLE = "PLAY_ARTIST_STYLE"
PLAY_ALBUM_STYLE = "PLAY_ALBUM_STYLE"
PLAY_CENTER = "playinfo.center"
PLAY_MAX = "playinfo.maxwidth"
PLAY_TYPE_POS = "playinfo.type.pos"
PLAY_TYPE_COLOR = "playinfo.type.color"
PLAY_TYPE_DIM = "playinfo.type.dimension"
PLAY_SAMPLE_POS = "playinfo.samplerate.pos"
PLAY_SAMPLE_STYLE = "PLAY_SAMPLE_STYLE"
TIME_REMAINING_POS = "time.remaining.pos"
TIMECOLOR = "time.remaining.color" 
FONT_STYLE_B = "bold"
FONT_STYLE_R = "regular"
FONT_STYLE_L = "light"
FONTSIZE_LIGHT = "font.size.light"
FONTSIZE_REGULAR = "font.size.regular"
FONTSIZE_BOLD = "font.size.bold"
FONTSIZE_DIGI = "font.size.digi"
FONTCOLOR = "font.color"

class Volumio_ConfigFileParser(object):
    """ Configuration file parser """
    
    def __init__(self, base_path):
        """ Initializer """  
              
        self.meter_config_volumio = {}
        c = ConfigParser()

        peppy_meter_path = os.path.join(base_path, FILE_CONFIG)
        c.read(peppy_meter_path)

        try:    
            self.meter_config_volumio[RANDOM_TITLE] = c.getboolean(CURRENT, RANDOM_TITLE)
        except:
            self.meter_config_volumio[RANDOM_TITLE] = False                
        try:
            self.meter_config_volumio[FONT_PATH] = c.get(CURRENT, FONT_PATH)
        except:
            self.meter_config_volumio[FONT_PATH] = None
        try:
            self.meter_config_volumio[FONT_LIGHT] = c.get(CURRENT, FONT_LIGHT)
        except:
            self.meter_config_volumio[FONT_LIGHT] = None
        try:
            self.meter_config_volumio[FONT_REGULAR] = c.get(CURRENT, FONT_REGULAR)
        except:
            self.meter_config_volumio[FONT_REGULAR] = None
        try:    
            self.meter_config_volumio[FONT_BOLD] = c.get(CURRENT, FONT_BOLD)
        except:
            self.meter_config_volumio[FONT_BOLD] = None


        if c.get(CURRENT, BASE_FOLDER):     
            base_path = c.get(CURRENT, BASE_FOLDER)
       
        meter_folder = c.get(CURRENT, METER_FOLDER)
        folder = os.path.join(base_path, meter_folder)
        if not os.path.isdir(folder):
            print("Not supported screen size: " + meter_folder)
            os._exit(0)
 
        meter_config_path = os.path.join(base_path, meter_folder, FILE_METER_CONFIG)
        if not os.path.exists(meter_config_path):
            print("Cannot read file: " + meter_config_path)
            os._exit(0)

        c = ConfigParser()
        c.read(meter_config_path)
        available_meter_names = list()
        
        for section in c.sections():
            self.meter_config_volumio[section] = self.get_common_options(c, section)
        
        
    def get_common_options(self, config_file, section):
        """ Parser for the common section of the configuration file
        
        :param config_file: configuration file
        :param section: section name
        """
        d = {}
        try:
            d[EXTENDED_CONF] = config_file.getboolean(section, EXTENDED_CONF)
        except:
            d[EXTENDED_CONF] = False
        try:
            spl = config_file.get(section, ALBUMART_POS).split(',')
            d[ALBUMART_POS] =  (int(spl[0]), int(spl[1]))
        except:
            d[ALBUMART_POS] = None
        try:
            spl = config_file.get(section, ALBUMART_DIM).split(',')
            d[ALBUMART_DIM] =  (int(spl[0]), int(spl[1]))
        except:
            d[ALBUMART_DIM] = None
        try:
            d[ALBUMART_MSK] = config_file.get(section, ALBUMART_MSK)
        except:
            d[ALBUMART_MSK] = None            
        try:
            d[ALBUMBORDER] = config_file.getint(section, ALBUMBORDER)
        except:
            d[ALBUMBORDER] = None

        try:
            d[PLAY_TXT_CENTER] = config_file.getboolean(section, PLAY_TXT_CENTER)
        except:
            d[PLAY_TXT_CENTER] = None
        try:
            spl = config_file.get(section, PLAY_TITLE_POS).split(',')		
            d[PLAY_TITLE_POS] = (int(spl[0]), int(spl[1]))
            d[PLAY_TITLE_STYLE] = spl[2]
        except:
            d[PLAY_TITLE_POS] = None
            d[PLAY_TITLE_STYLE] = FONT_STYLE_B
        try:
            spl = config_file.get(section, PLAY_TITLE_COLOR).split(',')
            d[PLAY_TITLE_COLOR] = (int(spl[0]), int(spl[1]), int(spl[2]))
        except:
            d[PLAY_TITLE_COLOR] = None
        try:
            d[PLAY_TITLE_MAX] = config_file.getint(section, PLAY_TITLE_MAX)
        except:
            d[PLAY_TITLE_MAX] = None
            
        try:
            spl = config_file.get(section, PLAY_ARTIST_POS).split(',')
            d[PLAY_ARTIST_POS] = (int(spl[0]), int(spl[1]))
            d[PLAY_ARTIST_STYLE] = spl[2]
        except:
            d[PLAY_ARTIST_POS] = None
            d[PLAY_ARTIST_STYLE] = FONT_STYLE_L
        try:
            spl = config_file.get(section, PLAY_ARTIST_COLOR).split(',')
            d[PLAY_ARTIST_COLOR] = (int(spl[0]), int(spl[1]), int(spl[2]))
        except:
            d[PLAY_ARTIST_COLOR] = None
        try:
            d[PLAY_ARTIST_MAX] = config_file.getint(section, PLAY_ARTIST_MAX)
        except:
            d[PLAY_ARTIST_MAX] = None
            
        try:
            spl = config_file.get(section, PLAY_ALBUM_POS).split(',')
            d[PLAY_ALBUM_POS] = (int(spl[0]), int(spl[1]))
            d[PLAY_ALBUM_STYLE] = spl[2]
        except:
            d[PLAY_ALBUM_POS] = None
            d[PLAY_ALBUM_STYLE] = FONT_STYLE_L
        try:
            spl = config_file.get(section, PLAY_ALBUM_COLOR).split(',')
            d[PLAY_ALBUM_COLOR] = (int(spl[0]), int(spl[1]), int(spl[2]))
        except:
            d[PLAY_ALBUM_COLOR] = None
        try:
            d[PLAY_ALBUM_MAX] = config_file.getint(section, PLAY_ALBUM_MAX)
        except:
            d[PLAY_ALBUM_MAX] = None
            
        try:
            d[PLAY_CENTER] = config_file.getboolean(section, PLAY_CENTER)
        except:
            d[PLAY_CENTER] = False
        try:
            d[PLAY_MAX] = config_file.getint(section, PLAY_MAX)
        except:
            d[PLAY_MAX] = None			

        try:
            spl = config_file.get(section, PLAY_TYPE_POS).split(',')		
            d[PLAY_TYPE_POS] = (int(spl[0]), int(spl[1]))
        except:
            d[PLAY_TYPE_POS] = None
        try:
            spl = config_file.get(section, PLAY_TYPE_COLOR).split(',')
            d[PLAY_TYPE_COLOR] = (int(spl[0]), int(spl[1]), int(spl[2]))
        except:
            d[PLAY_TYPE_COLOR] = (255,255,255)			
        try:
            spl = config_file.get(section, PLAY_TYPE_DIM).split(',')
            d[PLAY_TYPE_DIM] =  (int(spl[0]), int(spl[1]))
        except:
            d[PLAY_TYPE_DIM] = None
        try:
            spl = config_file.get(section, PLAY_SAMPLE_POS).split(',')		
            d[PLAY_SAMPLE_POS] = (int(spl[0]), int(spl[1]))
            d[PLAY_SAMPLE_STYLE] = spl[2]
        except:
            d[PLAY_SAMPLE_POS] = None
            d[PLAY_SAMPLE_STYLE] = FONT_STYLE_B

        try:
            spl = config_file.get(section, TIME_REMAINING_POS).split(',')		
            d[TIME_REMAINING_POS] = (int(spl[0]), int(spl[1]))
        except:
            d[TIME_REMAINING_POS] = None
        try:
            d[FONTSIZE_LIGHT] = config_file.getint(section, FONTSIZE_LIGHT)
        except:
            d[FONTSIZE_LIGHT] = 30			
        try:
            d[FONTSIZE_REGULAR] = config_file.getint(section, FONTSIZE_REGULAR)
        except:
            d[FONTSIZE_REGULAR] = 35
        try:
            d[FONTSIZE_BOLD] = config_file.getint(section, FONTSIZE_BOLD)
        except:
            d[FONTSIZE_BOLD] = 40	
        try:
            d[FONTSIZE_DIGI] = config_file.getint(section, FONTSIZE_DIGI)
        except:
            d[FONTSIZE_DIGI] = 40
        try:
            spl = config_file.get(section, FONTCOLOR).split(',')
            d[FONTCOLOR] = (int(spl[0]), int(spl[1]), int(spl[2]))
        except:
            d[FONTCOLOR] = (255,255,255)	
        try:
            spl = config_file.get(section, TIMECOLOR).split(',')
            d[TIMECOLOR] = (int(spl[0]), int(spl[1]), int(spl[2]))
        except:
            d[TIMECOLOR] = (255,255,255)
        return d
        
