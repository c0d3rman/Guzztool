/* This is the content script that will be injected into the page.
Its main role is to create a <script> element in the page that will load injectedScript.js, so that it can access page variables. */

import { browser } from '@guzztool/util/util.js';
import log from '@guzztool/util/log.js';


// postMessage wrapper for logging
const postMessage = (...args) => {
    log.debug("Content script posting message:", ...args);
    window.postMessage(...args);
}

window.addEventListener("message", async (event) => {
    if (!(event.source == window &&
        event.data &&
        event.data.target == "guzztool-content-script")) return;

    log.debug("Content script received message: ", event.data);
    if (event.data.message === "getOptions") {
        const data = await browser.storage.sync.get('options');

        postMessage({
            target: "guzztool-injected-script",
            message: data.options,
            id: event.data.id
        });
    }
});


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
