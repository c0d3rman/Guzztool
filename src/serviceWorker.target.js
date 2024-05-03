import { browser } from '@guzztool/util/util.js';
import { getStorageData, setStorageData } from '@guzztool/util/storage.js';
import log from '@guzztool/util/log.js';


// Initialize storage on installation.
browser.runtime.onInstalled.addListener(async () => {
    const currentStorageData = await getStorageData();

    if (!currentStorageData.options) currentStorageData.options = {};
    currentStorageData.options = Object.assign({}, SUBTOOLS.reduce((d, subtool) => {
        d[subtool.id] = {
            enabled: false,
        };
        return d;
    }, {}), currentStorageData.options);

    await setStorageData(currentStorageData);
    log.info("Initialized default settings.");
});

// Create an offscreen document - an invisible page that gives us access to a DOMParser.
if (BUILD_TARGET == 'chrome') {
    await browser.offscreen?.createDocument({
        url: '/offscreen.html',
        reasons: [browser.offscreen.Reason.DOM_PARSER],
        justification: 'Parse DOM'
    }).then(() => { log.info("Created offscreen document."); });
} else if (BUILD_TARGET == 'firefox') {
    // TBD access DOMParser directly
}


// Listen for messages from other parts of the extension.
const handleMessage = async (request, sender, sendResponse) => {
    if (request.target != 'service-worker') return false;

    log.info("Received message:", request);
    sendResponse = (...args) => {
        log.info("Sending response:", ...args);
        sendResponse(...args);
    }

    // Fetch a page for someone, which lets us bypass CORS issues.
    // Requires the correct "host_permissions" in manifest.json
    if (request.type === 'fetch') {
        const response = await fetch(request.data.url);
        let result;
        switch (request.data.mode) {
            case 'json':
                result = await response.json();
                break;
            case 'text':
            default:
                result = await response.text();
        }
        sendResponse({ fetched: result });
    }
}
browser.runtime.onMessage.addListener(handleMessage);
browser.runtime.onMessageExternal.addListener(handleMessage);
