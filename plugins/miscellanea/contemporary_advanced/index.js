'use strict';

var libQ = require('kew');
var fs=require('fs-extra');
var config = new (require('v-conf'))();
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
const path = require('path');
const backgroundPath = '/data/backgrounds';
const id = 'contemporary_advanced: ';

const indexfile = '/volumio/http/www3/index.html';
const StylesPath = '/volumio/http/www3/styles';
const MPDindex = '/volumio/app/plugins/music_service/mpd/index.js';
const MPD = '/data/configuration/miscellanea/contemporary_advanced/MPDindex.js';
const fstab = '/etc/fstab';

var scalemem = 0;
var globl = new Array(7);
var aart = new Array(3);
var tinfo = new Array(8);
var tinfo2 = new Array(18);
var uiNeedsUpdate;
var cssfile, cssfile_1, cssfile_2;
var styleID = '';

module.exports = contemporaryAdvanced;
function contemporaryAdvanced(context) {
	var self = this;

	self.context = context;
	self.commandRouter = self.context.coreCommand;
	self.logger = self.context.logger;
	self.configManager = self.context.configManager;

};

contemporaryAdvanced.prototype.onVolumioStart = function()
{
	var self = this;
	//var configFile=self.commandRouter.pluginManager.getConfigurationFile(self.context,'config.json');
	//self.config = new (require('v-conf'))();
	//self.config.loadFile(configFile);

    return libQ.resolve();
};

contemporaryAdvanced.prototype.onStart = function() {
    var self = this;
    var configFile=self.commandRouter.pluginManager.getConfigurationFile(self.context,'config.json');
    self.config = new (require('v-conf'))();
    self.config.loadFile(configFile);
	var defer=libQ.defer();
    
    // load language strings here again, otherwise needs restart after installation
    self.commandRouter.loadI18nStrings();

    // build css file names 
    styleID = self.getStyleID (StylesPath);
    cssfile = StylesPath + '/app-' + styleID + '.css';
    cssfile_1 = __dirname + '/' + styleID + '/app-' + styleID + '_1.css';
    cssfile_2 = __dirname + '/' + styleID + '/app-' + styleID + '_2.css';

    
    // check on changed styleID    
    if (fs.existsSync(__dirname + '/' + styleID)){
    
        try {
                    
            if (self.config.get('firstrun')) {
            
                //if (self.config.get('showalbumart') || self.config.get('sortalbumartist')) {
                if (self.config.get('sortalbumartist')) {
                    // copy orignal file
                    fs.copySync(MPDindex, MPD);
                    //self.setAlbumart(MPD); not more compatible
                    self.setAlbumartist(MPD);
                    
                    // add MPD mountpoint to fstab
                    self.AddMPDMountpoint();
                    setTimeout(function () {self.rebootMessage();}, 5000);
                }
            }           

            //mount styles css file, if not mounted
            var cssfile_mod = self.config.get('ContempMod') == '1' ? cssfile_1 : cssfile_2;
            execSync('/bin/df ' + cssfile + ' | /bin/grep ' + cssfile + ' && /bin/echo || /bin/echo volumio | /usr/bin/sudo -S /bin/mount --bind ' + cssfile_mod + ' ' + cssfile);

        } catch (err) {
            self.logger.error(id + 'Cannot copy and mount files to set genre values');
        }
        
        if (self.config.get('firstrun')) {
            self.config.set('firstrun', false);
            self.commandRouter.reloadUi();
        }
                    
        // Once the Plugin has successfull started resolve the promise
        defer.resolve();    
    } else {                                 
        setTimeout(function () {            
            self.commandRouter.pluginManager.disableAndStopPlugin ('miscellanea','contemporary_advanced');
            self.commandRouter.reloadUi();    
        }, 500);
        setTimeout(function () {
            self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.NO_SUPPORT'));
        }, 2000);
        defer.reject(new Error()); 
    }
    
    return defer.promise;
};

contemporaryAdvanced.prototype.onStop = function() {
    var self = this;
    var defer=libQ.defer();

    // disable mod

    try {
        //unmount css file, if mounted
        execSync('/bin/df ' + cssfile + ' | /bin/grep ' + cssfile + ' && /bin/echo volumio | /usr/bin/sudo -S /bin/umount ' + cssfile);
        
        //unmount mpd file, if mounted        
        if (fs.existsSync(MPD)) {
            fs.removeSync(MPD);
            self.RemoveMPDMountpoint();
            setTimeout(function () {self.rebootMessage();}, 5000);            
        }
        self.config.set('firstrun', true);        
    } catch (err) {
        self.logger.error(id + 'Can not unmount mounted files' + err);
    }
    
    self.commandRouter.reloadUi();
    
    // Once the Plugin has successfull stopped resolve the promise
    defer.resolve();

    return libQ.resolve();
};

contemporaryAdvanced.prototype.onRestart = function() {
    var self = this;
    // Optional, use if you need it
};


// Configuration Methods -----------------------------------------------------------------------------

contemporaryAdvanced.prototype.getUIConfig = function() {
    var defer = libQ.defer();
    var self = this;

    var lang_code = this.commandRouter.sharedVars.get('language_code');

    self.commandRouter.i18nJson(__dirname+'/i18n/strings_'+lang_code+'.json',
        __dirname+'/i18n/strings_en.json',
        __dirname + '/UIConfig.json')
        .then(function(uiconf)
        {

            var ContempMod = self.config.get('ContempMod');
            if (ContempMod == '1') {
                uiconf.sections[3].hidden = false; // mod 1 selected
            } else {
                uiconf.sections[4].hidden = false; // mod 2 selected
            }
            
            // disable blur background option for volumio 2.x (chrome to old)
            if (self.IfBuster() == false) {
                uiconf.sections[1].content[3].hidden = true;
                uiconf.sections[1].content[4].hidden = true;
            }
    
            // section 0 - mode selection -----------
            uiconf.sections[0].content[0].value.value = ContempMod;
            uiconf.sections[0].content[0].value.label = self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.MOD' + ContempMod);        

            // section 1 - global settings ----------
            uiconf.sections[1].content[0].value.value = self.config.get('forecolor');
            uiconf.sections[1].content[0].value.label = self.config.get('forecolor_title');
            uiconf.sections[1].content[1].value = self.config.get('colorCustom');
            uiconf.sections[1].content[2].value.value = self.config.get('bgdarkness');
            uiconf.sections[1].content[2].value.label = self.config.get('bgdarkness');
            uiconf.sections[1].content[3].value = self.config.get('bgkfilter');
            uiconf.sections[1].content[4].value = self.config.get('bgkfilterplay');
            uiconf.sections[1].content[5].value.value = self.config.get('ftopacity');
            uiconf.sections[1].content[5].value.label = self.config.get('ftopacity');
            uiconf.sections[1].content[6].value = self.config.get('fthide');
            uiconf.sections[1].content[7].value = self.config.get('btnbarhide');
            uiconf.sections[1].content[8].value = self.config.get('playbarhide');
            uiconf.sections[1].content[9].value = parseInt(self.config.get('buttons'),10);            
            uiconf.sections[1].content[10].value = self.config.get('gobackhide');
            uiconf.sections[1].content[11].value = self.config.get('roundedslider');
            uiconf.sections[1].content[12].value = self.config.get('headerbackdrop');
            uiconf.sections[1].content[13].value.value = self.config.get('playbackground');
            uiconf.sections[1].content[13].value.label = self.config.get('playbackground_title');
            uiconf.sections[1].content[14].value = parseInt(self.config.get('scrollbarwidth'),10);
            scalemem = parseInt(self.config.get('scale'),10);
            uiconf.sections[1].content[15].value = scalemem;

            // read background pictures and fill selection
            fs.readdir(backgroundPath,function(err, files) {
              if (err) {
                self.logger.error(id + err);
              }
              files.forEach(function (f) {
                if (f.indexOf('thumbnail-') < 0) {
                    self.configManager.pushUIConfigParam(uiconf, 'sections[1].content[13].options', {
                        value: f,
                        label: f.split('.')[0].capitalize()
                    });
                }
              });
            });
            for (var i = 0; i < globl.length ; i++) {
                if (i == 0 || i >= 5) { // for buttons, scrollbarwidth, scale
                    globl[i] = [uiconf.sections[1].content[i+9].attributes[2].min,
                    uiconf.sections[1].content[i+9].attributes[3].max,
                    uiconf.sections[1].content[i+9].attributes[0].placeholder];
                }
            }

            // section 2 - albumart settings -----------
            uiconf.sections[2].content[0].value = self.config.get('aahide');
            uiconf.sections[2].content[1].value = parseInt(self.config.get('aadim'),10);
            uiconf.sections[2].content[2].value = parseInt(self.config.get('aaspaceX'),10);
            uiconf.sections[2].content[3].value = parseInt(self.config.get('aaspaceY'),10);
            uiconf.sections[2].content[4].value = self.config.get('border');
            uiconf.sections[2].content[5].value.value = self.config.get('bordercolor');
            uiconf.sections[2].content[5].value.label = self.config.get('bordercolor_title');
            uiconf.sections[2].content[6].value = self.config.get('bordercolorCustom');
            uiconf.sections[2].content[7].value = self.config.get('bordercorner');
            uiconf.sections[2].content[8].value = self.config.get('aashadow');
            uiconf.sections[2].content[9].value = self.config.get('aabackground');
            for (var i = 0; i < aart.length ; i++) {
                aart[i] = [uiconf.sections[2].content[i+1].attributes[2].min,
                uiconf.sections[2].content[i+1].attributes[3].max,
                uiconf.sections[2].content[i+1].attributes[0].placeholder];
            }

            // section 3 - text settings mod 1 -----------
            uiconf.sections[3].content[0].value = self.config.get('textwrap');
            uiconf.sections[3].content[1].value = parseInt(self.config.get('tinfoleft'),10);
            uiconf.sections[3].content[2].value = parseInt(self.config.get('tinforight'),10);
            uiconf.sections[3].content[3].value = parseInt(self.config.get('tinfoY'),10);
            uiconf.sections[3].content[4].value = parseInt(self.config.get('title'),10);
            uiconf.sections[3].content[5].value = parseInt(self.config.get('title2'),10);
            uiconf.sections[3].content[6].value = parseInt(self.config.get('artist'),10);
            uiconf.sections[3].content[7].value = parseInt(self.config.get('srate'),10);
            uiconf.sections[3].content[8].value = parseInt(self.config.get('sratespace'),10);
            for (var i = 0; i < tinfo.length ; i++) {
                tinfo[i] = [uiconf.sections[3].content[i+1].attributes[2].min,
                uiconf.sections[3].content[i+1].attributes[3].max,
                uiconf.sections[3].content[i+1].attributes[0].placeholder];
            }

            // section 4 - text settings mod 2 -----------
            uiconf.sections[4].content[0].value = self.config.get('textwrap');
            uiconf.sections[4].content[1].value = parseInt(self.config.get('tinfoleft'),10);
            uiconf.sections[4].content[2].value = parseInt(self.config.get('tinforight'),10);
            uiconf.sections[4].content[3].value.value = self.config.get('resolution');
            uiconf.sections[4].content[3].value.label = self.config.get('resolution_title');
            uiconf.sections[4].content[4].value = parseInt(self.config.get('tinfoY'),10);
            uiconf.sections[4].content[5].value = parseInt(self.config.get('title'),10);
            uiconf.sections[4].content[6].value = parseInt(self.config.get('artist'),10);
            uiconf.sections[4].content[7].value = parseInt(self.config.get('srate'),10);
            uiconf.sections[4].content[8].value = parseInt(self.config.get('sratespace'),10);
            uiconf.sections[4].content[9].value = parseInt(self.config.get('tinfoY2'),10);
            uiconf.sections[4].content[10].value = parseInt(self.config.get('title2'),10);
            uiconf.sections[4].content[11].value = parseInt(self.config.get('artist2'),10);
            uiconf.sections[4].content[12].value = parseInt(self.config.get('srate2'),10);
            uiconf.sections[4].content[13].value = parseInt(self.config.get('sratespace2'),10);
            uiconf.sections[4].content[14].value = parseInt(self.config.get('tinfoY3'),10);
            uiconf.sections[4].content[15].value = parseInt(self.config.get('title3'),10);
            uiconf.sections[4].content[16].value = parseInt(self.config.get('artist3'),10);
            uiconf.sections[4].content[17].value = parseInt(self.config.get('srate3'),10);
            uiconf.sections[4].content[18].value = parseInt(self.config.get('sratespace3'),10);
            for (var i = 0; i < tinfo2.length ; i++) {
                if (i != 2) {
                    tinfo2[i] = [uiconf.sections[4].content[i+1].attributes[2].min,
                    uiconf.sections[4].content[i+1].attributes[3].max,
                    uiconf.sections[4].content[i+1].attributes[0].placeholder];
                }
            }

            // section 5 - genre view settings -----------
            uiconf.sections[5].content[0].value = self.config.get('showalbumart');
            uiconf.sections[5].content[1].value = self.config.get('sortalbumartist');
            
            defer.resolve(uiconf);
        })
        .fail(function()
        {
            defer.reject(new Error());
        });

    return defer.promise;
};

contemporaryAdvanced.prototype.getConfigurationFiles = function() {
	return ['config.json'];
};

// called when 'save' button pressed for mode selection
contemporaryAdvanced.prototype.setModSelection = function (confData) {
    const self = this;
            
    if (self.config.get('ContempMod') != confData.mod_selection.value) {
        self.config.set('ContempMod', confData.mod_selection.value);
        //self.enableMod (confData.mod_selection.value);
        
        try {
            //if (fs.existsSync(cssfile)){fs.unlinkSync(cssfile);}
            //fs.symlinkSync(cssfile_active, cssfile, 'file');
                        
            self.updateCSSMountpoint(confData.mod_selection.value);            
            self.commandRouter.reloadUi();
            self.updateUIConfig();
            setTimeout(function () {
                self.commandRouter.pushToastMessage('success', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('COMMON.SETTINGS_SAVED_SUCCESSFULLY'));
            }, 2000);
        } catch (err) {
            self.logger.error(id + err);
            self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.ERROR_CSS'));        
        }
    } else {
        self.commandRouter.pushToastMessage('info', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.NO_CHANGES'));  
    }
        
};  

// called when 'save' button pressed for global settings
contemporaryAdvanced.prototype.setGlobalModUI = function (confData) {
    const self = this;
    //const sedcmd = "/bin/sed -i '/GUI_ID: "
    var rgbColor, css_context_1, css_context_2;
    var cssContext_1 = fs.readFileSync(cssfile_1, 'utf8');
    var cssContext_2 = fs.readFileSync(cssfile_2, 'utf8');
    uiNeedsUpdate = false;
    
    try {
        
        self.config.set('forecolor', confData.forecolor.value);
        self.config.set('forecolor_title', confData.forecolor.label);
        self.config.set('colorCustom', confData.colorCustom);
        if (confData.forecolor.value == 'custom') {
            rgbColor = self.hexToRgb(confData.colorCustom);
            rgbColor = rgbColor.r + ', ' + rgbColor.g + ', ' + rgbColor.b;
        } else {
            rgbColor = confData.forecolor.value;
        }
        css_context_1 = cssContext_1.replace(/(GUI_ID: 100.*[\r\n]+)([^\r\n]+)/, '$1--forecolor: ' + rgbColor + ';');
        css_context_2 = cssContext_2.replace(/(GUI_ID: 100.*[\r\n]+)([^\r\n]+)/, '$1--forecolor: ' + rgbColor + ';');
        //execSync(sedcmd + '100/!b;n;c--forecolor: ' + rgbColor + ";' " + cssfile_1);
        //execSync(sedcmd + '100/!b;n;c--forecolor: ' + rgbColor + ";' " + cssfile_2);

        self.config.set('bgdarkness', confData.bgdarkness.value);
        css_context_1 = css_context_1.replace(/(GUI_ID: 101.*[\r\n]+)([^\r\n]+)/, '$1--bgdarkness: ' + confData.bgdarkness.value + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 101.*[\r\n]+)([^\r\n]+)/, '$1--bgdarkness: ' + confData.bgdarkness.value + ';');
        //execSync(sedcmd + '101/!b;n;c--bgdarkness: ' + confData.bgdarkness.value + ";' " + cssfile_1);
        //execSync(sedcmd + '101/!b;n;c--bgdarkness: ' + confData.bgdarkness.value + ";' " + cssfile_2);

        self.config.set('bgkfilter', confData.bgkfilter);
        css_context_1 = css_context_1.replace(/(GUI_ID: 108.*[\r\n]+)([^\r\n]+)/, '$1--bgfilter: ' + (confData.bgkfilter ? 'blur(8px)' : 'none') + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 108.*[\r\n]+)([^\r\n]+)/, '$1--bgfilter: ' + (confData.bgkfilter ? 'blur(8px)' : 'none') + ';');
        self.config.set('bgkfilterplay', confData.bgkfilterplay);
        css_context_1 = css_context_1.replace(/(GUI_ID: 109.*[\r\n]+)([^\r\n]+)/, '$1--bgfilterplay: ' + (confData.bgkfilterplay ? 'blur(8px)' : 'none') + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 109.*[\r\n]+)([^\r\n]+)/, '$1--bgfilterplay: ' + (confData.bgkfilterplay ? 'blur(8px)' : 'none') + ';');

        self.config.set('ftopacity', confData.ftopacity.value);
        css_context_1 = css_context_1.replace(/(GUI_ID: 102.*[\r\n]+)([^\r\n]+)/, '$1--ftopacity: ' + confData.ftopacity.value + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 102.*[\r\n]+)([^\r\n]+)/, '$1--ftopacity: ' + confData.ftopacity.value + ';');
        //execSync(sedcmd + '102/!b;n;c--ftopacity: ' + confData.ftopacity.value + ";' " + cssfile_1);
        //execSync(sedcmd + '102/!b;n;c--ftopacity: ' + confData.ftopacity.value + ";' " + cssfile_2);
        
        self.config.set('fthide', confData.fthide);
        css_context_1 = css_context_1.replace(/(GUI_ID: 200.*[\r\n]+)([^\r\n]+)/g, '$1@media (orientation: landscape) and (max-width: ' + (confData.fthide ? '991' : '0') + 'px) {');
        css_context_2 = css_context_2.replace(/(GUI_ID: 200.*[\r\n]+)([^\r\n]+)/g, '$1@media (orientation: landscape) and (max-width: ' + (confData.fthide ? '3840' : '0') + 'px) {');
        //execSync(sedcmd + '200/!b;n;c@media (orientation: landscape) and (max-width: ' + (confData.fthide ? '991' : '0') + "px) {' " + cssfile_1);
        //execSync(sedcmd + '200/!b;n;c@media (orientation: landscape) and (max-width: ' + (confData.fthide ? '3840' : '0') + "px) {' " + cssfile_2);
      
        self.config.set('btnbarhide', confData.btnbarhide);
        css_context_1 = css_context_1.replace(/(GUI_ID: 105.*[\r\n]+)([^\r\n]+)/, '$1--trackbtn: ' + (confData.btnbarhide ? 'none' : 'inline-block') + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 105.*[\r\n]+)([^\r\n]+)/, '$1--trackbtn: ' + (confData.btnbarhide ? 'none' : 'inline-block') + ';');
        //execSync(sedcmd + '105/!b;n;c--trackbtn: ' + (confData.btnbarhide ? 'none' : 'inline-block') + ";' " + cssfile_1);
        //execSync(sedcmd + '105/!b;n;c--trackbtn: ' + (confData.btnbarhide ? 'none' : 'inline-block') + ";' " + cssfile_2);

        self.config.set('playbarhide', confData.playbarhide);
        css_context_1 = css_context_1.replace(/(GUI_ID: 106.*[\r\n]+)([^\r\n]+)/, '$1--playbtn: ' + (confData.playbarhide ? 'none' : 'block') + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 106.*[\r\n]+)([^\r\n]+)/, '$1--playbtn: ' + (confData.playbarhide ? 'none' : 'block') + ';');

        confData.buttons = self.minmax('BUTTONS', confData.buttons, globl[0]);
        self.config.set('buttons', confData.buttons);
        css_context_1 = css_context_1.replace(/(GUI_ID: 119.*[\r\n]+)([^\r\n]+)/, '$1--buttons: ' + confData.buttons + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 119.*[\r\n]+)([^\r\n]+)/, '$1--buttons: ' + confData.buttons + ';');
        //execSync(sedcmd + '119/!b;n;c--buttons: ' + confData.buttons + ";' " + cssfile_1);
        
        self.config.set('gobackhide', confData.gobackhide);
        css_context_1 = css_context_1.replace(/(GUI_ID: 107.*[\r\n]+)([^\r\n]+)/, '$1--gobackbtn: ' + (confData.gobackhide ? 'none' : 'unset') + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 107.*[\r\n]+)([^\r\n]+)/, '$1--gobackbtn: ' + (confData.gobackhide ? 'none' : 'unset') + ';');
      
        self.config.set('roundedslider', confData.roundedslider);
        css_context_1 = css_context_1.replace(/(GUI_ID: 205.*[\r\n]+)([^\r\n]+)/, '$1@media (max-width: ' + (confData.roundedslider ? '991' : '0') + 'px) {');
        css_context_2 = css_context_2.replace(/(GUI_ID: 205.*[\r\n]+)([^\r\n]+)/, '$1@media (max-width: ' + (confData.roundedslider ? '3840' : '0') + 'px) {');
        //execSync(sedcmd + '205/!b;n;c@media (max-width: ' + (confData.roundedslider ? '991' : '0') + "px) {' " + cssfile_1);
        //execSync(sedcmd + '205/!b;n;c@media (max-width: ' + (confData.roundedslider ? '3840' : '0') + "px) {' " + cssfile_2);
      
        self.config.set('headerbackdrop', confData.headerbackdrop);
        css_context_2 = css_context_2.replace(/(GUI_ID: 103.*[\r\n]+)([^\r\n]+)/, '$1--headerbackdrop: ' + (confData.headerbackdrop ? 'none' : 'unset') + ';');
        //execSync(sedcmd + '103/!b;n;c--headerbackdrop: ' + (confData.headerbackdrop ? 'none' : 'unset') + ";' " + cssfile_2);
      
        self.config.set('playbackground', confData.playbackground.value);
        self.config.set('playbackground_title', confData.playbackground.label);
        var backgroundStr = confData.playbackground.value == 'none' ? 'unset' : 'url(../../../../backgrounds/' + confData.playbackground.value + ')';
        css_context_1 = css_context_1.replace(/(GUI_ID: 201.*[\r\n]+)([^\r\n]+)/, '$1background-image: ' + backgroundStr + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 201.*[\r\n]+)([^\r\n]+)/, '$1background-image: ' + backgroundStr + ';');
        //execSync(sedcmd + '201/!b;n;cbackground-image: ' + backgroundStr + ";' " + cssfile_1);
        //execSync(sedcmd + '201/!b;n;cbackground-image: ' + backgroundStr + ";' " + cssfile_2);

        confData.scrollbarwidth = self.minmax('SCROLLBAR', confData.scrollbarwidth, globl[5]);
        self.config.set('scrollbarwidth', confData.scrollbarwidth);
        css_context_1 = css_context_1.replace(/(GUI_ID: 104.*[\r\n]+)([^\r\n]+)/, '$1--scrollbarwidth: ' + confData.scrollbarwidth + 'px;');
        css_context_2 = css_context_2.replace(/(GUI_ID: 104.*[\r\n]+)([^\r\n]+)/, '$1--scrollbarwidth: ' + confData.scrollbarwidth + 'px;');
        //execSync(sedcmd + '104/!b;n;c--scrollbarwidth: ' + confData.scrollbarwidth + "px;' " + cssfile_1);
        //execSync(sedcmd + '104/!b;n;c--scrollbarwidth: ' + confData.scrollbarwidth + "px;' " + cssfile_2);

        confData.scale = self.minmax('SCALE', confData.scale, globl[6]);
        self.config.set('scale', confData.scale);
        exec('/usr/bin/chromium-browser -version', { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {
          if (error !== null) {
              self.logger.error(id + 'Error requesting browser version.');
          } else {
              exec("/bin/echo volumio | /usr/bin/sudo -S /bin/sed -i -e 's/factor=.* /factor=" + confData.scale / 100 + " /' /opt/volumiokiosk.sh", { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {
                if (error !== null) {
                  self.logger.error(id + 'Error modifying /opt/volumiokiosk.sh: ' + error);
                  self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.ERROR_KIOSK') + error);
                }
              });
          }
        });

        fs.writeFileSync(cssfile_1, css_context_1, 'utf8');
        fs.writeFileSync(cssfile_2, css_context_2, 'utf8');
        self.updateCSSMountpoint(self.config.get('ContempMod'));
        
        if (scalemem != confData.scale) {
            execSync('/bin/echo volumio | /usr/bin/sudo -S /bin/systemctl restart volumio-kiosk.service');
        }

        self.commandRouter.reloadUi();
        if (uiNeedsUpdate) {self.updateUIConfig();}
        setTimeout(function () {
            self.commandRouter.pushToastMessage('success', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('COMMON.SETTINGS_SAVED_SUCCESSFULLY'));
        }, 2000);
    
    } catch (e) {
        self.logger.error(id + e);
        self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.ERROR_CSS'));
    }    
};

// called when 'save' button pressed for albumart settings
contemporaryAdvanced.prototype.setAlbumartModUI = function (confData) {
    const self = this;
    //const sedcmd = "/bin/sed -i '/GUI_ID: "
    var rgbColor, css_context_1, css_context_2;
    var cssContext_1 = fs.readFileSync(cssfile_1, 'utf8');
    var cssContext_2 = fs.readFileSync(cssfile_2, 'utf8');
    uiNeedsUpdate = false;

    try {
        self.config.set('aahide', confData.aahide);
        var aahideStr = confData.aahide ? 'none' : 'unset';
        css_context_1 = cssContext_1.replace(/(GUI_ID: 202.*[\r\n]+)([^\r\n]+)/, '$1display: ' + aahideStr + ';');
        css_context_2 = cssContext_2.replace(/(GUI_ID: 202.*[\r\n]+)([^\r\n]+)/, '$1display: ' + aahideStr + ';');
        //execSync(sedcmd + '202/!b;n;cdisplay: ' + aahideStr + ";' " + cssfile_1);
        //execSync(sedcmd + '202/!b;n;cdisplay: ' + aahideStr + ";' " + cssfile_2);
      
        aahideStr = confData.aahide ? 'padding-left: calc(15px + var(--tinfoleft)/2);' : 'padding-left: calc((15px + var(--aaspaceX)/2) + var(--tinfoleft)/2);';
        css_context_1 = css_context_1.replace(/(GUI_ID: 203.*[\r\n]+)([^\r\n]+)/g, '$1' + aahideStr);
        css_context_2 = css_context_2.replace(/(GUI_ID: 203.*[\r\n]+)([^\r\n]+)/g, '$1' + aahideStr);
        //execSync(sedcmd + '203/!b;n;c' + aahideStr + "' " + cssfile_1);
        //execSync(sedcmd + '203/!b;n;c' + aahideStr + "' " + cssfile_2);
      
        aahideStr = confData.aahide ? 'left: calc(var(--tinfoleft)/2);' : 'left: calc((var(--calcaadim) + var(--aaspaceX)/2) + var(--tinfoleft)/2);';
        css_context_1 = css_context_1.replace(/(GUI_ID: 204.*[\r\n]+)([^\r\n]+)/, '$1' + aahideStr);
        css_context_2 = css_context_2.replace(/(GUI_ID: 204.*[\r\n]+)([^\r\n]+)/, '$1' + aahideStr);
        //execSync(sedcmd + '204/!b;n;c' + aahideStr + "' " + cssfile_1);
        //execSync(sedcmd + '204/!b;n;c' + aahideStr + "' " + cssfile_2);
      
        aahideStr = confData.aahide ? 'width: calc(100vw - var(--tinfoleft)/2 - var(--tinforight));' : 'width: calc(100vw - var(--tinfoleft)/2 - var(--tinforight) - var(--calcaadim) - var(--aaspaceX)/2);';
        css_context_1 = css_context_1.replace(/(GUI_ID: 206.*[\r\n]+)([^\r\n]+)/, '$1' + aahideStr);
        css_context_2 = css_context_2.replace(/(GUI_ID: 206.*[\r\n]+)([^\r\n]+)/, '$1' + aahideStr);
        //execSync(sedcmd + '204/!b;n;n;c' + aahideStr + "' " + cssfile_1);
        //execSync(sedcmd + '204/!b;n;n;c' + aahideStr + "' " + cssfile_2);

        confData.aadim = self.minmax('AADIM', confData.aadim, aart[0]);
        self.config.set('aadim', confData.aadim);
        css_context_1 = css_context_1.replace(/(GUI_ID: 110.*[\r\n]+)([^\r\n]+)/, '$1--aadim: ' + confData.aadim + 'px;');
        css_context_2 = css_context_2.replace(/(GUI_ID: 110.*[\r\n]+)([^\r\n]+)/, '$1--aadim: ' + confData.aadim + 'px;');
        //execSync(sedcmd + '110/!b;n;c--aadim: ' + confData.aadim + "px;' " + cssfile_1);
        //execSync(sedcmd + '110/!b;n;c--aadim: ' + confData.aadim + "px;' " + cssfile_2);
      
        confData.aaspaceX = self.minmax('AASPACEX', confData.aaspaceX, aart[1]);
        self.config.set('aaspaceX', confData.aaspaceX);
        css_context_1 = css_context_1.replace(/(GUI_ID: 111.*[\r\n]+)([^\r\n]+)/, '$1--aaspaceX: ' + confData.aaspaceX + 'vh;');
        css_context_2 = css_context_2.replace(/(GUI_ID: 111.*[\r\n]+)([^\r\n]+)/, '$1--aaspaceX: ' + confData.aaspaceX + 'vh;');
        //execSync(sedcmd + '111/!b;n;c--aaspaceX: ' + confData.aaspaceX + "vh;' " + cssfile_1);
        //execSync(sedcmd + '111/!b;n;c--aaspaceX: ' + confData.aaspaceX + "vh;' " + cssfile_2);
      
        confData.aaspaceY = self.minmax('AASPACEY', confData.aaspaceY, aart[2]);
        self.config.set('aaspaceY', confData.aaspaceY);
        css_context_1 = css_context_1.replace(/(GUI_ID: 112.*[\r\n]+)([^\r\n]+)/, '$1--aaspaceY: ' + confData.aaspaceY + 'vh;');
        css_context_2 = css_context_2.replace(/(GUI_ID: 112.*[\r\n]+)([^\r\n]+)/, '$1--aaspaceY: ' + confData.aaspaceY + 'vh;');
        //execSync(sedcmd + '112/!b;n;c--aaspaceY: ' + confData.aaspaceY + "vh;' " + cssfile_1);
        //execSync(sedcmd + '112/!b;n;c--aaspaceY: ' + confData.aaspaceY + "vh;' " + cssfile_2);

        self.config.set('border', confData.border);
        var borderInt = confData.border ? '1' : '0';
        css_context_1 = css_context_1.replace(/(GUI_ID: 113.*[\r\n]+)([^\r\n]+)/, '$1--border: ' + borderInt + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 113.*[\r\n]+)([^\r\n]+)/, '$1--border: ' + borderInt + ';');
        //execSync(sedcmd + '113/!b;n;c--border: ' + borderInt + ";' " + cssfile_1);
        //execSync(sedcmd + '113/!b;n;c--border: ' + borderInt + ";' " + cssfile_2);

        self.config.set('bordercolor', confData.bordercolor.value);
        self.config.set('bordercolor_title', confData.bordercolor.label);
        self.config.set('bordercolorCustom', confData.bordercolorCustom);
        if (confData.bordercolor.value == 'custom') {
            rgbColor = self.hexToRgb(confData.bordercolorCustom);
            rgbColor = rgbColor.r + ', ' + rgbColor.g + ', ' + rgbColor.b;
        } else {
            rgbColor = confData.bordercolor.value;
        }
        css_context_1 = css_context_1.replace(/(GUI_ID: 115.*[\r\n]+)([^\r\n]+)/, '$1--bordercolor: ' + rgbColor + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 115.*[\r\n]+)([^\r\n]+)/, '$1--bordercolor: ' + rgbColor + ';');
        //execSync(sedcmd + '115/!b;n;c--bordercolor: ' + rgbColor + ";' " + cssfile_1);
        //execSync(sedcmd + '115/!b;n;c--bordercolor: ' + rgbColor + ";' " + cssfile_2);

        self.config.set('bordercorner', confData.bordercorner);
        var bordercornerInt = confData.bordercorner ? '1' : '0';
        css_context_1 = css_context_1.replace(/(GUI_ID: 114.*[\r\n]+)([^\r\n]+)/, '$1--bordercorner: ' + bordercornerInt + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 114.*[\r\n]+)([^\r\n]+)/, '$1--bordercorner: ' + bordercornerInt + ';');
        //execSync(sedcmd + '114/!b;n;c--bordercorner: ' + bordercornerInt + ";' " + cssfile_1);
        //execSync(sedcmd + '114/!b;n;c--bordercorner: ' + bordercornerInt + ";' " + cssfile_2);
      
        self.config.set('aashadow', confData.aashadow);
        var aashadowInt = confData.aashadow ? '1' : '0';
        css_context_1 = css_context_1.replace(/(GUI_ID: 116.*[\r\n]+)([^\r\n]+)/, '$1--aashadow: ' + aashadowInt + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 116.*[\r\n]+)([^\r\n]+)/, '$1--aashadow: ' + aashadowInt + ';');
        //execSync(sedcmd + '116/!b;n;c--aashadow: ' + aashadowInt + ";' " + cssfile_1);
        //execSync(sedcmd + '116/!b;n;c--aashadow: ' + aashadowInt + ";' " + cssfile_2);

        self.config.set('aabackground', confData.aabackground);
        var aabackgroundInt = confData.aabackground ? 'rgba(255,255,255,1)' : 'transparent';
        css_context_1 = css_context_1.replace(/(GUI_ID: 117.*[\r\n]+)([^\r\n]+)/, '$1--aabackground: ' + aabackgroundInt + ';');
        css_context_2 = css_context_2.replace(/(GUI_ID: 117.*[\r\n]+)([^\r\n]+)/, '$1--aabackground: ' + aabackgroundInt + ';');
       
        fs.writeFileSync(cssfile_1, css_context_1, 'utf8');
        fs.writeFileSync(cssfile_2, css_context_2, 'utf8');
        self.updateCSSMountpoint(self.config.get('ContempMod'));
        self.commandRouter.reloadUi();

        if (uiNeedsUpdate) {self.updateUIConfig();}
        setTimeout(function () {
            self.commandRouter.pushToastMessage('success', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('COMMON.SETTINGS_SAVED_SUCCESSFULLY'));
        }, 2000);
        
    } catch (e) {
        self.logger.error(id + e);
        self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.ERROR_CSS'));
    } 
};    

// called when 'save' button pressed for track info Mod 1
contemporaryAdvanced.prototype.setTitle1ModUI = function (confData) {
    const self = this;
    //const sedcmd = "/bin/sed -i '/GUI_ID: "
    var css_context_1;
    var cssContext_1 = fs.readFileSync(cssfile_1, 'utf8');
    uiNeedsUpdate = false;
    
    try {      
        self.config.set('textwrap', confData.textwrap);
        css_context_1 = cssContext_1.replace(/(GUI_ID: 120.*[\r\n]+)([^\r\n]+)/, '$1--textwrap: ' + (confData.textwrap ? 'normal' : 'nowrap') + ';');
        //execSync(sedcmd + '120/!b;n;c--textwrap: ' + (confData.textwrap ? 'normal' : 'nowrap') + ";' " + cssfile_1);

        confData.tinfoleft = self.minmax('TEXTINFOLEFT', confData.tinfoleft, tinfo[0]);
        self.config.set('tinfoleft', confData.tinfoleft);
        css_context_1 = css_context_1.replace(/(GUI_ID: 127.*[\r\n]+)([^\r\n]+)/, '$1--tinfoleft: ' + confData.tinfoleft + 'vw;');
        //execSync(sedcmd + '127/!b;n;c--tinfoleft: ' + confData.tinfoleft + "vw;' " + cssfile_1);
        confData.tinforight = self.minmax('TEXTINFORIGHT', confData.tinforight, tinfo[1]);
        self.config.set('tinforight', confData.tinforight);
        css_context_1 = css_context_1.replace(/(GUI_ID: 128.*[\r\n]+)([^\r\n]+)/, '$1--tinforight: ' + confData.tinforight + 'vw;');
        //execSync(sedcmd + '128/!b;n;c--tinforight: ' + confData.tinforight + "vw;' " + cssfile_1);

        confData.tinfoY = self.minmax('TEXTINFOY', confData.tinfoY, tinfo[2]);
        self.config.set('tinfoY', confData.tinfoY);
        css_context_1 = css_context_1.replace(/(GUI_ID: 121.*[\r\n]+)([^\r\n]+)/, '$1--tinfoY: ' + confData.tinfoY + 'vh;');
        //execSync(sedcmd + '121/!b;n;c--tinfoY: ' + confData.tinfoY + "vh;' " + cssfile_1);
      
        confData.title = self.minmax('TITLE', confData.title, tinfo[3]);
        self.config.set('title', confData.title);
        css_context_1 = css_context_1.replace(/(GUI_ID: 122.*[\r\n]+)([^\r\n]+)/, '$1--title600: ' + confData.title + 'px;');
        //execSync(sedcmd + '122/!b;n;c--title600: ' + confData.title + "px;' " + cssfile_1);
        confData.title2 = self.minmax('TITLE4', confData.title2, tinfo[4]);
        self.config.set('title2', confData.title2);
        css_context_1 = css_context_1.replace(/(GUI_ID: 123.*[\r\n]+)([^\r\n]+)/, '$1--title601: ' + confData.title2 + 'px;');
        //execSync(sedcmd + '123/!b;n;c--title601: ' + confData.title2 + "px;' " + cssfile_1);
      
        confData.artist = self.minmax('ARTIST', confData.artist, tinfo[5]);
        self.config.set('artist', confData.artist);
        css_context_1 = css_context_1.replace(/(GUI_ID: 124.*[\r\n]+)([^\r\n]+)/, '$1--artist: ' + confData.artist + 'px;');
        //execSync(sedcmd + '124/!b;n;c--artist: ' + confData.artist + "px;' " + cssfile_1);
      
        confData.srate = self.minmax('SRATE', confData.srate, tinfo[6]);
        self.config.set('srate', confData.srate);
        css_context_1 = css_context_1.replace(/(GUI_ID: 126.*[\r\n]+)([^\r\n]+)/, '$1--srate: ' + confData.srate + 'px;');
        //execSync(sedcmd + '125/!b;n;c--srate: ' + confData.srate + "px;' " + cssfile_1);
        confData.sratespace = self.minmax('SRATESPACE', confData.sratespace, tinfo[7]);
        self.config.set('sratespace', confData.sratespace);
        css_context_1 = css_context_1.replace(/(GUI_ID: 125.*[\r\n]+)([^\r\n]+)/, '$1--sratespace: ' + confData.sratespace + 'px;');
        //execSync(sedcmd + '126/!b;n;c--sratespace: ' + confData.sratespace + "px;' " + cssfile_1);


        fs.writeFileSync(cssfile_1, css_context_1, 'utf8');
        self.updateCSSMountpoint(self.config.get('ContempMod'));
        self.commandRouter.reloadUi();

        if (uiNeedsUpdate) {self.updateUIConfig();}
        setTimeout(function () {
            self.commandRouter.pushToastMessage('success', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('COMMON.SETTINGS_SAVED_SUCCESSFULLY'));
        }, 2000);
        
    } catch (e) {
        self.logger.error(id + e);
        self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.ERROR_CSS'));
    }
};

// called when 'save' button pressed for track info Mod 2
contemporaryAdvanced.prototype.setTitle2ModUI = function (confData) {
    const self = this;
    //const sedcmd = "/bin/sed -i '/GUI_ID: "
    var css_context_2;
    var cssContext_2 = fs.readFileSync(cssfile_2, 'utf8');
    uiNeedsUpdate = false;

    
    try {
        self.config.set('textwrap', confData.textwrap);
        css_context_2 = cssContext_2.replace(/(GUI_ID: 120.*[\r\n]+)([^\r\n]+)/, '$1--textwrap: ' + (confData.textwrap ? 'normal' : 'nowrap') + ';');
        //execSync(sedcmd + '120/!b;n;c--textwrap: ' + (confData.textwrap ? 'normal' : 'nowrap') + ";' " + cssfile_2);

        confData.tinfoleft = self.minmax('TEXTINFOLEFT', confData.tinfoleft, tinfo2[0]);
        self.config.set('tinfoleft', confData.tinfoleft);
        css_context_2 = css_context_2.replace(/(GUI_ID: 127.*[\r\n]+)([^\r\n]+)/, '$1--tinfoleft: ' + confData.tinfoleft + 'vw;');
        //execSync(sedcmd + '127/!b;n;c--tinfoleft: ' + confData.tinfoleft + "vw;' " + cssfile_2);
        confData.tinforight = self.minmax('TEXTINFORIGHT', confData.tinforight, tinfo2[1]);
        self.config.set('tinforight', confData.tinforight);
        css_context_2 = css_context_2.replace(/(GUI_ID: 128.*[\r\n]+)([^\r\n]+)/, '$1--tinforight: ' + confData.tinforight + 'vw;');
        //execSync(sedcmd + '128/!b;n;c--tinforight: ' + confData.tinforight + "vw;' " + cssfile_2);

        self.config.set('resolution', confData.resolution.value);
        self.config.set('resolution_title', confData.resolution.label);
      
        confData.tinfoY = self.minmax('TEXTINFOY', confData.tinfoY, tinfo2[3]);
        self.config.set('tinfoY', confData.tinfoY);
        css_context_2 = css_context_2.replace(/(GUI_ID: 121.*[\r\n]+)([^\r\n]+)/, '$1--tinfoY: ' + confData.tinfoY + 'vh;');
        //execSync(sedcmd + '121/!b;n;c--tinfoY: ' + confData.tinfoY + "vh;' " + cssfile_2);
      
        confData.title = self.minmax('TITLE3', confData.title, tinfo2[4]);
        self.config.set('title', confData.title);
        css_context_2 = css_context_2.replace(/(GUI_ID: 122.*[\r\n]+)([^\r\n]+)/, '$1--title: ' + confData.title + 'px;');
        //execSync(sedcmd + '122/!b;n;c--title: ' + confData.title + "px;' " + cssfile_2);
      
        confData.artist = self.minmax('ARTIST', confData.artist, tinfo2[5]);
        self.config.set('artist', confData.artist);
        css_context_2 = css_context_2.replace(/(GUI_ID: 123.*[\r\n]+)([^\r\n]+)/, '$1--artist: ' + confData.artist + 'px;');
        //execSync(sedcmd + '123/!b;n;c--artist: ' + confData.artist + "px;' " + cssfile_2);
      
        confData.srate = self.minmax('SRATE', confData.srate, tinfo2[6]);
        self.config.set('srate', confData.srate);
        css_context_2 = css_context_2.replace(/(GUI_ID: 124.*[\r\n]+)([^\r\n]+)/, '$1--srate: ' + confData.srate + 'px;');
        //execSync(sedcmd + '124/!b;n;c--srate: ' + confData.srate + "px;' " + cssfile_2);
        confData.sratespace = self.minmax('SRATESPACE', confData.sratespace, tinfo2[7]);
        self.config.set('sratespace', confData.sratespace);
        css_context_2 = css_context_2.replace(/(GUI_ID: 125.*[\r\n]+)([^\r\n]+)/, '$1--sratespace: ' + confData.sratespace + 'px;');
        //execSync(sedcmd + '125/!b;n;c--sratespace: ' + confData.sratespace + "px;' " + cssfile_2);

        confData.tinfoY2 = self.minmax('TEXTINFOY', confData.tinfoY2, tinfo2[8]);
        self.config.set('tinfoY2', confData.tinfoY2);
        css_context_2 = css_context_2.replace(/(GUI_ID: 131.*[\r\n]+)([^\r\n]+)/, '$1--tinfoY2: ' + confData.tinfoY2 + 'vh;');
        //execSync(sedcmd + '131/!b;n;c--tinfoY2: ' + confData.tinfoY2 + "vh;' " + cssfile_2);
      
        confData.title2 = self.minmax('TITLE3', confData.title2, tinfo2[9]);
        self.config.set('title2', confData.title2);
        css_context_2 = css_context_2.replace(/(GUI_ID: 132.*[\r\n]+)([^\r\n]+)/, '$1--title2: ' + confData.title2 + 'px;');
        //execSync(sedcmd + '132/!b;n;c--title2: ' + confData.title2 + "px;' " + cssfile_2);
        
        confData.artist2 = self.minmax('ARTIST', confData.artist2, tinfo2[10]);
        self.config.set('artist2', confData.artist2);
        css_context_2 = css_context_2.replace(/(GUI_ID: 133.*[\r\n]+)([^\r\n]+)/, '$1--artist2: ' + confData.artist2 + 'px;');
        //execSync(sedcmd + '133/!b;n;c--artist2: ' + confData.artist2 + "px;' " + cssfile_2);
      
        confData.srate2 = self.minmax('SRATE', confData.srate2, tinfo2[11]);
        self.config.set('srate2', confData.srate2);
        css_context_2 = css_context_2.replace(/(GUI_ID: 134.*[\r\n]+)([^\r\n]+)/, '$1--srate2: ' + confData.srate2 + 'px;');
        //execSync(sedcmd + '134/!b;n;c--srate2: ' + confData.srate2 + "px;' " + cssfile_2);
        confData.sratespace2 = self.minmax('SRATESPACE', confData.sratespace2, tinfo2[12]);
        self.config.set('sratespace2', confData.sratespace2);
        css_context_2 = css_context_2.replace(/(GUI_ID: 135.*[\r\n]+)([^\r\n]+)/, '$1--sratespace2: ' + confData.sratespace2 + 'px;');
        //execSync(sedcmd + '135/!b;n;c--sratespace2: ' + confData.sratespace2 + "px;' " + cssfile_2);

        confData.tinfoY3 = self.minmax('TEXTINFOY', confData.tinfoY3, tinfo2[13]);
        self.config.set('tinfoY3', confData.tinfoY3);
        css_context_2 = css_context_2.replace(/(GUI_ID: 141.*[\r\n]+)([^\r\n]+)/, '$1--tinfoY3: ' + confData.tinfoY3 + 'vh;');
        //execSync(sedcmd + '141/!b;n;c--tinfoY3: ' + confData.tinfoY3 + "vh;' " + cssfile_2);
      
        confData.title3 = self.minmax('TITLE3', confData.title3, tinfo2[14]);
        self.config.set('title3', confData.title3);
        css_context_2 = css_context_2.replace(/(GUI_ID: 142.*[\r\n]+)([^\r\n]+)/, '$1--title3: ' + confData.title3 + 'px;');
        //execSync(sedcmd + '142/!b;n;c--title3: ' + confData.title3 + "px;' " + cssfile_2);
        
        confData.artist3 = self.minmax('ARTIST', confData.artist3, tinfo2[15]);
        self.config.set('artist3', confData.artist3);
        css_context_2 = css_context_2.replace(/(GUI_ID: 143.*[\r\n]+)([^\r\n]+)/, '$1--artist3: ' + confData.artist3 + 'px;');
        //execSync(sedcmd + '143/!b;n;c--artist3: ' + confData.artist3 + "px;' " + cssfile_2);
        
        confData.srate3 = self.minmax('SRATE', confData.srate3, tinfo2[16]);
        self.config.set('srate3', confData.srate3);
        css_context_2 = css_context_2.replace(/(GUI_ID: 144.*[\r\n]+)([^\r\n]+)/, '$1--srate3: ' + confData.srate3 + 'px;');
        //execSync(sedcmd + '144/!b;n;c--srate3: ' + confData.srate3 + "px;' " + cssfile_2);
        confData.sratespace3 = self.minmax('SRATESPACE', confData.sratespace3, tinfo2[17]);
        self.config.set('sratespace3', confData.sratespace3);
        css_context_2 = css_context_2.replace(/(GUI_ID: 145.*[\r\n]+)([^\r\n]+)/, '$1--sratespace3: ' + confData.sratespace3 + 'px;');
        //execSync(sedcmd + '145/!b;n;c--sratespace3: ' + confData.sratespace3 + "px;' " + cssfile_2);

        fs.writeFileSync(cssfile_2, css_context_2, 'utf8');
        self.updateCSSMountpoint(self.config.get('ContempMod'));
        self.commandRouter.reloadUi();

        if (uiNeedsUpdate) {self.updateUIConfig();}
        setTimeout(function () {
            self.commandRouter.pushToastMessage('success', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('COMMON.SETTINGS_SAVED_SUCCESSFULLY'));
        }, 2000);
        
    } catch (e) {
        self.logger.error(id + e);
        self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.ERROR_CSS'));
    }
};

// called when 'save' button pressed for track info Mod 2
contemporaryAdvanced.prototype.setGenreModUI = function (confData) {
    const self = this;
    var noChanges = true;
    
    try {
                                           
        if (confData.showalbumart != self.config.get('showalbumart')) {            
            self.config.set('showalbumart', confData.showalbumart);
            noChanges = false;
        }
        if (confData.sortalbumartist != self.config.get('sortalbumartist')) {
            self.config.set('sortalbumartist', confData.sortalbumartist);
            noChanges = false;
        }

        // only on first start, if not exist copied mpd
        //if (confData.showalbumart || confData.sortalbumartist) {
        if (confData.sortalbumartist) {
            if (!fs.existsSync(MPD)) {
                fs.copySync(MPDindex, MPD);
                //self.setAlbumart(MPD); not more compatible
                self.setAlbumartist(MPD);                
                self.AddMPDMountpoint();
                self.rebootMessage();
            }
        }

        setTimeout(function () {
          if (noChanges) {
            self.commandRouter.pushToastMessage('info', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.NO_CHANGES'));
          } else {  
            self.commandRouter.pushToastMessage('success', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('COMMON.SETTINGS_SAVED_SUCCESSFULLY'));
          }
        }, 500);
  
    } catch (e) {
        self.logger.error(id + e);
        self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.ERROR_MPD'));
    }        
};
    
//--------------------------------------------------

contemporaryAdvanced.prototype.updateUIConfig = function () {
  const self = this;
  const defer = libQ.defer();

  self.commandRouter.getUIConfigOnPlugin('miscellanea', 'contemporary_advanced', {})
    .then(function (uiconf) {
      self.commandRouter.broadcastMessage('pushUiConfig', uiconf);
    });
  self.commandRouter.broadcastMessage('pushUiConfig');
  uiNeedsUpdate = false;
  return defer.promise;
};

contemporaryAdvanced.prototype.minmax = function (item, value, attrib) {
  var self = this;
  if (Number.isNaN(parseInt(value, 10)) || !isFinite(value)) {
      uiNeedsUpdate = true;
      return attrib[2];
  }
    if (value < attrib[0]) {
      self.commandRouter.pushToastMessage('info', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.' + item.toUpperCase()) + ': ' + self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.INFO_MIN'));
      uiNeedsUpdate = true;
      return attrib[0];
    }
    if (value > attrib[1]) {
      self.commandRouter.pushToastMessage('info', self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.PLUGIN_NAME'), self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.' + item.toUpperCase()) + ': ' + self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.INFO_MAX'));
      uiNeedsUpdate = true;
      return attrib[1];
    }
    return parseInt(value, 10);
};

contemporaryAdvanced.prototype.hexToRgb = function (hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

contemporaryAdvanced.prototype.getStyleID = function (path) {
  var self = this;
  var StyleID = '';  
  var files = fs.readdirSync(path);
    
  files.forEach(file => {
    if (file.startsWith ('app-') && file.endsWith('.css')) {
        StyleID = file.substring(4,14)
        files.length = 0;
    }
  });          
  return StyleID; 
};

contemporaryAdvanced.prototype.updateCSSMountpoint = function (mod) {
  var self = this;
  var css_mod = mod == '1' ? cssfile_1 : cssfile_2;
    try {
        execSync('/bin/df ' + cssfile + ' | /bin/grep ' + cssfile + ' && /bin/echo volumio | /usr/bin/sudo -S /bin/umount ' + cssfile);
        execSync('/bin/df ' + cssfile + ' | /bin/grep ' + cssfile + ' && /bin/echo || /bin/echo volumio | /usr/bin/sudo -S /bin/mount --bind ' + css_mod + ' ' + cssfile);
    } catch (err) {
        self.logger.error(id + 'Cannot update css mountpoint');
    }    
};

contemporaryAdvanced.prototype.AddMPDMountpoint = function () {      
  var self = this;
  var defer = libQ.defer();
  var EscMPD = MPD.replace(/\//g , '\\/');
  var EscMPDindex = MPDindex.replace(/\//g , '\\/');
  
  var data = fs.readFileSync(fstab, 'utf-8');
  if ((data).indexOf(MPD) < 0) {
  
    try {
    exec("/bin/echo volumio | /usr/bin/sudo -S /bin/sed -i '$a " + EscMPD + " " + EscMPDindex + " none defaults,bind,user' " + fstab, { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {
        if (error) {
            self.logger.error(id + 'Cannot write fstab');
        } else {
            defer.resolve();
        }
    });
    } catch (err) {
        self.logger.error(id + 'Cannot update css mountpoint ' + err);
    } 
  }
  return defer.promise;
};

contemporaryAdvanced.prototype.RemoveMPDMountpoint = function () {
  var self = this;
  var defer = libQ.defer();
  var EscMPD = MPD.replace(/\//g , '\\/');
  
  var data = fs.readFileSync(fstab, 'utf-8');
  if ((data).indexOf(MPD) >= 0) {
    exec("/bin/echo volumio | /usr/bin/sudo -S /bin/sed -i '/" + EscMPD + "/d' " + fstab, { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {
        if (error) {
            self.logger.error(id + 'Cannot write fstab');
        } else {
            defer.resolve();
        }
    });
  }
  return defer.promise;  
};
      

contemporaryAdvanced.prototype.rebootMessage = function () {
  var self = this;
  var responseData = {
    title: self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.MPD_CHANGED'),
    message: self.commandRouter.getI18nString('CONTEMPORARY_ADVANCED.MPD_CHANGED_REBOOT'),
    size: 'lg',
    buttons: [
        {
          name: self.commandRouter.getI18nString('COMMON.RESTART'),
          class: 'btn btn-info',
          emit: 'reboot',
          payload: ''
        }
    ]
  };

  self.commandRouter.broadcastMessage('openModal', responseData);
};  
    
contemporaryAdvanced.prototype.setAlbumart = function (MPD) {
  var self = this;
  var insertStr = "/bin/sed -i \
'/var albumart = self.getAlbumArt({artist: albumartist, album: album}, self.getParentFolder(path), \\x27dot-circle-o\\x27);/a\
\\/\\/---> insert line\\n\
              var albumartists = showalbumart ? albumart : self.getAlbumArt({artist: albumartist}, undefined, \\x27users\\x27);' ";
    
  execSync(insertStr + MPD);
  execSync("/bin/sed -i 's/albumart: self.getAlbumArt({artist: albumartist}, undefined, \\x27users\\x27),/albumart: albumartists,/g' " + MPD);
 
};

contemporaryAdvanced.prototype.setAlbumartist = function (MPD) {
  var self = this;
  var insertStr = "/bin/sed -i \
'/var safeGenreArtist = genreArtist.replace(/a              \
\\/\\/---> insert\\n\
  var genreIndex_1, genreIndex_2, listIndex_0, listIndex_1;\\n\
  var sortGenre = self.commandRouter.executeOnPlugin(\\x27miscellanea\\x27, \\x27contemporary_advanced\\x27, \\x27getConfigParam\\x27, \\x27sortalbumartist\\x27);\\n\
  var showalbumart = self.commandRouter.executeOnPlugin(\\x27miscellanea\\x27, \\x27contemporary_advanced\\x27, \\x27getConfigParam\\x27, \\x27showalbumart\\x27);\\n\
  if (sortGenre){\\n\
    genreIndex_1 = \\x27COMMON.ARTISTS\\x27;\\n\
    genreIndex_2 = \\x27COMMON.ALBUMS\\x27;\\n\
    listIndex_0 = 1;\\n\
    listIndex_1 = 0;\\n\
  } else {\\n\
    genreIndex_1 = \\x27COMMON.ALBUMS\\x27;\\n\
    genreIndex_2 = \\x27COMMON.ARTISTS\\x27;\\n\
    listIndex_0 = 0;\\n\
    listIndex_1 = 1;\\n\
  }\\n\
\\/\\/<--- insert end\\n\
' ";

  execSync(insertStr + MPD);

  execSync("/bin/sed -i '0,/genreName + \\x27 \\x27 + self.commandRouter.getI18nString(\\x27COMMON.ALBUMS\\x27)/ s//genreName + \\x27 \\x27 + self.commandRouter.getI18nString(genreIndex_1)/' " + MPD);  
  execSync("/bin/sed -i '0,/genreName + \\x27 \\x27 + self.commandRouter.getI18nString(\\x27COMMON.ARTISTS\\x27)/ s//genreName + \\x27 \\x27 + self.commandRouter.getI18nString(genreIndex_2)/' " + MPD);

  execSync("/bin/sed -i '/if (album !== \\x27\\x27)/,/service: \\x27mpd\\x27/{s/response.navigation.lists\\[0\\]/response.navigation.lists\\[listIndex_0\\]/g;}' " + MPD);
  execSync("/bin/sed -i '/if (albumartist !== \\x27\\x27)/,/service: \\x27mpd\\x27/{s/response.navigation.lists\\[1\\]/response.navigation.lists\\[listIndex_1\\]/g;}' " + MPD);
  execSync("/bin/sed -i '/if (artist !== \\x27\\x27)/,/service: \\x27mpd\\x27/{s/response.navigation.lists\\[1\\]/response.navigation.lists\\[listIndex_1\\]/g;}' " + MPD);

};

// ---------------------------------------------------

// called from commandrouter to find the language file
contemporaryAdvanced.prototype.getI18nFile = function (langCode) {
  const i18nFiles = fs.readdirSync(path.join(__dirname, 'i18n'));
  const langFile = 'strings_' + langCode + '.json';

  // check for i18n file fitting the system language
  if (i18nFiles.some(function (i18nFile) { return i18nFile === langFile; })) {
    return path.join(__dirname, 'i18n', langFile);
  }
  // return default i18n file
  return path.join(__dirname, 'i18n', 'strings_en.json');
};

contemporaryAdvanced.prototype.getConfigParam = function (key) {
  var self = this;
  return self.config.get(key);
};

contemporaryAdvanced.prototype.setConfigParam = function (data) {
  var self = this;
  self.config.set(data.key, data.value);
};

contemporaryAdvanced.prototype.IfBuster = function () {
	var self = this; 
    return self.commandRouter.executeOnPlugin('system_controller', 'system', 'getConfigParam', 'system_version') < 3.0 ? false : true;
};

// ----------------------------------------------------  
contemporaryAdvanced.prototype.setUIConfig = function(data) {
	var self = this;
	//Perform your installation tasks here
};

contemporaryAdvanced.prototype.getConf = function(varName) {
	var self = this;
	//Perform your installation tasks here
};

contemporaryAdvanced.prototype.setConf = function(varName, varValue) {
	var self = this;
	//Perform your installation tasks here
};