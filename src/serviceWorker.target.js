import { browser } from '@guzztool/util/util.js';
import { initializeStorageWithDefaults } from '@guzztool/util/storage.js';


// Initialize storage on installation.
browser.runtime.onInstalled.addListener(async () => {
    await initializeStorageWithDefaults({
        options: SUBTOOLS.reduce((d, subtool) => {
            d[subtool.id] = {
                enabled: true,
            };
            return d;
        }, {}),
    });
    console.log("Initialized default settings.");
});

// Create an offscreen document - an invisible page that gives us access to a DOMParser.
await browser.offscreen.createDocument({
    url: '/offscreen.html',
    reasons: [browser.offscreen.Reason.DOM_PARSER],
    justification: 'Parse DOM'
});


// Listen for messages from other parts of the extension.
const handleMessage = async (request, sender, sendResponse) => {
    if (request.target != 'service-worker') return false;

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
