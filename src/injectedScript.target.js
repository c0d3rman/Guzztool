/* This script is injected into the page by contentScript.js and can access page variables. */

import { RoomListener } from '@guzztool/util/RoomListener';
import log from '@guzztool/util/log';
import * as messaging from "webext-bridge/window";

// Polyfill
if (!globalThis.URLPattern) require("urlpattern-polyfill");


try {
    messaging.setNamespace("guzztool");

    // Dynamically import all subtools
    const options = await messaging.sendMessage("getOptions", {}, "content-script");
    const subtools = Object.values(SUBTOOLS).map((manifest) => {
        try { // Inner guard so one subtool crashing doesn't affect the others
            if (manifest.id === "_guzztool") return;
            if (!options[manifest.id]?.enabled) return;
            if (!manifest.matches.some(match => new URLPattern(match).test(window.location))) return;

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
} catch (e) {
    log.error(e);
}
