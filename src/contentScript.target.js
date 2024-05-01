/* This is the content script that will be injected into the page.
Its main role is to create a <script> element in the page that will load injectedScript.js, so that it can access page variables. */

import { browser } from '@guzztool/util/util.js';
import log from '@guzztool/util/log.js';
import Messaging from '@guzztool/util/messaging.js';


const messaging = new Messaging('content-script');


messaging.onMessage("getOptions", async (message) => {
    const data = await browser.storage.sync.get('options');
    messaging.postMessage({ replyTo: message, content: data.options });
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
