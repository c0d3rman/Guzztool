import { browser, nested_assign } from '@guzztool/util/util';
import { getStorageData, setStorageData } from '@guzztool/util/storage';
import log from '@guzztool/util/log';


browser.runtime.onInstalled.addListener(async () => {
    // Initialize storage on installation.
    const currentStorageData = await getStorageData();

    if (!currentStorageData.options) currentStorageData.options = {};
    currentStorageData.options = nested_assign(Object.values(SUBTOOLS).reduce((d, subtool) => {
        d[subtool.id] = {
            enabled: false,
            subtool_settings: subtool.settings?.reduce((d, setting) => {
                d[setting.id] = setting.default;
                return d;
            }, {}) ?? {},
        };
        return d;
    }, {}), currentStorageData.options);

    // Set a first-time install flag so the options page knows to display the intro modal.
    currentStorageData.firstTimeInstall = true;

    await setStorageData(currentStorageData);
    log.info("Initialized default settings.");

    // Open the options page to let user turn on the subtools they want.
    await browser.runtime.openOptionsPage();
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
