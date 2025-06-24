/* This script is injected into the page by contentScript.js and can access page variables. */

import { RoomListener } from '@guzztool/util/RoomListener';
import { FunctionListenerProxy } from '@guzztool/util/ListenerProxy';
import log from '@guzztool/util/log';
import * as messaging from "webext-bridge/window";
import {doesUrlMatchPatterns, assertValidPattern} from 'webext-patterns';


try {
    messaging.setNamespace("guzztool");

    // Dynamically import all subtools
    const options = await messaging.sendMessage("getOptions", {}, "content-script");
    const subtools = Object.values(SUBTOOLS).map((manifest) => {
        try { // Inner guard so one subtool crashing doesn't affect the others
            if (manifest.id === "_guzztool") return;
            if (!options[manifest.id]?.enabled) return;
            manifest.matches.forEach(assertValidPattern);
            if (!doesUrlMatchPatterns(window.location, ...manifest.matches)) return;

            const subtool = require(`@guzztool/subtools/${manifest.id}/inject.js`).default;
            subtool.manifest = manifest;
            subtool.options = options[manifest.id].subtool_settings;
            subtool.log = log.getLogger(manifest.id);
            subtool.messaging = messaging;
            return subtool;
        } catch (e) {
            if (e.code === 'MODULE_NOT_FOUND') return; // Subtool doesn't have an inject.js
            log.error(e);
        }
    }).filter(subtool => typeof subtool !== 'undefined');


    let roomListener = null;
    if (typeof app !== 'undefined') { // Won't exist on the replay page
        roomListener = new RoomListener(app);
        log.debug("RoomListener constructed");
    }

    (async () => {
        try {
            // Call all subtools
            for (const subtool of subtools) {
                try { // Inner guard so one subtool crashing doesn't affect the others
                    subtool.log.info("Loading inject.js");
                    subtool.roomListener = roomListener;
                    await subtool.init();
                } catch (e) {
                    subtool.log.error(e);
                }
            }

            // Init the room listener if it exists
            roomListener?.initialize();
        } catch (e) {
            log.error(e);
        }
    })();

    // Proxy OptionsPopup.prototype.update to add Guzztool settings button
    const optionsUpdateProxy = new FunctionListenerProxy(
        OptionsPopup.prototype.update,
        (originalFn, ...args) => {
            const result = originalFn(...args);
            
            // Add Guzztool settings button before the avatars button
            const avatarsButton = document.querySelector('button[name="avatars"]');
            if (avatarsButton && !document.querySelector('button[name="guzztoolsettings"]')) {
                const guzztoolButton = document.createElement('button');
                guzztoolButton.name = 'guzztoolsettings';
                guzztoolButton.className = 'button';
                guzztoolButton.innerHTML = '<i class="fa fa-cog"></i> Guzztool settings';
                
                // Create a p element to wrap the button (matching the HTML structure)
                const buttonParagraph = document.createElement('p');
                buttonParagraph.appendChild(guzztoolButton);
                
                // Insert before the avatars button's parent p element
                const avatarsParagraph = avatarsButton.parentNode;
                avatarsParagraph.parentNode.insertBefore(buttonParagraph, avatarsParagraph);
                
                // Add click handler to open options page
                guzztoolButton.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    try {
                        await messaging.sendMessage("openOptionsPage", {}, "background");
                    } catch (e) {
                        console.error('Failed to open Guzztool settings:', e);
                    }
                });
            }
            
            return result;
        }
    );
    OptionsPopup.prototype.update = optionsUpdateProxy.proxy;
} catch (e) {
    log.error(e);
}
