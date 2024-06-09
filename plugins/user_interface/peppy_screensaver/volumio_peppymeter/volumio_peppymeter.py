# Copyright 2024 PeppyMeter for Volumio by 2aCD
# 
# This file is part of PeppyMeter for Volumio
# 

import os, sys
import time
import ctypes
import resource
import pygame as pg
from pygame.time import Clock

# for pygame2 with sdl2 fadeIn and position is available
use_sdl2 = False
if pg.version.ver.startswith("2"):
    try:
        import pyscreenshot
        from pygame._sdl2 import Window
        use_sdl2 = True
    except:
        pass

from pathlib import Path
from threading import Thread

from peppymeter.peppymeter import Peppymeter
from configfileparser import *

from volumio_albumart import AlbumartAnimator
from volumio_spectrum import SpectrumOutput
from volumio_random import RandomControl
from volumio_configfileparser import Volumio_ConfigFileParser, EXTENDED_CONF, METER_VISIBLE, SPECTRUM_VISIBLE, COLOR_DEPTH, POSITION_TYPE, POS_X, POS_Y, START_ANIMATION

PeppyRunning = '/tmp/peppyrunning'
CurDir = os.getcwd()
PeppyPath = CurDir + '/screensaver/peppymeter'

class CallBack:
    """ Implements CallBack functions to start and stop albumart/spectrum animator """
    
    def __init__(self, util, meter_config_volumio, sdl2):
        """ Initializer

        :param util: peppymeter utility class
        :param meter_config_volumio: volumio meter configuration
        """

        self.util = util
        self.meter_config = self.util.meter_config
        self.meter_config_volumio = meter_config_volumio        
        self.first_run = True
        self.use_sdl2 = sdl2
        
    def vol_FadeIn_thread(self, arg):
        meter = arg
        for i in range(0, 100, 10): 
            meter.set_volume(i)
            time.sleep(0.07)
        meter.set_volume(100)

    def img_FadeIn(self, img, a):
        img.set_alpha(a)
        self.util.screen_copy.blit(img, (0,0))
        pg.display.update()
            
    def peppy_meter_start(self, meter):
        # print('start')                
        meter_section = self.meter_config[self.meter_config[METER]]
        meter_section_volumio = self.meter_config_volumio[self.meter_config[METER]]        
        animation = self.meter_config_volumio[START_ANIMATION]
        
        # fadeIn new screen to old
        clock = Clock()
        if (self.use_sdl2 and (animation or (not animation and not self.first_run))) or not self.first_run:
            screen_new = meter.util.PYGAME_SCREEN.copy()
            for i in range(0, 100, 2):
                self.img_FadeIn(screen_new, i)
                clock.tick(self.meter_config[FRAME_RATE])                
            self.img_FadeIn(screen_new, 255)
        self.first_run = False

        # restore default screen to pygame screen for all meter components
        meter.util.PYGAME_SCREEN = meter.util.screen_copy
        for comp in meter.components:
            comp.screen = meter.util.screen_copy
                    
        if meter_section_volumio[EXTENDED_CONF] == True:
            # stop meters when they are not visible
            if meter_section_volumio[METER_VISIBLE] == False:
                meter.stop()
        
            # start spectrum thread if visible
            if meter_section_volumio[SPECTRUM_VISIBLE] == True:
                self.spectrum_output = None
                self.spectrum_output = SpectrumOutput(self.util, self.meter_config_volumio, CurDir)
                self.spectrum_output.start()
        
            # print (self.get_memory() / 1024)

        # start albumart animator
        self.album_animator = None
        self.album_animator = AlbumartAnimator(self.util, self.meter_config_volumio)
        self.album_animator.start()

        # start volume fadeIn thread 
        meter.set_volume(0.0)
        if hasattr(self, 'FadeIn'):
            del self.FadeIn
        self.FadeIn = Thread(target = self.vol_FadeIn_thread, args=(meter, ))
        self.FadeIn.start()
        
    def peppy_meter_stop(self, meter):
        # print('stop')

        # save the current screen and reroute display output to a temporary surface        
        meter.util.screen_copy = meter.util.PYGAME_SCREEN
        meter.util.PYGAME_SCREEN = meter.util.PYGAME_SCREEN.copy()
            
        # stop spectrum, if running
        if hasattr(self, 'spectrum_output') and self.spectrum_output is not None:
            self.spectrum_output.stop_thread()
            if hasattr(self, 'spectrum_output'):
                del self.spectrum_output

        # stop albumart animator
        if hasattr(self, 'album_animator') and self.album_animator is not None:
            self.album_animator.stop_thread()
            if hasattr(self, 'album_animator'):
                del self.album_animator
                
        # delete fadeIn
        if hasattr(self, 'FadeIn'):
            del self.FadeIn
            
    def peppy_meter_update(self):
        if hasattr(self, 'spectrum_output') and self.spectrum_output is not None:
            self.spectrum_output.update()    
    
    def get_memory(self):
        with open('/proc/meminfo', 'r') as mem:
            free_memory = 0
            for i in mem:
                sline = i.split()
                #if str(sline[0]) in ('MemFree:', 'Buffers:', 'Cached:'):
                if str(sline[0]) in ('MemAvailable:'):
                    free_memory += int(sline[1])
        return free_memory
    
    # cleanup memory called on stop
    def trim_memory(self) -> int:
        libc = ctypes.CDLL("libc.so.6")
        return libc.malloc_trim(0)

    # cleanup memory called on exit
    def exit_trim_memory(self):
            
        # cleanup    
        if os.path.exists(PeppyRunning):
            os.remove(PeppyRunning)
                
        if hasattr(self, 'album_animator'):
            del self.album_animator
        del self.util
        self.trim_memory()

# end class callback ----------------------------------------------

def meter_thread(arg, meter_config_volumio):
    """ thread methode to start peppymeter initial"""

    pm = arg # peppymeter object
    screen_w = pm.util.meter_config[SCREEN_INFO][WIDTH]
    screen_h = pm.util.meter_config[SCREEN_INFO][HEIGHT]
    clock = Clock()
    
    if use_sdl2:
        # grab the current x11 screen to use as source for fadin peppymeter
        screenshot_img = pyscreenshot.grab()
        screenshot = pg.image.fromstring(screenshot_img.tobytes(), screenshot_img.size, screenshot_img.mode)
        # define white surface
        white = pg.Surface((screen_w,screen_h))
        white.fill(pg.Color(255,255,255))
        #step for screen sizing
        step = int((screen_w * 0.04)+0.5)
                 
        if meter_config_volumio[POSITION_TYPE] == "center":
            screen_x = (screenshot.get_width() - screen_w)/2
            screen_y = (screenshot.get_height() - screen_h)/2
        else:
            screen_x = meter_config_volumio[POS_X]
            screen_y = meter_config_volumio[POS_Y]
        aspect = screen_h / screen_w
        
        # use own isplay init with option HIDDEN to prevent black blizzard
        screen = init_display(screen_w, screen_h, hide = True) 
        win = Window.from_display_module()
        
        if meter_config_volumio[START_ANIMATION]:
            # use screenshot as start image
            screen.blit(screenshot,(-screen_x, -screen_y))
            pg.display.update()

            # draw transparent white to screen
            white.set_alpha(70)
            screen.blit(white,(0, 0))

            # show hidden screen on position
            win.position = (screen_x, screen_y)
            Window.show(win)

            # update screen for resizing
            for i in range(screen_w - 5, 0, -step):             
                pg.display.update(0,0, screen_w-i, int(screen_h-i*aspect))
                clock.tick(50) 
            pg.display.update()

            # set the current screen as source for fadeIn
            pm.util.screen_copy = screen
            # redirect the follow meter output to temporary screen 
            pm.util.PYGAME_SCREEN = screen.copy()
        
        else:
            # show hidden screen on position
            win.position = (screen_x, screen_y)
            Window.show(win)
            
            pm.util.PYGAME_SCREEN = screen
            pm.util.screen_copy = screen
            
    else:
        # use own init_display without option HIDDEN
        pm.util.PYGAME_SCREEN = init_display(screen_w, screen_h)
        pm.util.screen_copy = pm.util.PYGAME_SCREEN
    
    # start peppymeter display output
    pm.meter.current_volume = 0.0
    pm.start_display_output()
    # wait for exit on main loop <------

    # after exit main loop
    if use_sdl2 and meter_config_volumio[START_ANIMATION]:
        pm.util.PYGAME_SCREEN = pm.util.screen_copy
        pg.event.set_blocked(None)
        win.position = (screen_x, screen_y)

        # fade to transparent white
        for i in range(0, 75, 10): 
            white.set_alpha(i)
            pm.util.PYGAME_SCREEN.blit(white, (0,0))
            pg.display.update()
            clock.tick(pm.util.meter_config[FRAME_RATE])

        # reduce the window size
        for i in range(0, screen_w - 5, step):
            win.size = (screen_w-i, int(screen_h-i*aspect))
            clock.tick(50)

    pm.exit()

    
def init_display(screen_w, screen_h, hide = False):
    """
    alternative methode for display initialization
    for usage with SDL2 with option HIDDEN
    """

    depth = meter_config_volumio[COLOR_DEPTH]
    pm.util.meter_config[SCREEN_INFO][DEPTH] = depth

    os.environ["SDL_FBDEV"] = pm.util.meter_config[SDL_ENV][FRAMEBUFFER_DEVICE]

    if pm.util.meter_config[SDL_ENV][MOUSE_ENABLED]:
        os.environ["SDL_MOUSEDEV"] = pm.util.meter_config[SDL_ENV][MOUSE_DEVICE]
        os.environ["SDL_MOUSEDRV"] = pm.util.meter_config[SDL_ENV][MOUSE_DRIVER]
    else:
        os.environ["SDL_NOMOUSE"] = "1"
                
    if not pm.util.meter_config[SDL_ENV][VIDEO_DRIVER] == "dummy":
        os.environ["SDL_VIDEODRIVER"] = pm.util.meter_config[SDL_ENV][VIDEO_DRIVER]
        os.environ["DISPLAY"] = pm.util.meter_config[SDL_ENV][VIDEO_DISPLAY]
    pg.display.init()
    pg.mouse.set_visible(False)
    pg.font.init()

    if pm.util.meter_config[SDL_ENV][DOUBLE_BUFFER]:
        flags = pg.DOUBLEBUF | pg.HIDDEN | pg.NOFRAME if hide else pg.DOUBLEBUF | pg.NOFRAME
        screen = pg.display.set_mode((screen_w, screen_h), flags, depth)
    
    else:
        flags = pg.HIDDEN | pg.NOFRAME if hide else pg.NOFRAME
        screen = pg.display.set_mode((screen_w, screen_h), flags)
                                                         
    pm.util.meter_config[SCREEN_RECT] = pg.Rect(0, 0, screen_w, screen_h)
    return screen
        
def memory_limit():
    soft, hard = resource.getrlimit(resource.RLIMIT_AS)
    free_memory = get_memory() * 1024
    resource.setrlimit(resource.RLIMIT_AS, (free_memory + 90000000, hard))
    # print(free_memory / 1024 /1024)
           
def get_memory():
    with open('/proc/meminfo', 'r') as mem:
        free_memory = 0
        for i in mem:
            sline = i.split()
            #if str(sline[0]) in ('MemFree:', 'Buffers:', 'Cached:'):
            if str(sline[0]) in ('MemAvailable:'):
                free_memory += int(sline[1])
    return free_memory

# cleanup memory on exit
def trim_memory() -> int:
    libc = ctypes.CDLL("libc.so.6")
    return libc.malloc_trim(0)
        
if __name__ == "__main__":
    """ This is called by Volumio """

    #enable threading!! 
    ctypes.CDLL('libX11.so.6').XInitThreads()
    
    # get the peppy meter object
    os.chdir(PeppyPath) # to find the config file
    pm = Peppymeter(standalone=True, timer_controlled_random_meter=False, quit_pygame_on_stop=False)
    
    # parse additional volumio configuration values  
    parser = Volumio_ConfigFileParser(pm.util)   
    meter_config_volumio = parser.meter_config_volumio
    
    # define the callback functions
    callback = CallBack(pm.util, meter_config_volumio, use_sdl2)
    pm.meter.callback_start = callback.peppy_meter_start
    pm.meter.callback_stop = callback.peppy_meter_stop
    pm.dependent = callback.peppy_meter_update
    pm.meter.malloc_trim = callback.trim_memory
    pm.malloc_trim = callback.exit_trim_memory
            
    # start display output until break       
    memory_limit() # Limitates maximun memory usage
    try:
        Path(PeppyRunning).touch()
        Path(PeppyRunning).chmod(0o0777)
     
        # start random control in separate thread
        Random_Control = RandomControl(pm.util, meter_config_volumio, pm.meter)
        # Random_Control.callback_start = callback.peppy_meter_start
        Random_Control.start()
        
        # start meter output in separate thread
        meter_output = Thread(target = meter_thread, args=(pm, meter_config_volumio, ))
        meter_output.start()
                
        # stop if PeppyRunning deleted from external script
        while os.path.exists(PeppyRunning):
            time.sleep(1)
        
        Random_Control.stop_thread()
        pg.event.post(pg.event.Event(pg.MOUSEBUTTONUP))
        
    except MemoryError:
        print('ERROR: Memory Exception')
        callback.exit_trim_memory()
        del pm
        del callback
        trim_memory()            
        if os.path.exists(PeppyRunning):
            os.remove(PeppyRunning)
        os._exit(1)
