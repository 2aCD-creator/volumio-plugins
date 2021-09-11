'use strict';

var libQ = require('kew');
var fs=require('fs-extra');
var config = new (require('v-conf'))();
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var sizeOf = require('image-size');

const lineReader = require('line-reader');
const io = require('socket.io-client');
const socket = io.connect('http://localhost:3000');
const path = require('path');
const ini = require('ini');
const PeppyPath = '/data/plugins/miscellanea/peppy_screensaver/peppymeter/';
const id = 'peppy_screensaver: ';

var minmax = new Array(5);
var last_outputdevice, last_softmixer;

var MPD = '/volumio/app/plugins/music_service/mpd/mpd.conf.tmpl'
var MPDT = '/volumio/app/plugins/music_service/mpd/mpd.conf_tmp.tmpl'
var AIR = '/volumio/app/plugins/music_service/airplay_emulation/shairport-sync.conf.tmpl'
var availMeters = '';
var uiNeedsUpdate;
  
module.exports = peppyScreensaver;
function peppyScreensaver(context) {
	var self = this;

	self.context = context;
	self.commandRouter = self.context.coreCommand;
	self.logger = self.context.logger;
	self.configManager = self.context.configManager;
};


peppyScreensaver.prototype.onVolumioStart = function()
{
	var self = this;
	var configFile = self.commandRouter.pluginManager.getConfigurationFile(self.context,'config.json');
	self.config = new (require('v-conf'))();
	self.config.loadFile(configFile);

    return libQ.resolve();
};

peppyScreensaver.prototype.onStart = function() {
    var self = this;
    var defer=libQ.defer();
    var lastStateIsPlaying = false;
    var Timeout;

    // load language strings here again, otherwise needs restart after installation
    self.commandRouter.loadI18nStrings();
    
    // create fifo pipe
    self.install_mkfifo();
    // load snd dummy for peppymeter output 
    self.install_dummy();
        
    if (self.IfBuster()) {
      //self.logger.info('_________________ detect Buster _________________');

      // inject additional output to peppymeter it's removed on stop
      try {
        var data = fs.readFileSync(MPD, 'utf-8');
        if ((data).indexOf('mpd_peppyalsa') < 0) {
            self.add_mpdoutput (MPD, MPDT)
                .then(self.recreate_mpdconf.bind(self))
                .then(self.restartMpd.bind(self));
        }
      } catch (err) {
        self.logger.error(id + MPD + 'not found');
      }
    
      last_outputdevice = self.getAlsaConfigParam('outputdevice');
      last_softmixer = self.getAlsaConfigParam('softvolume');
      
      self.updateALSAConfigFile().then (function(){
             
        // modular alsa 16bit/24bit enabled, switch if needed
        var alsaconf = parseInt(self.config.get('alsaSelection'),10);
        if (alsaconf == 0) {
            self.get_output_enabled(MPD).then (function(OutEnabled) {
                if (OutEnabled) {
                    self.switch_alsaConfig(alsaconf);                      
                }  
            });
            
            
        // native DSD enabled, switch if needed
        } else {            
            self.get_output_enabled(MPD).then (function(OutEnabled) {
                if (!OutEnabled) {
                    self.switch_alsaConfig(alsaconf);                      
                }
            });
        }

        // event callback if outputdevice or mixer changed
        self.commandRouter.sharedVars.registerCallback('alsa.outputdevice', self.switch_alsaModular.bind(self));
      
      });
        
    } else {
        //self.logger.info('_________________ detect Jessie _________________');

        // inject additional output to peppymeter it's removed on stop
        // and create asound.conf from template
        try {
            var data = fs.readFileSync(MPD, 'utf-8');
            if ((data).indexOf('mpd_peppyalsa') < 0) {
                self.createAsoundConfig()
                    .then(self.redirect_airoutput.bind(self, AIR))
                    .then(self.add_mpdoutput.bind(self, MPD, MPDT))
                    .then(self.redirect_mpdoutput.bind(self, MPD))
                    .then(self.recreate_mpdconf.bind(self))
                    .then(self.restartMpd.bind(self));
            }
        } catch (err) {
            self.logger.error(id + MPD + 'not found');
        }
      
        // event callback if outputdevice or mixer changed
        self.commandRouter.sharedVars.registerCallback('alsa.outputdevice', self.createAsoundConfig.bind(self));    

    }

    // event function on change state    
    socket.emit('getState', '');
    socket.on('pushState', function (state) {
        if (state.status === 'play' && !lastStateIsPlaying) {
          lastStateIsPlaying = true;
          var ScreenTimeout = (parseInt(self.config.get('timeout'),10)) * 1000;
          Timeout = setInterval(function () {
              exec( PeppyPath + 'run_peppymeter.sh', { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {        
                if (error !== null) {
                    self.logger.error(id + 'Error start PeppyMeter: ' + error);
                //} else {
                //    self.logger.info(id + 'Start PeppyMeter');
                }    
              });        
          }, ScreenTimeout);

        } else if (state.status !== 'play' && lastStateIsPlaying) {
          clearTimeout(Timeout);
          lastStateIsPlaying = false;
        }
    });


	
    // Once the Plugin has successfull started resolve the promise
	defer.resolve();

    return defer.promise;
};


peppyScreensaver.prototype.onStop = function() {
    var self = this;
    var defer=libQ.defer();

    self.commandRouter.stateMachine.stop().then(function () {
        fs.readFile(MPD, 'utf8', function (err, data) {
            if (err) {
                self.logger.error(id + MPD + 'not found');
            } else {
                if ((data).indexOf('mpd_peppyalsa') >= 0) {
                    // remove additional output to peppymeter
                    self.del_mpdoutput (MPD)
                        .then(self.MPD_allowedFormats.bind(self, MPD, true)) //remove allowed formats (only for buster needed)
                        .then (self.recreate_mpdconf.bind(self))
                        .then(self.restartMpd.bind(self));
                        
                } else {
                    self.logger.info (id + 'mpd template file already modified');
                }
                defer.resolve();                
            }
        });
          
        // stop events
        socket.off('pushState');
    });
    
    return libQ.resolve();
};


peppyScreensaver.prototype.onRestart = function() {
    var self = this;
    // Optional, use if you need it
};

peppyScreensaver.prototype.onInstall = function () {
    var self = this;
};

peppyScreensaver.prototype.onUninstall = function () {
  var self = this;
  //Perform your installation tasks here
};

// Configuration Methods -----------------------------------------------------------------------------

peppyScreensaver.prototype.getUIConfig = function() {
    var defer = libQ.defer();
    var self = this;

    var lang_code = self.commandRouter.sharedVars.get('language_code');

    self.commandRouter.i18nJson(__dirname+'/i18n/strings_'+lang_code+'.json',
        __dirname+'/i18n/strings_en.json',
        __dirname + '/UIConfig.json')
        .then(function(uiconf)
        {

        var config_file = PeppyPath + 'config.txt';
        
        // section 0 ------------
        uiconf.sections[0].hidden = false;        
        if (fs.existsSync(config_file)){
            // read values from ini
            var config = ini.parse(fs.readFileSync(config_file, 'utf-8')),
                meters_file = PeppyPath + config.current['meter.size'] + '/meters.txt',
                upperc = /\b([^-])/g;

            // alsa configuration only for buster
            if (self.IfBuster()) {
                uiconf.sections[0].content[0].hidden = false;
                uiconf.sections[0].content[0].value.value = self.config.get('alsaSelection');
                uiconf.sections[0].content[0].value.label = self.commandRouter.getI18nString('PEPPY_SCREENSAVER.ALSA_SELECTION_' + self.config.get('alsaSelection'));
            }
            
            // screensaver timeout
            uiconf.sections[0].content[1].value = self.config.get('timeout');
            minmax[0] = [uiconf.sections[0].content[1].attributes[2].min,
              uiconf.sections[0].content[1].attributes[3].max,
              uiconf.sections[0].content[1].attributes[0].placeholder];
                                        
            // active folder
            // fill selection list with custom folders
            var files = fs.readdirSync(PeppyPath);
            files.forEach(file => {
                var stat = fs.statSync(PeppyPath + file);
                if (stat.isDirectory() && file.startsWith ('custom')) {
                    self.configManager.pushUIConfigParam(uiconf, 'sections[0].content[2].options', {
                        value: file,
                        label: file.replace(upperc, c => c.toUpperCase())
                    });
                }
            });
            if (self.config.get('activeFolder') == '') {
                uiconf.sections[0].content[2].value.value = config.current['meter.size'];
                uiconf.sections[0].content[2].value.label = (uiconf.sections[0].content[2].value.value).replace(upperc, c => c.toUpperCase());
            } else {
                uiconf.sections[0].content[2].value.value = self.config.get('activeFolder');
                uiconf.sections[0].content[2].value.label = self.config.get('activeFolder_title');
            }

            // random interval / smooth buffer
            uiconf.sections[0].content[3].value = parseInt(config.current['random.meter.interval'], 10);
            uiconf.sections[0].content[4].value = parseInt(config.data.source['smooth.buffer.size'], 10);                                
            for (var i = 1; i < 3 ; i++) {
                minmax[i] = [uiconf.sections[0].content[i+2].attributes[2].min,
                    uiconf.sections[0].content[i+2].attributes[3].max,
                    uiconf.sections[0].content[i+2].attributes[0].placeholder];
            }


            // needle cache
            var needleCache = (config.current['use.cache']).toLowerCase() == 'true' ? true : false;
            uiconf.sections[0].content[5].value = needleCache;
            
            // mouse support
            var mouseSupport = (config.sdl.env['mouse.enabled']).toLowerCase() == 'true' ? true : false;
            uiconf.sections[0].content[6].value = mouseSupport;

            // section 1 ------------
            uiconf.sections[1].hidden = false;
            availMeters = '';
            
            if (fs.existsSync(meters_file)){
                var metersconfig = ini.parse(fs.readFileSync(meters_file, 'utf-8'));

                // current meter
                if ((config.current.meter).includes(',')) {
                    uiconf.sections[1].content[0].value.value = 'list';
                } else {
                    uiconf.sections[1].content[0].value.value = config.current.meter;
                }
                uiconf.sections[1].content[0].value.label = (uiconf.sections[1].content[0].value.value).replace(upperc, c => c.toUpperCase());

                // read all sections from active meters.txt and fill selection list
                for (var section in metersconfig) {
                    availMeters += section + ',';
                    self.configManager.pushUIConfigParam(uiconf, 'sections[1].content[0].options', {
                        value: section,
                        label: section.replace(upperc, c => c.toUpperCase())
                    });
                }

                // list selection
                availMeters = availMeters.substring(0, availMeters.length -1);
                if (self.config.get('randomSelection') == '') {
                    uiconf.sections[1].content[1].value = availMeters;
                } else {
                    uiconf.sections[1].content[1].value = self.config.get('randomSelection');
                }
                uiconf.sections[1].content[1].doc = self.commandRouter.getI18nString('PEPPY_SCREENSAVER.RANDOMSELECTION_DOC') + '<b>' + availMeters + '</b>';

            }
            
        } else {
            self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.NO_PEPPYCONFIG'));            
        }
            defer.resolve(uiconf);
        })
        .fail(function()
        {
            defer.reject(new Error());
        });


    
    return defer.promise;
};

peppyScreensaver.prototype.getConfigurationFiles = function() {
	return ['config.json'];
};

// called when 'save' button pressed global settings
peppyScreensaver.prototype.savePeppyMeterConf = function (confData) {
  const self = this;
  let noChanges = true;
  uiNeedsUpdate = false;

  if (fs.existsSync(PeppyPath + 'config.txt')){
    var config = ini.parse(fs.readFileSync(PeppyPath + 'config.txt', 'utf-8'));

    // write alsa selection
    if (self.IfBuster()) {        
        if (self.config.get('alsaSelection') != confData.alsaSelection.value) {
            self.config.set('alsaSelection', confData.alsaSelection.value);
            var alsaConf = parseInt(confData.alsaSelection.value,10);
            self.switch_alsaConfig(alsaConf);
            noChanges = false;
        }
    }
    
    // write timeout
    if (Number.isNaN(parseInt(confData.timeout, 10)) || !isFinite(confData.timeout)) {
        uiNeedsUpdate = true;
        setTimeout(function () {
            self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.TIMEOUT') + self.commandRouter.getI18nString('PEPPY_SCREENSAVER.NAN'));
        }, 500);
    } else {
        confData.timeout = self.minmax('TIMEOUT', confData.timeout, minmax[0]);
        if (confData.timeout != self.config.get('timeout')){        
            self.config.set('timeout', confData.timeout);
            noChanges = false;
        }
    }
    
    // write active folder
    if (config.current['meter.size'] !== confData.activeFolder.value) {
        config.current['meter.size'] = confData.activeFolder.value;
        self.config.set('activeFolder', confData.activeFolder.value);
        self.config.set('activeFolder_title', confData.activeFolder.label);
        // reset active meter and save also
        config.current.meter = 'random';
        self.config.set('randomSelection', '');
        noChanges = false;
        uiNeedsUpdate = true;
    }

    // write screen width/height
    var dimensions = {'width':'', 'height':''};
    var files = fs.readdirSync(PeppyPath + confData.activeFolder.value);
    files.forEach(file => {
        if (file.indexOf('-ext.') >= 0) {
            dimensions = sizeOf(PeppyPath + confData.activeFolder.value + '/' + file);
            files.length = 0;
        }
    });    
    config.current['screen.width'] = dimensions.width;
    config.current['screen.height'] = dimensions.height;
    
    
    // write needle cache
    var needleCache = confData.needleCache? 'True' : 'False';
    if (config.current['use.cache'] != needleCache) {
        config.current['use.cache'] = needleCache;
        noChanges = false;
    }


    
    // write random interval
    if (Number.isNaN(parseInt(confData.randomInterval, 10)) || !isFinite(confData.randomInterval)) {
        uiNeedsUpdate = true;
        setTimeout(function () {
            self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.RANDOMINTERVAL') + self.commandRouter.getI18nString('PEPPY_SCREENSAVER.NAN'));
        }, 500);
    } else {
        confData.randomInterval = self.minmax('RANDOMINTERVAL', confData.randomInterval, minmax[1]);
        if (config.current['random.meter.interval'] != confData.randomInterval) {
            config.current['random.meter.interval'] = confData.randomInterval;
            noChanges = false;
        }
    }
    
    // smooth buffer
    if (Number.isNaN(parseInt(confData.smoothBuffer, 10)) || !isFinite(confData.smoothBuffer)) {
        uiNeedsUpdate = true;
        setTimeout(function () {
            self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.SMOOTH_BUFFER') + self.commandRouter.getI18nString('PEPPY_SCREENSAVER.NAN'));
        }, 500);
    } else {
        confData.smoothBuffer = self.minmax('SMOOTH_BUFFER', confData.smoothBuffer, minmax[2]);
        if (config.data.source['smooth.buffer.size'] != confData.smoothBuffer) {
            config.data.source['smooth.buffer.size'] = confData.smoothBuffer;
            noChanges = false;
        }
    }

    // write mouse support
    var mouseSupport = confData.mouseEnabled? 'True' : 'False';
    if (config.sdl.env['mouse.enabled'] != mouseSupport) {
        config.sdl.env['mouse.enabled'] = mouseSupport;
        noChanges = false;
    }
    
    if (!noChanges) {
        fs.writeFileSync(PeppyPath + 'config.txt', ini.stringify(config, {whitespace: true}));
    }
  } else {
      self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.NO_PEPPYCONFIG'));
  }
  
  if (uiNeedsUpdate) {self.updateUIConfig();}
  setTimeout(function () {
    if (noChanges) {
        self.commandRouter.pushToastMessage('info', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.NO_CHANGES'));
    } else {
        self.commandRouter.pushToastMessage('success', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('COMMON.SETTINGS_SAVED_SUCCESSFULLY'));
    }
  }, 500);
};

// called when 'save' button pressed VU-Meter settings
peppyScreensaver.prototype.saveVUMeterConf = function (confData) {
  const self = this;
  let noChanges = true;
  uiNeedsUpdate = false;
  
  if (fs.existsSync(PeppyPath + 'config.txt')){
    var config = ini.parse(fs.readFileSync(PeppyPath + 'config.txt', 'utf-8'));
    
    // write selected meter
    if ((confData.meter.value !== 'list' && config.current.meter !== confData.meter.value) || (confData.meter.value == 'list' && config.current.meter !== confData.randomSelection)) {
        if (confData.meter.value === 'list') {
            if (confData.randomSelection !== ''){
                config.current.meter = (confData.randomSelection).toLowerCase();
                self.config.set('randomSelection', (confData.randomSelection).toLowerCase());
            } else {
                config.current.meter = availMeters;
                self.config.set('randomSelection', availMeters);
                uiNeedsUpdate = true;
            }
        } else {
            config.current.meter = confData.meter.value;
        }
        noChanges = false;
    }
        
    if (!noChanges) {
        fs.writeFileSync(PeppyPath + 'config.txt', ini.stringify(config, {whitespace: true}));
    }
  } else {
      self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.NO_PEPPYCONFIG'));
  }
  
  if (uiNeedsUpdate) {self.updateUIConfig();}
  setTimeout(function () {
    if (noChanges) {
        self.commandRouter.pushToastMessage('info', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.NO_CHANGES'));
    } else {
        self.commandRouter.pushToastMessage('success', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('COMMON.SETTINGS_SAVED_SUCCESSFULLY'));
    }
  }, 500);
};

//-------------------------------------------------------------

peppyScreensaver.prototype.minmax = function (item, value, attrib) {
  var self = this;
  if (Number.isNaN(parseInt(value, 10)) || !isFinite(value)) {
      uiNeedsUpdate = true;
      return attrib[2];
  }
    if (value < attrib[0]) {
      self.commandRouter.pushToastMessage("info", self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.' + item.toUpperCase()) + ': ' + self.commandRouter.getI18nString('PEPPY_SCREENSAVER.INFO_MIN'));
      uiNeedsUpdate = true;
      return attrib[0];
    }
    if (value > attrib[1]) {
      self.commandRouter.pushToastMessage("info", self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.' + item.toUpperCase()) + ': ' + self.commandRouter.getI18nString('PEPPY_SCREENSAVER.INFO_MAX'));
      uiNeedsUpdate = true;
      return attrib[1];
    }
    return parseInt(value, 10);
};

peppyScreensaver.prototype.updateUIConfig = function () {
  const self = this;
  const defer = libQ.defer();

  self.commandRouter.getUIConfigOnPlugin('miscellanea', 'peppy_screensaver', {})
    .then(function (uiconf) {
      self.commandRouter.broadcastMessage('pushUiConfig', uiconf);
    });
  self.commandRouter.broadcastMessage('pushUiConfig');
  uiNeedsUpdate = false;
  return defer.promise;
};

peppyScreensaver.prototype.install_dummy = function () {
  const self = this;
  let defer = libQ.defer();
  
  try {
    execSync("/usr/bin/sudo /sbin/modprobe snd-dummy index=7 pcm_substreams=1", { uid: 1000, gid: 1000 });
    self.commandRouter.pushConsoleMessage('snd-dummy loaded');
    defer.resolve();
  } catch (err) {
    self.logger.info('failed to load snd-dummy' + err);
  }
};

peppyScreensaver.prototype.install_mkfifo = function () {
  const self = this;
  let defer = libQ.defer();
  
  try {
    exec('/usr/bin/mkfifo -m 646 /tmp/myfifo', { uid: 1000, gid: 1000 });
    self.commandRouter.pushConsoleMessage('/tmp/myfifo created');
    defer.resolve();
  } catch (err) {
    self.logger.info('failed to create /tmp/myfifo' + err);
  }    
};

// buster switch alsa config
peppyScreensaver.prototype.switch_alsaConfig = function (alsaConf) {
    const self = this;
    var defer = libQ.defer();
    var enableDSD = alsaConf == 1 ? true : false;
    
    self.MPD_setOutput(MPD, enableDSD)
        .then(self.MPD_allowedFormats.bind(self, MPD, enableDSD))
        .then(self.writeAsoundConfigModular.bind(self, alsaConf))
        .then(self.updateALSAConfigFile.bind(self))
        .then(self.recreate_mpdconf.bind(self))
        .then(self.restartMpd.bind(self));
    defer.resolve
    return defer.promise;    
};

// buster callback if mixer or outputdevice changed
// update of asound template
peppyScreensaver.prototype.switch_alsaModular = function () {
    const self = this;

    setTimeout(function () {
        var outputdevice = self.getAlsaConfigParam('outputdevice');
        var softmixer = self.getAlsaConfigParam('softvolume');
        // only if outputdevice or mixer changed
        if (last_outputdevice !== outputdevice || last_softmixer !== softmixer) {
            var alsaConf = parseInt(self.config.get('alsaSelection'),10);
            if (alsaConf == 0) { // and only for modular alsa      
                self.writeAsoundConfigModular(alsaConf).then(self.updateALSAConfigFile.bind(self));
            }                
        }
        last_outputdevice = outputdevice;
        last_softmixer = softmixer;
    }, 500 );
};
                        
// check, if MPD output enabled
peppyScreensaver.prototype.get_output_enabled = function (data) {
    const self = this;
    var defer = libQ.defer();
    var found = false;
    var count = 0;
    
    lineReader.eachLine(data, function(line) {
  
        if (line.includes('---> output peppymeter')) {
            found = true;
        }
        if (found) {count += 1;}
        if (count === 3) {
            if (line.includes('no')) {
                defer.resolve (false);
                return false
            } else {
                defer.resolve (true);
                return false
            }
        }           
    })
    return defer.promise;
};

// enable the MPD output for peppymeter
peppyScreensaver.prototype.MPD_setOutput = function (data, enableDSD) {
  const self = this;
  let defer = libQ.defer();
  var sedStr = enableDSD ? "sed -i '/---> output peppymeter/,+2{/---> output peppymeter/,+1{b};s/no/yes/}' " : "sed -i '/---> output peppymeter/,+2{/---> output peppymeter/,+1{b};s/yes/no/}' ";

  exec(sedStr +  data, { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {
    if (error) {
        self.logger.warn(id + 'An error occurred when change MPD output', error);
    } else {
        setTimeout(function () {defer.resolve();}, 100);
    }
  });

  return defer.promise;
};


// buster enable the MPD allowed_formats
peppyScreensaver.prototype.MPD_allowedFormats = function (data, enableDSD) {
  const self = this;
  let defer = libQ.defer();
  
  // remove old entry
  exec("sed -i '/allowed_formats/d' " + data, { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {
    if (error) {
        self.logger.warn(id + 'An error occurred when change allowed formats MPD', error);
    } else {
        // add new entry for alsa pipeline
        setTimeout(function () {
            if (!enableDSD) {
                exec("sed -i '/${special_settings}/a allowed_formats\t\x22192000:*:* 96000:*:* 88200:*:* 48000:*:* 44100:*:* 32000:*:* 16000:*:*\x22' " + data, { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {
                    if (error) {
                        self.logger.warn(id + 'An error occurred when change allowed formats MPD', error);
                    } else {
                        setTimeout(function () {defer.resolve();}, 100);
                    }       
                });
            } else {
                defer.resolve();
            }
        }, 100);
    }
  });

  return defer.promise;
};

// inject additional output for peppymeter to mpd.conf.tmpl
peppyScreensaver.prototype.add_mpdoutput = function (data, data_tmp) {
  const self = this;
  let defer = libQ.defer();
  
  var insertStr = '"\
#---> output peppymeter\\n\
audio_output {\\n\
        enabled     \\x22yes\\x22\\n\
        type        \\x22alsa\\x22\\n\
        name        \\x22mpd_peppyalsa\\x22\\n\
        device      \\x22mpd_peppyalsa\\x22\\n\
        dop         \\x22yes\\x22\\n\
        mixer_type  \\x22none\\x22\\n\
        format      \\x2244100:16:2\\x22\\n\
}\\n\
#<--- end peppymeter"';
  
  exec("awk 'NR==FNR{if ($0 ~ /multiroom/){c=NR};next} {if (FNR==(c-4)) {print " + insertStr + " }};1' " +  data + " " + data + " > " + data_tmp + " && mv " + data_tmp + " " + data, { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {
    if (error) {
        self.logger.warn(id + 'An error occurred when creating inject', error);
    } else {
        setTimeout(function () {defer.resolve();}, 100);
    }
  });
  return defer.promise;
};

// remove injected additional output for peppymeter from mpd.conf.tmpl
peppyScreensaver.prototype.del_mpdoutput = function (data) {
  const self = this;
  let defer = libQ.defer();

  exec("sed -n -i '/---> output peppymeter/,/<--- end peppymeter/!p' " + data, { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {
    if (error) {
        self.logger.warn(id + 'An error occurred when remove inject', error);
    } else {
        setTimeout(function () {defer.resolve();}, 100);
    }
  });
  return defer.promise;
};

// jessie redirect standard output to mpd_alsa
peppyScreensaver.prototype.redirect_mpdoutput = function (data) {
  const self = this;
  let defer = libQ.defer();
  
  var mpddata = fs.readFileSync(data, 'utf8');
  mpddata = mpddata.replace('${device}', 'mpd_alsa');
  fs.writeFile(data, mpddata, 'utf8', function (error) {
    if (error) {
        self.logger.error(id + 'Cannot write ' + data + ': ' + error);
    } else {
        self.logger.info(id + 'mpd.conf.tmpl file written');
        defer.resolve();
    }
  });
  return defer.promise;
};

// jessie modify airplay output
peppyScreensaver.prototype.redirect_airoutput = function (data) {
  const self = this;
  let defer = libQ.defer();
  
  var airdata = fs.readFileSync(data, 'utf8');
  airdata = airdata.replace('${device}', 'peppyalsa');
  fs.writeFile(data, airdata, 'utf8', function (error) {
    if (error) {
        self.logger.error(id + 'Cannot write ' + data + ': ' + error);
    } else {
        self.logger.info(id + 'shairport-sync.conf.tmpl file written');
        defer.resolve();
    }
  });
  return defer.promise;
};


// recreate active /etc/mpd.conf
peppyScreensaver.prototype.recreate_mpdconf = function () {
  const self = this;
  let defer = libQ.defer();
  
  self.commandRouter.executeOnPlugin('music_service', 'mpd', 'createMPDFile', function(error) {
    if (error) {
        self.logger.error(id + 'Cannot create /etc/mpd.conf ' + error);
    } else {
        defer.resolve();
    }
  });
  return defer.promise;
};  

peppyScreensaver.prototype.restartMpd = function () {
  var self = this;
  var defer = libQ.defer();

  setTimeout(function () {
    self.commandRouter.executeOnPlugin('music_service', 'mpd', 'restartMpd', '');
    defer.resolve();
  }, 500);

  return defer.promise;
};

// create asound depend on mixer type
peppyScreensaver.prototype.createAsoundConfig = function () {
  var self = this;  
  var defer = libQ.defer();
  
  // wait a little bit until mixer_type is set
  setTimeout(function () {
    var mixer_type = self.getAlsaConfigParam('mixer_type');        
    var outputdevice = self.getAlsaConfigParam('outputdevice');

    //self.logger.info('______________________ ' + mixer_type);
    if (mixer_type === 'Software') {
        if (outputdevice == 'softvolume') {
            outputdevice = self.getAlsaConfigParam ('softvolumenumber');
        }
        fs.readFile('/etc/asound.conf', 'utf8', function (err, data) {
            if (err) {
                self.logger.error('Error reading /etc/asound.conf: ' + err);
            }
            self.writeAsoundConfig(outputdevice, true);
            defer.resolve();
        });

    } else {
        fs.readFile('/etc/asound.conf', 'utf8', function (err, data) {
            if (err) {
                self.logger.error('Error reading /etc/asound.conf: ' + err);
            }
            self.writeAsoundConfig(outputdevice, false);
            defer.resolve();
        });
    }
    //self.commandRouter.executeOnPlugin('music_service', 'mpd', 'restartMpd', '');
  }, 500);
  
  return defer.promise;
};

// write asound.conf from template and remove variables
peppyScreensaver.prototype.writeAsoundConfig = function (data, enableSoft) {
  var self = this;
  var asoundTempl = __dirname + '/asound.conf.tmpl';
  var conf, card, device;
  var defer = libQ.defer();
  
  if (fs.existsSync(asoundTempl)) {
    var asounddata = fs.readFileSync(asoundTempl, 'utf8');
    if ((data).indexOf(',') >= 0) {
        var dataarr = (data).split(',');
        card = dataarr[0];
        device = dataarr[1];
    } else {
        card = data;
        device = '0';
    }

    conf = asounddata.replace(/\${card}/g, card);
    conf = conf.replace(/\${device}/g, device);

    if (enableSoft) {
        conf = conf.replace('${snd_output_hard}', 'mpd_alsa_deakt');
        conf = conf.replace('${snd_output_soft}', 'mpd_alsa');
    } else {
        conf = conf.replace('${snd_output_hard}', 'mpd_alsa');
        conf = conf.replace('${snd_output_soft}', 'mpd_alsa_deakt');
    }

    fs.writeFile('/home/volumio/asoundrc_tmp', conf, 'utf8', function (err) {
        if (err) {
            self.logger.info('Cannot write /etc/asound.conf: ' + err);
        } else {
            try {
                self.logger.info('Asound.conf file written');
                var mv = execSync('/usr/bin/sudo /bin/mv /home/volumio/asoundrc_tmp /etc/asound.conf', { uid: 1000, gid: 1000, encoding: 'utf8' });
                var apply = execSync('/usr/sbin/alsactl -L -R nrestore', { uid: 1000, gid: 1000, encoding: 'utf8' });
            } catch (e) {
            }    
            defer.resolve();
        }
    });
  }

return defer.promise;  
};

// buster write asound.conf from template and remove variables
peppyScreensaver.prototype.writeAsoundConfigModular = function (alsaConf) {
  var self = this;
  var asoundTempl = __dirname + '/Peppyalsa.postPeppyalsa.5.conf.tmpl';
  var conf;
  var defer = libQ.defer();
          
  if (fs.existsSync(asoundTempl)) {
    var asounddata = fs.readFileSync(asoundTempl, 'utf8');

    if (alsaConf == 1) { // DSD native
        conf = asounddata.replace('${alsaDirect}', 'Peppyalsa');
        conf = conf.replace('${alsaMeter}', 'peppyalsa');
    } else {  // modular alsa      
        conf = asounddata.replace('${alsaDirect}', 'peppyalsa');
        conf = conf.replace('${alsaMeter}', 'Peppyalsa');
    }
    
    // change alsa config depend on outputdevice and mixer
    // no reformat possible for softmixer
    // for internal cards (hdmi, headphone) 44100 kHz
    // for external sound cards 16000 kHz (the only rate without error)
    var outputdevice = self.getAlsaConfigParam('outputdevice');
    var softmixer = self.getAlsaConfigParam('softvolume');
        
    if (outputdevice == 'softvolume') {
        outputdevice = self.getAlsaConfigParam ('softvolumenumber');
    }
    var slave_b = softmixer ? 'mpd_peppyalsa' : 'reformat'; 
    conf = conf.replace('${slave_b}', slave_b);            
    var rate = parseInt(outputdevice,10) > 1 ? 16000 : 44100;
    conf = conf.replace('${rate}', rate);    
        
    fs.writeFile(__dirname + '/asound/Peppyalsa.postPeppyalsa.5.conf', conf, 'utf8', function (err) {
        if (err) {
            self.logger.info('Cannot write Peppyalsa.postPeppyalsa.5.conf: ' + err);
        } else {
            //self.logger.info('Peppyalsa.postPeppyalsa.5.conf file written');  
            defer.resolve();
        }
    });
  }

return defer.promise;  
};

// called from unistall script (only needed for Jessie)
// restore asound.conf
peppyScreensaver.prototype.restoreAsoundConfig = function () {
  var self = this;  
  var defer = libQ.defer();

  var msg_title, msg_msg, msg_name;
  
  // wait a little bit until mixer_type is set
  setTimeout(function () {
    var mixer_type = self.getAlsaConfigParam('mixer_type');        
    var outputdevice = self.getAlsaConfigParam('outputdevice');

    //self.logger.info('______________________ ' + mixer_type);
    if (mixer_type === 'Software') {
        if (outputdevice == 'softvolume') {
            outputdevice = self.getAlsaConfigParam ('softvolumenumber');
        }
        fs.readFile('/etc/asound.conf', 'utf8', function (err, data) {
            if (err) {
                self.logger.error('Error reading /etc/asound.conf: ' + err);
            }
            self.writeSoftMixerFile(outputdevice);
            defer.resolve();
        });

    } else {
        fs.readFile('/etc/asound.conf', 'utf8', function (err, data) {
            if (err) {
                self.logger.error('Error reading /etc/asound.conf: ' + err);
            }
            self.disableSoftMixer(outputdevice);
            defer.resolve();
        });
    }

    // create a hint as modal to reboot
    var responseData = {
      title: self.commandRouter.getI18nString('PEPPY_SCREENSAVER.UNINSTALL_TITLE'),
      message: self.commandRouter.getI18nString('PEPPY_SCREENSAVER.UNINSTALL_MSG'),
      size: 'lg',
      buttons: [
        {
          name: self.commandRouter.getI18nString('COMMON.GOT_IT'),
          class: 'btn btn-info ng-scope',
          emit: '',
          payload: ''
        }
      ]
    };
    self.commandRouter.broadcastMessage('openModal', responseData);


    //self.commandRouter.executeOnPlugin('music_service', 'mpd', 'restartMpd', '');
  }, 500);
  
  return defer.promise;
};

peppyScreensaver.prototype.getAlsaConfigParam = function (data) {
	var self = this;
	return self.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'getConfigParam', data);
};

peppyScreensaver.prototype.disableSoftMixer = function (data) {
	var self = this;
	return self.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'disableSoftMixer', data);
};

peppyScreensaver.prototype.writeSoftMixerFile = function (data) {
	var self = this;
	return self.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'writeSoftMixerFile', data);
};

peppyScreensaver.prototype.IfBuster = function () {
	var self = this; 
    return self.commandRouter.executeOnPlugin('system_controller', 'system', 'getConfigParam', 'system_version') < 3.0 ? false : true;
};

peppyScreensaver.prototype.updateALSAConfigFile = function () {
	var self = this;
    var defer = libQ.defer();
    self.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'updateALSAConfigFile');
    defer.resolve();
    return defer.promise;
};
    
//--------------------------------------------------------------

// called from commandrouter to find the language file
peppyScreensaver.prototype.getI18nFile = function (langCode) {
  const i18nFiles = fs.readdirSync(path.join(__dirname, 'i18n'));
  const langFile = 'strings_' + langCode + '.json';

  // check for i18n file fitting the system language
  if (i18nFiles.some(function (i18nFile) { return i18nFile === langFile; })) {
    return path.join(__dirname, 'i18n', langFile);
  }
  // return default i18n file
  return path.join(__dirname, 'i18n', 'strings_en.json');
};

peppyScreensaver.prototype.getConfigParam = function (key) {
  var self = this;
  return config.get(key);
};

peppyScreensaver.prototype.setConfigParam = function (data) {
  this.config.set(data.key, data.value);
};


//-------------------------------------------------------------

peppyScreensaver.prototype.setUIConfig = function(data) {
	var self = this;
	//Perform your installation tasks here
};

peppyScreensaver.prototype.getConf = function(varName) {
	var self = this;
	//Perform your installation tasks here
};

peppyScreensaver.prototype.setConf = function(varName, varValue) {
	var self = this;
	//Perform your installation tasks here
};
