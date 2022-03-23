/// <reference path="node_modules/iina-plugin-definition/iina/index.d.ts" />

const { core, console, event, mpv, http, menu, overlay, preferences, utils, file } = iina;
const item = menu.item("Danmaku");
const instanceID = (Math.random() + 1).toString(36).substring(3);

let iinaPlusArgsKey = 'iinaPlusArgs=';
var danmakuOpts;
var optsParsed = false;

var danmakuWebLoaded = false;
var overlayShowing = false;
var mpvPaused = false;
var danmakuWebInited = false;

var isLiving = false;

let defaultPreferences = {
    dmOpacity: 1,
    dmSpeed: 680,
    dmFont: 'PingFang SC',
    enableIINAPLUSOptsParse: 0
};

function print(str) {
    console.log('[' + instanceID + '] ' + str);
};

function showOverlay(osc=true) {
    print('showOverlay');
    overlay.show();
    if (osc) {
        core.osd("Show Danmaku.");
    };
    overlayShowing = true;
    setObserver(true);
};

function hideOverlay(osc=true) {
    print('hideOverlay');
    overlay.hide();
    if (osc) {
        core.osd("Hide Danmaku.");
    };
    overlayShowing = false;
    setObserver(false);
};

function loadXMLFile(path) {
    print('loadXMLFile.' + 'path: ' + path);
    loadDanmaku();
    const content = iina.file.read(path);
    return stringToHex(content);
};

function stringToHex(str) {
    return Array.from(str).map(c => 
        c.charCodeAt(0) < 128 ? c.charCodeAt(0).toString(16).padStart(2, '0') :
        encodeURIComponent(c).replace(/\%/g,'').toLowerCase()
      ).join('');
};

function hexToString(hex) {
    return decodeURIComponent('%' + hex.match(/.{1,2}/g).join('%'));
};

function removeOpts() {
    print('remove parsed script-opts');
    var v = mpv.getString('script-opts').split(',').filter(o => !o.startsWith(iinaPlusArgsKey)).join(',');
    mpv.set('script-opts', v);
};

function parseOpts() {
    if (optsParsed) {
        removeOpts();
        return;
    };

    let scriptOpts = mpv.getString('script-opts').split(',');

    
    let iinaPlusValue = scriptOpts.find(s => s.startsWith(iinaPlusArgsKey));
    if (iinaPlusValue) {
        optsParsed = true;

        let opts = JSON.parse(hexToString(iinaPlusValue.substring(iinaPlusArgsKey.length)));
        print('iina plus opts: '  + JSON.stringify(opts));

        if (opts.hasOwnProperty('mpvArgs')) {
            mpv.command('loadfile', opts.mpvArgs);
        };

        if (opts.hasOwnProperty('xmlPath') || (opts.hasOwnProperty('port') && opts.hasOwnProperty('uuid'))) {
            danmakuOpts = opts;
            loadDanmaku();
        };
    };
};

function initMenuItems() {
    menu.removeAllItems();
    menu.addItem(danmakuMenuItem);

    const qualityItem = menu.item("Qualitys");
    iinaPlusOpts.qualitys.forEach((element, index) => {
        qualityItem.addSubMenuItem(menu.item(element, () => {
            requestNewUrl(element, iinaPlusOpts.currentLine)
        }, {
            selected: index == iinaPlusOpts.currentQuality
        }));
    });
    menu.addItem(qualityItem);

    const lineItem = menu.item("Lines");
    iinaPlusOpts.lines.forEach((element, index) => {
        lineItem.addSubMenuItem(menu.item(element, () => {
            requestNewUrl(iinaPlusOpts.qualitys[iinaPlusOpts.currentQuality], index)
        }, {
            selected: index == iinaPlusOpts.currentLine
        }));
    });
    menu.addItem(lineItem);
};

function requestNewUrl(quality, line) {
    print(quality + line);

    let u = 'http://127.0.0.1:'+iinaPlusOpts.port+'/video';
    let pars = {'url': iinaPlusOpts.rawUrl, 'key': quality, 'pluginAPI': '1'};

    iina.http.get(u, {params: pars}).then((response) => {
        let re = JSON.parse(hexToString(response.text));
        let urls = re.urls;
        var url;
        if (line >= urls.length) {
            line = 0;
        };

        url = urls[line];

        iinaPlusOpts.qualitys = re.qualitys;
        iinaPlusOpts.currentQuality = re.qualitys.indexOf(quality);
        iinaPlusOpts.lines = re.lines;
        iinaPlusOpts.currentLine = line

        mpv.command('loadfile', [url, 'replace', re.mpvScript]);
        initMenuItems();
    }).catch((response) => {
        console.log(response)
    })
};

// Init MainMenu Item.
item.addSubMenuItem(menu.item("Select Danmaku File...", async () => {
    let path = await iina.utils.chooseFile('Select Danmaku File...', {'chooseDir': false, 'allowedFileTypes': ['xml']});
    danmakuOpts = {'xmlPath': path};
    loadDanmaku();
}));

item.addSubMenuItem(menu.separator());

item.addSubMenuItem(menu.item("Show / Hide Danmaku", () => {
    overlayShowing ? hideOverlay() : showOverlay();
}));

menu.addItem(item);

function loadDanmaku() {
    if (!danmakuWebLoaded) {
        print('loadDanmaku');
        overlay.loadFile("DanmakuWeb/index.htm");
        danmakuWebLoaded = true;
    };
};

function unloadDanmaku() {
    if (danmakuWebLoaded) {
        print('unloadDanmaku');
        overlay.simpleMode();
        danmakuWebLoaded = false;
    };
};

function initDanmakuWeb() {
    if (!danmakuOpts) {
        return;
    };

    if (danmakuOpts.hasOwnProperty('xmlPath')) {
        isLiving = false;
        danmakuOpts.xmlContent = loadXMLFile(danmakuOpts.xmlPath);
    } else {
        isLiving = true;
    };

    danmakuOpts.dmOpacity = iina.preferences.get('dmOpacity') ?? defaultPreferences.dmOpacity;
    danmakuOpts.dmSpeed = iina.preferences.get('dmSpeed') ?? defaultPreferences.dmSpeed;
    danmakuOpts.dmFont = iina.preferences.get('dmFont') ?? defaultPreferences.dmFont;

    var blockList = [];
    if ((iina.preferences.get('blockTypeScroll') ?? 0) == 1) {
        blockList.push('Scroll');
    };
    if ((iina.preferences.get('blockTypeTop') ?? 0) == 1) {
        blockList.push('Top');
    };
    if ((iina.preferences.get('blockTypeButtom') ?? 0) == 1) {
        blockList.push('Bottom');
    };
    if ((iina.preferences.get('blockTypeColor') ?? 0) == 1) {
        blockList.push('Color');
    };
    if ((iina.preferences.get('blockTypeAdvanced') ?? 0) == 1) {
        blockList.push('Advanced');
    };
    danmakuOpts.blockType = blockList.join(',');

    danmakuOpts.mpvArgs = undefined;
    danmakuOpts.xmlPath = undefined;

    if (danmakuOpts.hasOwnProperty('xmlPath') || (danmakuOpts.hasOwnProperty('port') && danmakuOpts.hasOwnProperty('uuid'))) {
        print('initDM.');
        showOverlay(false);
        overlay.postMessage("initDM", danmakuOpts);
        danmakuWebInited = true;
    };

    setObserver(true);
    danmakuOpts = undefined;
};

iina.event.on("iina.plugin-overlay-loaded", () => {
    print('iina.plugin-overlay-loaded');
    initDanmakuWeb();
});

iina.event.on("iina.window-will-close", () => {
    print('iina.window-will-close');
    danmakuOpts = undefined;
    optsParsed = false;
    removeOpts();
    unloadDanmaku();
    isLiving = false;
    overlayShowing = false;
    mpvPaused = false;
    danmakuWebInited = false;
});

iina.event.on("iina.pip.changed", (pip) => {
    console.log("PIP: " + pip);
});


iina.event.on("iina.file-started", () => {
    print('iina.file-started');

    let e = iina.preferences.get('enableIINAPLUSOptsParse') ?? defaultPreferences.enableIINAPLUSOptsParse;
    if (e == 0) {
        print('Ignore IINA+ Opts Parse')
        return;
    }
    parseOpts();
});

iina.event.on("mpv.pause.changed", (isPaused) => {
    overlay.postMessage("pauseChanged", {'isPaused': isPaused});
    mpvPaused = isPaused;
    setObserver(!isPaused);
});


var windowScaleListenerID, timePosListenerID;

function setObserver(start) {
    let timePosKey = "mpv.time-pos.changed";
    let windowScaleKey = "mpv.window-scale.changed";

    function stop() {
        if (timePosListenerID) {
            iina.event.off(timePosKey, timePosListenerID);
            timePosListenerID = undefined;
        };
        if (windowScaleListenerID) {
            iina.event.off(windowScaleKey, windowScaleListenerID);
            windowScaleListenerID = undefined;
        };
    };

    if (start && !mpvPaused && danmakuWebLoaded && danmakuWebInited && overlayShowing) {
        print('Start Observers.');
        stop();
        if (!isLiving) {
            timePosListenerID = iina.event.on(timePosKey, (t) => {
                overlay.postMessage("timeChanged", {'time': t});
            });
        };
        windowScaleListenerID = iina.event.on(windowScaleKey, () => {
            overlay.postMessage("resizeWindow", {});
        });
        initObserverValues();
    } else if (!start && (mpvPaused || !danmakuWebLoaded || !overlayShowing)) {
        print('Stop Observers.');
        stop();
    };
};

function initObserverValues() {
    print('init Observers.');
    let t = mpv.getNumber('time-pos');
    overlay.postMessage("timeChanged", {'time': t});
    overlay.postMessage("resizeWindow", {});
};