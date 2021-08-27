'use strict';

var libQ = require('kew');
var fs=require('fs-extra');
var config = new (require('v-conf'))();
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;

const io = require('socket.io-client');
const socket = io.connect('http://localhost:3000');
const path = require('path');
const ini = require('ini');
const PeppyPath = '/data/plugins/miscellanea/peppy_screensaver/peppymeter/';
const id = 'peppy_screensaver: ';

var uiNeedsUpdate = false;
var minmax = new Array(5);

var MPD = '/volumio/app/plugins/music_service/mpd/mpd.conf.tmpl'
var MPDT = '/volumio/app/plugins/music_service/mpd/mpd.conf_tmp.tmpl'

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
    // create asound.conf if needed
    if (self.IfBuster()) {
        //self.logger.info('_________________ detect Buster _________________');
        
        // load snd dummy for peppymeter output 
        self.install_dummy();
        self.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'updateALSAConfigFile');


        fs.readFile(MPD, 'utf8', function (err, data) {
            if (err) {
                self.logger.error(id + MPD + 'not found');
            } else {
                if ((data).indexOf('mpd_peppyalsa') < 0) {
                    // inject additional output to peppymeter
                    self.add_mpdoutput (MPD, MPDT)
                        .then (self.recreate_mpdconf.bind(self))
                        .then(self.restartMpd.bind(self));
                        
                } else {
                    self.logger.info (id + 'mpd template file already modified');
                }            
            }
        });
    


    } else {
        //self.logger.info('_________________ detect Jessie _________________');
        // event callback if outputdevice or mixer changed
        this.commandRouter.sharedVars.registerCallback('alsa.outputdevice', this.createAsoundConfig.bind(this));
        
        self.createAsoundConfig()
            .then(self.restartMpd.bind(self));
        
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


    if (self.IfBuster()) {
        //self.logger.info('_________________ detect Buster _________________');

        self.commandRouter.stateMachine.stop().then(function () {
          fs.readFile(MPD, 'utf8', function (err, data) {
            if (err) {
                self.logger.error(id + MPD + 'not found');
            } else {
                if ((data).indexOf('mpd_peppyalsa') >= 0) {
                    // remove additional output to peppymeter
                    self.del_mpdoutput (MPD)
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
        
    } else {
        //self.logger.info('_________________ detect Jessie _________________');
        
        self.commandRouter.stateMachine.stop().then(function () {
          // stop events
          socket.off('pushState');
          defer.resolve();
        });    
    }
    
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
        uiconf.sections[0].hidden = false;
        
        if (fs.existsSync(config_file)){
            // read values from ini
            var config = ini.parse(fs.readFileSync(config_file, 'utf-8')),
                meters_file = PeppyPath + config.current['meter.size'] + '/meters.txt',
                upperc = /\b([^-])/g;

            // screensaver timeout
            uiconf.sections[0].content[0].value = self.config.get('timeout');
            minmax[0] = [uiconf.sections[0].content[0].attributes[2].min,
              uiconf.sections[0].content[0].attributes[3].max,
              uiconf.sections[0].content[0].attributes[0].placeholder];
                                        
            // active folder
            // fill selection list with custom folders
            var files = fs.readdirSync(PeppyPath);
            files.forEach(file => {
                var stat = fs.statSync(PeppyPath + file);
                if (stat.isDirectory() && file.startsWith ('custom')) {
                    self.configManager.pushUIConfigParam(uiconf, 'sections[0].content[1].options', {
                        value: file,
                        label: file.replace(upperc, c => c.toUpperCase())
                    });
                }
            });
            if (self.config.get('activeFolder') == '') {
                uiconf.sections[0].content[1].value.value = config.current['meter.size'];
                uiconf.sections[0].content[1].value.label = (uiconf.sections[0].content[1].value.value).replace(upperc, c => c.toUpperCase());
            } else {
                uiconf.sections[0].content[1].value.value = self.config.get('activeFolder');
                uiconf.sections[0].content[1].value.label = self.config.get('activeFolder_title');
            }

            // screen width/height
            uiconf.sections[0].content[2].value = self.config.get('screenWidth');
            uiconf.sections[0].content[3].value = self.config.get('screenHeight');
            for (var i = 1; i < 3 ; i++) {
                minmax[i] = [uiconf.sections[0].content[i+1].attributes[2].min,
                  uiconf.sections[0].content[i+1].attributes[3].max,
                  uiconf.sections[0].content[i+1].attributes[0].placeholder];
            }

            // needle cache
            var needleCache = (config.current['use.cache']).toLowerCase() == 'true' ? true : false;
            uiconf.sections[0].content[4].value = needleCache;

            if (fs.existsSync(meters_file)){
                var metersconfig = ini.parse(fs.readFileSync(meters_file, 'utf-8')),
                availMeters = '';

                // current meter
                if ((config.current.meter).includes(',')) {
                    uiconf.sections[0].content[5].value.value = 'list';
                } else {
                    uiconf.sections[0].content[5].value.value = config.current.meter;
                }
                uiconf.sections[0].content[5].value.label = (uiconf.sections[0].content[5].value.value).replace(upperc, c => c.toUpperCase());

                // read all sections from active meters.txt and fill selection list
                for (var section in metersconfig) {
                    availMeters += section + ',';
                    self.configManager.pushUIConfigParam(uiconf, 'sections[0].content[5].options', {
                        value: section,
                        label: section.replace(upperc, c => c.toUpperCase())
                    });
                }

                // list selection
                availMeters = availMeters.substring(0, availMeters.length -1);
                uiconf.sections[0].content[6].value = self.config.get('randomSelection');
                uiconf.sections[0].content[6].doc = self.commandRouter.getI18nString('PEPPY_SCREENSAVER.RANDOMSELECTION_DOC') + '<b>' + availMeters + '</b>';

                // random interval / smooth buffer
                uiconf.sections[0].content[7].value = parseInt(config.current['random.meter.interval'], 10);
                uiconf.sections[0].content[8].value = parseInt(config.data.source['smooth.buffer.size'], 10);                                
                for (var i = 3; i < 5 ; i++) {
                  minmax[i] = [uiconf.sections[0].content[i+4].attributes[2].min,
                    uiconf.sections[0].content[i+4].attributes[3].max,
                    uiconf.sections[0].content[i+4].attributes[0].placeholder];
                }
            }
            
            // mouse support
            var mouseSupport = (config.sdl.env['mouse.enabled']).toLowerCase() == 'true' ? true : false;
            uiconf.sections[0].content[9].value = needleCache;
            
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

// called when 'save' button pressed
peppyScreensaver.prototype.savePeppyMeterConf = function (confData) {
  const self = this;
  let noChanges = true;

  if (fs.existsSync(PeppyPath + 'config.txt')){
    var config = ini.parse(fs.readFileSync(PeppyPath + 'config.txt', 'utf-8'));

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
    
    // write screen width/height
    if (self.config.get('screenWidth') !== confData.screenWidth || self.config.get('screenHeight') !== confData.screenHeight || config.current['meter.size'] !== confData.activeFolder.value){
        if (Number.isNaN(parseInt(confData.screenWidth, 10)) || !isFinite(confData.screenWidth)) {
            uiNeedsUpdate = true;
            setTimeout(function () {
                self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.SCREEN_WIDTH') + self.commandRouter.getI18nString('PEPPY_SCREENSAVER.NAN'));
            }, 500);
        } else {
            confData.screenWidth = self.minmax('SCREEN_WIDTH', confData.screenWidth, minmax[1]);
            self.config.set('screenWidth', confData.screenWidth);
            config.current['screen.width'] = (confData.activeFolder.value).startsWith('custom')? confData.screenWidth : '';
            noChanges = false;
        }
        if (Number.isNaN(parseInt(confData.screenHeight, 10)) || !isFinite(confData.screenHeight)) {
            uiNeedsUpdate = true;
            setTimeout(function () {
                self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.SCREEN_HEIGHT') + self.commandRouter.getI18nString('PEPPY_SCREENSAVER.NAN'));
            }, 500);
        } else {
            confData.screenHeight = self.minmax('SCREEN_HEIGHT', confData.screenHeight, minmax[2]);
            self.config.set('screenHeight', confData.screenHeight);
            config.current['screen.height'] = (confData.activeFolder.value).startsWith('custom')? confData.screenHeight : '';
            noChanges = false;
        }
    }

    // write active folder
    if (config.current['meter.size'] !== confData.activeFolder.value) {
        config.current['meter.size'] = confData.activeFolder.value;
        self.config.set('activeFolder', confData.activeFolder.value);
        self.config.set('activeFolder_title', confData.activeFolder.label);
        // reset active meter
        config.current.meter = 'random';
        self.config.set('randomSelection', '');
        noChanges = false;
        uiNeedsUpdate = true;
    }
    
    // write needle cache
    var needleCache = confData.needleCache? 'True' : 'False';
    if (config.current['use.cache'] != needleCache) {
        config.current['use.cache'] = needleCache;
        noChanges = false;
    }

    // write selected meter
    if ((confData.meter.value !== 'list' && config.current.meter !== confData.meter.value) || (confData.meter.value == 'list' && config.current.meter !== confData.randomSelection)) {
        if (confData.meter.value === 'list') {
            if (confData.randomSelection !== ''){
                config.current.meter = (confData.randomSelection).toLowerCase();
                self.config.set('randomSelection', (confData.randomSelection).toLowerCase());
            } else {
                setTimeout(function () {
                    self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.LIST_EMPTY'));
                }, 500);
                uiNeedsUpdate = true;
                config.current.meter = 'random';
            }
        } else {
            config.current.meter = confData.meter.value;
        }
        noChanges = false;
    }
    
    // write random interval
    if (Number.isNaN(parseInt(confData.randomInterval, 10)) || !isFinite(confData.randomInterval)) {
        uiNeedsUpdate = true;
        setTimeout(function () {
            self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('PEPPY_SCREENSAVER.PLUGIN_NAME'), self.commandRouter.getI18nString('PEPPY_SCREENSAVER.RANDOMINTERVAL') + self.commandRouter.getI18nString('PEPPY_SCREENSAVER.NAN'));
        }, 500);
    } else {
        confData.randomInterval = self.minmax('RANDOMINTERVAL', confData.randomInterval, minmax[3]);
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
        confData.smoothBuffer = self.minmax('SMOOTH_BUFFER', confData.smoothBuffer, minmax[4]);
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

// inject additional output for peppymeter to mpd.conf.tmpl
peppyScreensaver.prototype.add_mpdoutput = function (data, data_tmp) {
  const self = this;
  let defer = libQ.defer();
  var insertStr = '"\
#---> output peppymeter\\n\
audio_output {\\n\
        type        \\x22alsa\\x22\\n\
        name        \\x22mpd_peppyalsa\\x22\\n\
        device      \\x22mpd_peppyalsa\\x22\\n\
        dop         \\x22yes\\x22\\n\
}\\n\
#<--- end peppymeter"';
  
  exec("awk 'NR==FNR{if ($0 ~ /multiroom/){c=NR};next} {if (FNR==(c-4)) {print " + insertStr + " }};1' " +  data + " " + data + " > " + data_tmp + " && mv " + data_tmp + " " + data, { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {
    if (error) {
        self.logger.warn(id + 'An error occurred when creating inject', error);
    } else {
        defer.resolve();
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
        defer.resolve();
    }
  });
  return defer.promise;
};

// redirect standard output to mpd_alsa
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
