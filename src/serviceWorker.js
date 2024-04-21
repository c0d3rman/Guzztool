import { browser } from './util/util.js';
import { initializeStorageWithDefaults } from './storage.ts';


// Create an offscreen document - an invisible page that gives us access to a DOMParser.
await chrome.offscreen.createDocument({
    url: '/offscreen.html',
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Parse DOM'
});


// Initialize storage on installation.
chrome.runtime.onInstalled.addListener(async () => {
    await initializeStorageWithDefaults({});
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
            // eslint-disable-next-line no-fallthrough
            case 'text':
            default:
                result = await response.text();
        }
        sendResponse({ fetched: result });
    }
}
browser.runtime.onMessage.addListener(handleMessage);
browser.runtime.onMessageExternal.addListener(handleMessage);
