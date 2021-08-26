# Copyright 2021 PeppyMeter for Volumio by 2aCD
# 
# This file is part of PeppyMeter for Volumio
# 

import time
import ctypes
import os
import resource

from peppymeter import Peppymeter
from volumio_albumart import AlbumartAnimator
from datasource import DataSource, SOURCE_NOISE, SOURCE_PIPE, SOURCE_HTTP
from configfileparser import BASE_PATH, DATA_SOURCE, TYPE, OUTPUT_DISPLAY
from volumio_configfileparser import Volumio_ConfigFileParser

class CallBack:
    """ Implements CallBack functions to start and stop albumart animator """
    
    def __init__(self, util, meter, meter_config):
        """ Initializer

        :param util: peppymeter utility class
        :param meter_config: volumio meter configuration
        """
        self.meter = meter
        self.util = util
        self.meter_config = meter_config
        
    def peppy_meter_start(self, meter):
        # start albumart animator
        self.album_animator = None
        self.album_animator = AlbumartAnimator(self.util, self.meter_config, meter)
        self.album_animator.start()
        # print (self.get_memory() / 1024)
        
    def peppy_meter_stop(self, meter):
        # stop albumart animator if is running
        if hasattr(self, 'album_animator') and self.album_animator is not None:
            self.album_animator.stop_thread()
            del self.album_animator        
        
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

    # cleanup memory called on stop
    def exit_trim_memory(self):
        
        del self.album_animator
        del self.meter
        del self.util
        self.trim_memory()
# end class callback ----------------------------------------------
    
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

    
    # get the peppy meter object
    pm = Peppymeter(standalone=True)

    # parse additional volumio configuration values  
    parser = Volumio_ConfigFileParser(pm.util.meter_config[BASE_PATH])
    meter_config_volumio = parser.meter_config_volumio

    # define the callback functions
    callback = CallBack(pm.util, pm.meter, meter_config_volumio)
    pm.meter.callback_start = callback.peppy_meter_start
    pm.meter.callback_stop = callback.peppy_meter_stop
    pm.meter.malloc_trim = callback.trim_memory
    pm.malloc_trim = callback.exit_trim_memory
    
    # start display output until break
    source = pm.util.meter_config[DATA_SOURCE][TYPE]
    if source == SOURCE_PIPE:        

        memory_limit() # Limitates maximun memory usage
        try:
            pm.init_display()
    
            if pm.util.meter_config[OUTPUT_DISPLAY]:
                pm.start_display_output()

        except MemoryError:
            print('ERROR: Memory Exception')
            callback.exit_trim_memory()
            del pm
            del callback
            trim_memory()            
            os._exit(1)
