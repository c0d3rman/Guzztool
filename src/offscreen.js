/* This script is run in an offscreen document.
It is used by the service worker in order to get access to a DOMParser. */


import { browser } from './util/util.js';


const handleMessage = async (request, sender, sendResponse) => {
    if (request.target !== 'offscreen') return false;

    if (request.type === 'get-newest-smogon-stats-folder') {
        // Get the last <a> tag's link path, which is the most recent folder of stats
        const doc = (new DOMParser()).parseFromString(request.data.html, 'text/html');
        const link = doc.querySelector('a:last-of-type');
        sendResponse({ path: link.pathname });
    }
}
browser.runtime.onMessage.addListener(handleMessage);
browser.runtime.onMessageExternal.addListener(handleMessage);
