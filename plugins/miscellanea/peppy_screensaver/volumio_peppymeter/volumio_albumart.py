# Copyright 2021 PeppyMeter for Volumio by 2aCD
# 
# This file is part of PeppyMeter for Volumio
# 

import time
import os.path
import pygame as pg
import requests
import io
import ctypes

try:
    import cairosvg
    from PIL import Image
except:
    pass # if it not properly installed

from socketIO_client import SocketIO
from threading import Thread, Timer
from configparser import ConfigParser

from configfileparser import METER
from volumio_configfileparser import ALBUMART_POS, ALBUMART_DIM, ALBUMBORDER, PLAY_TITLE_POS, PLAY_ARTIST_POS, PLAY_ALBUM_POS, PLAY_CENTER, PLAY_MAX, \
  FONTSIZE_LIGHT, FONTSIZE_REGULAR, FONTSIZE_BOLD, FONTCOLOR, PLAY_TITLE_STYLE, PLAY_ARTIST_STYLE, PLAY_ALBUM_STYLE, FONT_STYLE_L, FONT_STYLE_R, FONT_STYLE_B, \
  FONT_PATH, FONT_LIGHT, FONT_REGULAR, FONT_BOLD, TIME_REMAINING_POS, FONTSIZE_DIGI, TIMECOLOR, \
  PLAY_TYPE_POS, PLAY_TYPE_COLOR, PLAY_TYPE_DIM, PLAY_SAMPLE_POS, PLAY_SAMPLE_STYLE, EXTENDED_CONF

  
class AlbumartAnimator(Thread):
    """ Provides show albumart in a separate thread """
    
    def __init__(self, util, meter_config_volumio, base):
        """ Initializer

        :param util: utility class
        :param base: complete meter class
        """
        Thread.__init__(self)
        self.screen = util.PYGAME_SCREEN		
        self.base = base
        self.run_flag = True
        self.util = util
        self.meter_config = util.meter_config
        self.meter_config_volumio = meter_config_volumio
        self.meter_section = meter_config_volumio[self.meter_config[METER]]
        
    def run(self):
        """ Thread method. show all title infos and albumart. """
 		
        def on_push_state(*args):

            if args[0]['status'] == 'play':

                if self.meter_section[EXTENDED_CONF] == True:
                    # draw albumart
                    if args[0]['albumart'] != self.albumart_mem:
                        self.albumart_mem = args[0]['albumart']
                        title_factory.get_albumart_data(self.albumart_mem)
                        title_factory.render_aa(self.first_run)				

                    # draw title info
                    title_factory.get_title_data(args[0])
                    title_factory.render_text(self.first_run)

                    # draw reamining time, timer is started for countdown  
                    if self.meter_section[TIME_REMAINING_POS]:
                        duration = args[0]['duration'] if 'duration' in args[0] else 0
                        seek = args[0]['seek'] if 'seek' in args[0] and args[0]['seek'] is not None else 0
                        service = args[0]['service'] if 'service' in args[0] else ''					
                        self.time_args = [duration, seek, service]

                        # repeat timer start, initial with duration and seek -> remaining_time 
                        try:
                            self.timer_initial = True
                            timer.start() 
                        except:
                            pass
							
                    self.first_run = False
                self.status_mem = 'play'

            # simulate mouse event, if pause pressed
            elif args[0]['status'] == 'pause' and self.status_mem == 'play':
                #print ('pause')
                self.status_mem = 'pause'
                pg.event.post(pg.event.Event(pg.MOUSEBUTTONUP))

            # simulate mouse event, if stop pressed for webradio
            elif args[0]['service'] == 'webradio' and args[0]['status'] == 'stop' and self.status_mem == 'play':
                self.status_mem = 'stop'
                pg.event.post(pg.event.Event(pg.MOUSEBUTTONUP))
				
            else:
                self.status_mem = 'other'

				
        def remaining_time():
            title_factory.get_time_data(self.time_args, self.timer_initial)
            title_factory.render_time(self.first_run_digi)

            self.timer_initial = False # countdown without new input values
            self.first_run_digi = False
			
        def on_connect():
            #print('connect')
            socketIO.on('pushState', on_push_state)
            socketIO.emit('getState', '', on_push_state)

        #def on_disconnect():
            # print('disconnect')
            # stop all ticker daemons
            #title_factory.stop_text_animator()
            #timer.cancel()
        
        self.albumart_mem = ''
        self.status_mem = 'pause'
        self.first_run = True
        self.first_run_digi = True
        timer = RepeatTimer(1, remaining_time)

        if self.meter_section[EXTENDED_CONF] == True:		
            title_factory = ImageTitleFactory(self.util, self.base, self.meter_config_volumio)
            title_factory.load_fonts() # load fonts for title info
        else:
            title_factory = None

        socketIO = SocketIO('localhost', 3000)
        socketIO.once('connect', on_connect)
        #socketIO.on('disconnect', on_disconnect)
		
        # wait while run_flag true 
        while self.run_flag:
            socketIO.wait(1)		

        # on exit
        socketIO.disconnect()
        if self.meter_section[EXTENDED_CONF] == True:
            title_factory.stop_text_animator()
            timer.cancel()
            del timer
            time.sleep(1)
        
        # cleanup memory
        del title_factory
        del self.screen		
        del self.base
        del self.util
        del self.meter_config
        del socketIO
        self.trim_memory()
        # exit -->

    def stop_thread(self):
        """ Stop thread """

        self.run_flag = False
        time.sleep(1)

    # cleanup memory on exit
    def trim_memory(self) -> int:
        libc = ctypes.CDLL("libc.so.6")
        return libc.malloc_trim(0)
            
# ===================================================================================================================			
class ImageTitleFactory():
    """ Provides show albumart in a separate thread """
    
    def __init__(self, util, base, meter_config_volumio):
        """ Initializer

        :param util: utility class
        :param ui_refresh_period
        """

        self.screen = util.PYGAME_SCREEN		
        self.util = util
        self.meter_config = meter_config_volumio
        #self.config = ConfigParser()
        self.meter_section = meter_config_volumio[util.meter_config[METER]]
        self.base = base
        self.titleMem = ""
        
    def load_fonts(self):
        """ load fonts for titleinfo """
        FontPath = self.meter_config[FONT_PATH]
        FontPathDigi = os.path.dirname(os.path.realpath(__file__)) + '/fonts/DSEG7Classic-Italic.ttf'

        # font style light
        self.fontL = None
        if os.path.exists(FontPath + self.meter_config[FONT_LIGHT]):
            self.fontL = pg.font.Font(FontPath + self.meter_config[FONT_LIGHT], self.meter_section[FONTSIZE_LIGHT])
        else:
            self.fontL = pg.font.SysFont(None, 50)
       
        # font style regular
        self.fontR = None
        if os.path.exists(FontPath + self.meter_config[FONT_REGULAR]):
            self.fontR = pg.font.Font(FontPath + self.meter_config[FONT_REGULAR], self.meter_section[FONTSIZE_REGULAR])
        else:
            self.fontR = pg.font.SysFont(None, 50)
        
        # font style bold
        self.fontB = None
        if os.path.exists(FontPath + self.meter_config[FONT_BOLD]):		
            self.fontB = pg.font.Font(FontPath + self.meter_config[FONT_BOLD], self.meter_section[FONTSIZE_BOLD])
        else:
            self.fontB = pg.font.SysFont(None, 70, bold=True)
        
        # digital font for remaining time
        self.FontDigi = None
        if os.path.exists(FontPathDigi) and self.meter_section[FONTSIZE_DIGI]:
            self.fontDigi = pg.font.Font(FontPathDigi, self.meter_section[FONTSIZE_DIGI])
        else:
            self.fontDigi = pg.font.SysFont(None, 40)
	
        self.fontcolor = self.meter_section[FONTCOLOR]
        #green = (84, 198, 136)

    # get data functions
    # ----------------------------------	
    def get_title_data(self, play_info):
        """ get title infos from argument """
        #print(play_info)			
        if hasattr(self, 'playinfo_title'):
            self.titleMem = self.playinfo_title
        self.playinfo_title = play_info['title'] if play_info['title'] is not None else ''
        self.playinfo_artist = play_info['artist'] if play_info['artist'] is not None else ''
        self.playinfo_album = play_info['album'] if play_info['album'] is not None else ''
        self.playinfo_trackT = play_info['trackType'] if play_info['trackType'] is not None else ''
        self.playinfo_sample = play_info['samplerate'] if 'samplerate' in play_info and play_info['samplerate'] is not None else ''
        self.playinfo_depth = play_info['bitdepth'] if 'bitdepth' in play_info and play_info['bitdepth'] is not None else ''
        playinfo_rate = play_info['bitrate'] if 'bitrate' in play_info and play_info['bitrate'] is not None else '' 
        if self.playinfo_sample =='':
            self.playinfo_sample = playinfo_rate # for webradio
        if not self.meter_section[PLAY_ALBUM_POS] and self.playinfo_album != '':
            self.playinfo_artist = self.playinfo_artist + " - " + self.playinfo_album
        if self.playinfo_trackT == 'dsf':
            self.playinfo_trackT = 'dsd'		

    def get_albumart_data(self, play_info):
        """ get albumart infos from argument """	
                
        albumart = play_info
        if len(albumart) == 0:
            albumart = 'http://localhost:3000/albumart'			
        if 'http' not in albumart:
            albumart = 'http://localhost:3000' + play_info

        #print (albumart)
        response = requests.get(albumart)
        self.aa_img = None
        self.aa_img = pg.image.load(io.BytesIO(response.content))
        if self.meter_section[ALBUMART_DIM]:
            self.aa_img = pg.transform.scale(self.aa_img, self.meter_section[ALBUMART_DIM])
					

    def get_time_data(self, time_args, timer_init):
        """ get time data """

        self.NoTime = False
        seek_current = int(float(time_args[1])/1000)
        # set initial to current and then count automatcally
        self.seek_new = seek_current if timer_init else self.seek_new + 1

        # webradio has no time info
        if time_args[2] == 'webradio':
            self.remain = time_args[0] 		
            if time_args[0] == 0:
                self.NoTime = True
        else:
            self.remain = 0 if time_args[0] - self.seek_new <= 0 else time_args[0] - self.seek_new			
        self.timecolor = self.meter_section[TIMECOLOR] if self.remain > 10 else (242,0,0) # red for last 10 seconds
        self.remain = '{:02d}:{:02d}'.format( self.remain // 60, self.remain %60)

    # render data functions
    # ----------------------------------
    def render_aa(self, firstrun):
        """ render albumart """

        if self.meter_section[ALBUMART_POS]:
            aa_rect = pg.Rect(self.meter_section[ALBUMART_POS][0], self.meter_section[ALBUMART_POS][1], self.meter_section[ALBUMART_DIM][0], self.meter_section[ALBUMART_DIM][1])
            if firstrun: # backup clean area on first run
                self.AABackup = None
                self.AABackup = self.screen.subsurface(aa_rect).copy()
            self.screen.blit(self.AABackup, aa_rect)
            self.screen.blit(self.aa_img, aa_rect) # draw albumart
            if self.meter_section[ALBUMBORDER]:
                pg.draw.rect(self.screen, self.fontcolor, aa_rect, self.meter_section[ALBUMBORDER])   # draw border
            # update albumart rectangle
            self.base.update_rectangle(aa_rect)
        
    def render_time(self, firstrun):
        """ render time info """

        imgDigi = self.fontDigi.render(self.remain, True, self.timecolor)			
        time_rect = pg.Rect(self.meter_section[TIME_REMAINING_POS][0], self.meter_section[TIME_REMAINING_POS][1], imgDigi.get_width(), self.fontDigi.get_height())

        if firstrun: # backup clean area on first run
            self.imgTimeBackup = None
            self.imgTimeBackup = self.screen.subsurface(time_rect).copy()
        self.screen.blit(self.imgTimeBackup, time_rect)
        # webradio has no time info
        if self.NoTime == False:
            self.screen.blit(imgDigi, time_rect)
        # update time rectangle
        self.base.update_rectangle(time_rect)
        
    def render_text(self, firstrun):
        """ render text objects """

        formatIcon = '/volumio/http/www3/app/assets-common/format-icons/' + self.playinfo_trackT + '.svg'
                
        def set_color(img, color):
            for x in range(img.get_width()):
                for y in range(img.get_height()):
                    color.a = img.get_at((x, y)).a  # Preserve the alpha value.
                    img.set_at((x, y), color)  # Set the color of the pixel.

        def render_txt(rendertxt, fontstyle):
            if fontstyle == FONT_STYLE_L:
                ret = self.fontL.render(rendertxt, True, self.fontcolor )
            elif fontstyle == FONT_STYLE_R:
                ret = self.fontR.render(rendertxt, True, self.fontcolor )
            else:
                ret = self.fontB.render(rendertxt, True, self.fontcolor )
            return ret

        def update_txt(imgtxt, rect):
            if self.meter_section[PLAY_CENTER] == True: # center title position
                self.screen.blit(imgtxt, (rect.centerx - int(imgtxt.get_width()/2), rect.y))
            else:
                self.screen.blit(imgtxt, rect)
            self.base.update_rectangle(rect)
                    
        # title, artist, album
        imgTitle_long = render_txt(self.playinfo_title, self.meter_section[PLAY_TITLE_STYLE])
        imgArtist_long = render_txt(self.playinfo_artist, self.meter_section[PLAY_ARTIST_STYLE])            
        imgAlbum_long = render_txt(self.playinfo_album, self.meter_section[PLAY_ALBUM_STYLE])
            
        # samplerate + bitdepth
        if self.meter_section[PLAY_SAMPLE_STYLE] == FONT_STYLE_R:
            imgSample_long = self.fontR.render((self.playinfo_sample + " " + self.playinfo_depth).rstrip(), True, self.meter_section[PLAY_TYPE_COLOR] )
            imgSample_size = self.fontR.size("-44.1 kHz 24 bit-") # max widht to create rectangle for clear area
        elif self.meter_section[PLAY_SAMPLE_STYLE] == FONT_STYLE_B:
            imgSample_long = self.fontB.render((self.playinfo_sample + " " + self.playinfo_depth).rstrip(), True, self.meter_section[PLAY_TYPE_COLOR] )
            imgSample_size = self.fontB.size("-44.1 kHz 24 bit-") # max widht to create rectangle for clear area
        else:
            imgSample_long = self.fontL.render((self.playinfo_sample + " " + self.playinfo_depth).rstrip(), True, self.meter_section[PLAY_TYPE_COLOR] )
            imgSample_size = self.fontL.size("-44.1 kHz 24 bit-") # max widht to create rectangle for clear area
            
        if self.titleMem != self.playinfo_title: # only if title changed
        
            # trackType
            if self.meter_section[PLAY_TYPE_POS] and self.meter_section[PLAY_TYPE_DIM]:
                type_rect = pg.Rect(self.meter_section[PLAY_TYPE_POS], self.meter_section[PLAY_TYPE_DIM])
                if firstrun: # backup clean area on first run
                    self.imgFormatBackup = None
                    self.imgFormatBackup = self.screen.subsurface(type_rect).copy()
                self.screen.blit(self.imgFormatBackup, type_rect)

                if os.path.exists(formatIcon):
                    try:
                        new_bites = cairosvg.svg2png(url = formatIcon)
                        imgType = Image.open(io.BytesIO(new_bites))

                        # scale 
                        imgType.thumbnail((type_rect.width, type_rect.height), Image.ANTIALIAS) 
                        # create pygame image surface
                        format_img = pg.image.fromstring(imgType.tobytes(), imgType.size, imgType.mode)			
                        set_color(format_img, pg.Color(self.meter_section[PLAY_TYPE_COLOR][0], self.meter_section[PLAY_TYPE_COLOR][1], self.meter_section[PLAY_TYPE_COLOR][2])) 
			
                        # center type icon in surface
                        if imgType.height >= imgType.width:
                            PlayTypePos = self.meter_section[PLAY_TYPE_POS] 
                        else:				
                            PlayTypePos = (self.meter_section[PLAY_TYPE_POS][0], int(self.meter_section[PLAY_TYPE_POS][1] + self.meter_section[PLAY_TYPE_DIM][0]/2 - imgType.height/2))
                        self.screen.blit(format_img, PlayTypePos)
                    
                    # if cairosvg not properly installed use text instead
                    except:
                        if self.meter_section[PLAY_SAMPLE_POS]:
                            if self.meter_section[PLAY_CENTER] == True:
                                typePos_Y = self.meter_section[PLAY_TYPE_POS][1]
                                typeStr = self.playinfo_trackT
                            else:
                                typePos_Y = self.meter_section[PLAY_SAMPLE_POS][1]
                                typeStr = self.playinfo_trackT[:4]                            
                            
                            if self.meter_section[PLAY_SAMPLE_STYLE] == FONT_STYLE_R:
                                imgTrackT = self.fontR.render(typeStr, True, self.meter_section[PLAY_TYPE_COLOR])
                            elif self.meter_section[PLAY_SAMPLE_STYLE] == FONT_STYLE_B:
                                imgTrackT = self.fontB.render(typeStr, True, self.meter_section[PLAY_TYPE_COLOR])
                            else:
                                imgTrackT = self.fontL.render(typeStr, True, self.meter_section[PLAY_TYPE_COLOR])

                            type_rect = pg.Rect((self.meter_section[PLAY_TYPE_POS][0], typePos_Y), imgTrackT.get_size())                           
                            self.screen.blit(imgTrackT, type_rect)
 
                else:
                    # clear area, webradio has no type
                    self.screen.blit(self.imgFormatBackup, type_rect)
                # update tracktype rectangle
                self.base.update_rectangle(type_rect)
						
            # stop all ticker if title info changed
            self.stop_text_animator()
            
            # title info			
            if self.meter_section[PLAY_TITLE_POS] and self.meter_section[PLAY_MAX]:
                title_rect = pg.Rect(self.meter_section[PLAY_TITLE_POS], (self.meter_section[PLAY_MAX], imgTitle_long.get_height()))
                #print(imgTitle_long.get_height())
                if firstrun: # backup clean area on first run
                    self.imgTitleBackup = None
                    self.imgTitleBackup = self.screen.subsurface(title_rect).copy()
                self.screen.blit(self.imgTitleBackup, title_rect)
                #pg.draw.rect(self.screen, (200,200,200), title_rect)

                if imgTitle_long.get_width() - 5 <= title_rect.width: 
                    update_txt(imgTitle_long, title_rect)
                else: # start ticker daemon title
                    self.text_animator_title = None
                    self.text_animator_title = self.start_text_animator(self.base, self.imgTitleBackup, imgTitle_long, title_rect)

            # artist info
            if self.meter_section[PLAY_ARTIST_POS] and self.meter_section[PLAY_MAX]:		
                artist_rect = pg.Rect(self.meter_section[PLAY_ARTIST_POS], (self.meter_section[PLAY_MAX], imgArtist_long.get_height()))
                if firstrun: # backup clean area on first run
                    self.imgArtistBackup = None
                    self.imgArtistBackup = self.screen.subsurface(artist_rect).copy()
                self.screen.blit(self.imgArtistBackup, artist_rect)
                #pg.draw.rect(self.screen, (200,200,200), artist_rect)

                if imgArtist_long.get_width() - 5 <= artist_rect.width:
                    update_txt(imgArtist_long, artist_rect)
                else: # start ticker daemon artist
                    self.text_animator_artist = None
                    self.text_animator_artist = self.start_text_animator(self.base, self.imgArtistBackup, imgArtist_long, artist_rect)

            # album info			
            if self.meter_section[PLAY_ALBUM_POS] and self.meter_section[PLAY_MAX]:
                album_rect = pg.Rect(self.meter_section[PLAY_ALBUM_POS], (self.meter_section[PLAY_MAX], imgAlbum_long.get_height()))
                if firstrun: # backup clean area on first run
                    self.imgAlbumBackup = None
                    self.imgAlbumBackup = self.screen.subsurface(album_rect).copy()
                self.screen.blit(self.imgAlbumBackup, album_rect)
                #pg.draw.rect(self.screen, (200,200,200), album_rect)

                if imgAlbum_long.get_width() - 5 <= album_rect.width:
                    update_txt(imgAlbum_long, album_rect)
                else: # start ticker daemon album
                    self.text_animator_album = None
                    self.text_animator_album = self.start_text_animator(self.base, self.imgAlbumBackup, imgAlbum_long, album_rect)

        # frame rate info                
        if self.meter_section[PLAY_SAMPLE_POS]: 
            sample_pos_bk = self.meter_section[PLAY_SAMPLE_POS][0]
            sample_pos = self.meter_section[PLAY_SAMPLE_POS][0]
            # center sample position
            if self.meter_section[PLAY_CENTER] == True:
                sample_pos_bk += int((self.meter_section[PLAY_MAX] - imgSample_size[0])/2)
                sample_pos += int((self.meter_section[PLAY_MAX] - imgSample_long.get_width())/2)
            sample_rect = pg.Rect((sample_pos_bk, self.meter_section[PLAY_SAMPLE_POS][1]), imgSample_size)

            if firstrun: # backup clean area on first run
                self.imgSampleBackup = None
                self.imgSampleBackup = self.screen.subsurface(sample_rect).copy()
            self.screen.blit(self.imgSampleBackup, sample_rect)
            #pg.draw.rect(self.screen, (200,200,200), sample_rect)
            self.screen.blit(imgSample_long, (sample_pos, sample_rect.y))
            # update sample rectangle
            self.base.update_rectangle(sample_rect)
                
    # text animator functions
    # ----------------------------------
    def start_text_animator(self, base, imgBackup, imgTxt, imgRect):
        """ start daemon for text animation""" 
		
        a = TextAnimator(self.util, base, imgBackup, imgTxt, imgRect)
        #a.setDaemon(True)
        a.start()        
        return a
		
    def stop_text_animator(self):
        """ stop daemons for text animation """

        if hasattr(self, 'text_animator_title') and self.text_animator_title is not None:
            self.text_animator_title.stop_thread()			
            del self.text_animator_title
        if hasattr(self, 'text_animator_artist') and self.text_animator_artist is not None:
            self.text_animator_artist.stop_thread()			
            del self.text_animator_artist
        if hasattr(self, 'text_animator_album') and self.text_animator_album is not None:
            self.text_animator_album.stop_thread()
            del self.text_animator_album
        self.trim_memory()
        time.sleep(self.base.ui_refresh_period * 1.2)

    # cleanup memory on exit
    def trim_memory(self) -> int:
        libc = ctypes.CDLL("libc.so.6")
        return libc.malloc_trim(0)
        
# ===================================================================================================================		
class TextAnimator(Thread):
    """ Provides show ticker in a separate thread """
    
    def __init__(self, util, base, imgBackup, imgTxt, imgRect):
        """ Initializer

        :param util: utility class
        :param ui_refresh_period
        :param imgBackup: backup surface for clean
        :param imTxt: txt surface
        :param imgRect: rectangle for update
        """
        Thread.__init__(self)
        self.base = base
        self.screen = util.PYGAME_SCREEN		
        self.backup = imgBackup
        self.txt = imgTxt
        self.rct = imgRect
        self.run_flag = True
        
    def run(self):
        """ Thread method. draw ticker """
	
        x = 0
        while self.run_flag:
            
            self.screen.blit(self.backup, self.rct)
            #pg.draw.rect(self.screen, (200,200,200), self.rct)
            self.screen.blit(self.txt, (self.rct.x, self.rct.y), ((x, 0), self.rct.size))                        
            if self.rct.width + x >= self.txt.get_width():
                xd = -1 # backward
            elif x <= 0:
                xd = 1  # forward
            x += xd
            
            self.base.update_rectangle(self.rct)
            time.sleep(self.base.ui_refresh_period)

        self.screen.blit(self.backup, self.rct)                    
        self.base.update_rectangle(self.rct)

        # cleanup memory
        del self.base
        del self.screen		
        del self.backup
        del self.txt
        del self.rct
        self.trim_memory()
        
    def stop_thread(self):
        """ Stop thread """

        self.run_flag = False
        time.sleep(self.base.ui_refresh_period * 1.2)

    # cleanup memory on exit
    def trim_memory(self) -> int:
        libc = ctypes.CDLL("libc.so.6")
        return libc.malloc_trim(0)
            
# RepeatTimer for remaining time
class RepeatTimer(Timer):
    def run(self):
        while not self.finished.wait(self.interval):
            self.function(*self.args, **self.kwargs)
