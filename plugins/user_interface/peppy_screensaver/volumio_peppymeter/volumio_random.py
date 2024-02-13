# Copyright 2024 PeppyMeter for Volumio by 2aCD
# 
# This file is part of PeppyMeter for Volumio
# 

import time
import ctypes

from socketIO_client import SocketIO
from threading import Thread

from configfileparser import METER, RANDOM_METER_INTERVAL
from volumio_configfileparser import RANDOM_TITLE
  
class RandomControl(Thread):
    """ Provides show albumart in a separate thread """
    
    def __init__(self, util, meter_config_volumio, meter):
        """ Initializer
        """
        Thread.__init__(self)

        self.meter = meter
        self.util = util
        self.meter_config = self.util.meter_config
        self.meter_config_volumio = meter_config_volumio
        self.run_flag = True
        self.first_run = True
        self.title_mem = ""
        self.random_meter = False
        self.list_meter = False
        # config values
        self.random_meter_interval = int(self.meter_config[RANDOM_METER_INTERVAL])
        self.random_title = self.meter_config_volumio[RANDOM_TITLE]
        if self.meter_config[METER] == "random":
            self.random_meter = True
        elif "," in self.meter_config[METER]:
            self.list_meter = True

        self.seconds = 0                    
        
    def run(self):
        """ Thread method. show all title infos and albumart. """
        
        def on_push_state(*args):
            #print (args[0]['status'] + args[0]['title'])
            if args[0]['status'] == 'play' and args[0]['title'] != self.title_mem:
                if not self.first_run:
                    time.sleep(2)
                    self.meter.restart()                
                self.title_mem = args[0]['title']
                #print('change')

            self.first_run = False

                
        def on_connect():
            #print('connect')
            if self.random_title:
                socketIO.on('pushState', on_push_state)
                socketIO.emit('getState', '', on_push_state)

        if self.random_meter or self.list_meter:
            socketIO = SocketIO('localhost', 3000)
            socketIO.once('connect', on_connect)
            
            # wait while run_flag true 
            while self.run_flag:

                # start random with random interval
                if not self.random_title:
                    if self.seconds == self.random_meter_interval:
                        self.seconds = 0
                        self.meter.restart()
                    self.seconds += 1
            
                socketIO.wait(1)		

            # on exit
            socketIO.disconnect()
            del socketIO
        
        # cleanup memory
        del self.meter
        del self.util
        del self.meter_config
        del self.meter_config_volumio
        self.trim_memory()
        #print('exit -->')
        
    def stop_thread(self):
        """ Stop thread """

        self.run_flag = False
        time.sleep(1)

    # cleanup memory on exit
    def trim_memory(self) -> int:
        libc = ctypes.CDLL("libc.so.6")
        return libc.malloc_trim(0)
            
# ===================================================================================================================	