/* This script is injected into the page by contentScript.js and can access page variables. */

import { RoomListener } from '@guzztool/util/RoomListener.js';
import log from '@guzztool/util/log.js';
import Messaging from '@guzztool/util/messaging.js';

try {
    const messaging = new Messaging('injected-script');

    // Dynamically import all subtools
    const subtoolsContext = require.context('./subtools', true, /\.\/[^/]+\/main\.js$/);
    const options = (await messaging.postMessage({ type: "getOptions", context: null, awaitReply: true })).content;
    log.debug("Options:", options);
    let subtools = subtoolsContext.keys()
        .reduce((list, subtoolPath) => {
            const id = subtoolPath.split('/')[1]; // './[subtool id]/main.js' => '[subtool id]'
            if (options[id]?.enabled) { // Filter out disabled subtools
                const subtool = subtoolsContext(subtoolPath).default;
                subtool.manifest = SUBTOOLS.find(s => s.id === id);
                subtool.options = options[id];
                subtool.log = log.getLogger(subtool.manifest.id);
                list.push(subtool);
            }
            return list;
        }, []);


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
                    if (!subtool.manifest.matches.some(match => new URLPattern(match).test(window.location))) continue;
                    subtool.roomListener = roomListener;
                    await subtool.init();
                    subtool.log.info("Loaded");
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
