/* This is the content script that will be injected into the page.
Its main role is to create a <script> element in the page that will load injectedScript.js, so that it can access page variables. */

import { browser } from './util/util.js';


// We inject the extension ID as a property so that the injected script can send us messages with the browser.runtime API
// (using runtime.id will work on Chrome, but not on Firefox since it'll return the ID defined in the manifest)
// (e.g., 'chrome-extension://dabpnahpcemkfbgfbmegmncjllieilai/contentScript.js', 'moz-extension://81b2e17b-928f-4689-a33f-501eae139258/contentScript.js')
const mainUrl = browser.runtime.getURL('contentScript.js');
const extensionId = mainUrl?.endsWith('contentScript.js')
    ? mainUrl.split('/')[2] // e.g., ['chrome-extension:', '', 'dabpnahpcemkfbgfbmegmncjllieilai', 'contentScript.js']
    : browser.runtime.id;


// Components to inject into the page
const injectables = [
    {
        id: 'guzztool-script-main',
        component: 'script',
        into: 'body',
        props: {
            src: browser.runtime.getURL('injectedScript.js'),
            async: true,
            'data-ext-id': extensionId
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
});
