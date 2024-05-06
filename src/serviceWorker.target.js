import { browser, nested_assign } from '@guzztool/util/util';
import { getStorageData, setStorageData } from '@guzztool/util/storage';
import Messaging from '@guzztool/util/messaging';
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
// if (BUILD_TARGET == 'chrome') {
//     await browser.offscreen?.createDocument({
//         url: '/offscreen.html',
//         reasons: [browser.offscreen.Reason.DOM_PARSER],
//         justification: 'Parse DOM'
//     }).then(() => { log.info("Created offscreen document."); });
// } else if (BUILD_TARGET == 'firefox') {
//     // TBD access DOMParser directly
// }

const messaging = new Messaging('background');

// Fetch a page for someone, which lets us bypass CORS issues.
// Requires the correct "host_permissions" in manifest.json
messaging.onMessage("fetch", async (message) => {
    const response = await fetch(message.content.url);
    let result;
    switch (message.content.mode) {
        case 'json':
            result = await response.json();
            break;
        case 'text':
        default:
            result = await response.text();
    }
    messaging.postMessage({ replyTo: message, content: { result } });
});
