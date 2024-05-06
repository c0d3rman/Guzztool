/* This is the content script that will be injected into the page.
Its main role is to create a <script> element in the page that will load injectedScript.js, so that it can access page variables. */

import { browser } from '@guzztool/util/util';
import log from '@guzztool/util/log';
import Messaging from '@guzztool/util/messaging';

// Polyfill
if (!globalThis.URLPattern) require("urlpattern-polyfill");


try {
    const messaging = new Messaging('content-script');

    // Fetch options and pass them to the injected script
    const options = (await browser.storage.sync.get('options')).options;
    log.debug("Options:", options);
    messaging.onMessage("getOptions", async (message) => {
        messaging.postMessage({ replyTo: message, content: options });
    });

    // Dynamically import all subtools
    const subtools = Object.values(SUBTOOLS).map((manifest) => {
        try { // Inner guard so one subtool crashing doesn't affect the others
            if (manifest.id === "_guzztool") return;
            if (!options[manifest.id]?.enabled) return;
            if (!manifest.matches.some(match => new URLPattern(match).test(window.location))) return;

            const subtool = require(`@guzztool/subtools/${manifest.id}/content.js`).default;
            subtool.manifest = manifest;
            subtool.options = options[manifest.id].subtool_settings;
            subtool.log = log.getLogger(manifest.id);
            subtool.messaging = messaging.getContext(manifest.id);
            return subtool;
        } catch (e) {
            if (e.code === 'MODULE_NOT_FOUND') return; // Subtool doesn't have a content.js
            log.error(e, "\nManifest:", manifest);
        }
    }).filter(subtool => typeof subtool !== 'undefined');

    // Run all subtool content scripts
    for (const subtool of subtools) {
        try { // Inner guard so one subtool crashing doesn't affect the others
            subtool.log.info("Loading content.js");
            await subtool.init();
        } catch (e) {
            subtool.log.error(e);
        }
    }


    // Components to inject into the page
    const injectables = [
        {
            id: 'guzztool-script-main',
            component: 'script',
            into: 'body',
            props: {
                src: browser.runtime.getURL('injectedScript.js'),
                async: true,
            },
        }
    ];

    // Inject the above components
    injectables.forEach(({ id, component, into, props }) => {
        const source = document.getElementById(id) || document.createElement(component);
        const destination = into === 'head' ? document.head : document.body;
        if (source.id !== id) source.id = id;
        Object.entries(props).forEach(([key, value]) => { if (value !== undefined) source.setAttribute(key, value); });
        destination.appendChild(source);
        log.debug("Injected ", id);
    });
} catch (e) {
    log.error(e);
}
