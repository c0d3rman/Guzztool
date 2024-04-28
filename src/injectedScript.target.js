/* This script is injected into the page by contentScript.js and can access page variables. */

import { RoomListener } from '@guzztool/util/RoomListener.js';
import log from '@guzztool/util/log.js';


// postMessage wrapper for logging
const postMessage = (...args) => {
    log.debug("Injected script posting message:", ...args);
    window.postMessage(...args);
}

// Helper function to send a message and wait for a response
const sendMessageAndWaitForResponse = async (message, target = "guzztool-content-script", timeout = 5000) => {
    const id = crypto.randomUUID();
    postMessage({
        target: target,
        message: message,
        id
    });
    return new Promise((resolve, reject) => {
        const listener = (event) => {
            if (event.data && event.data.target === "guzztool-injected-script" && event.data.id === id) {
                log.debug("Injected script received message:", event.data);
                window.removeEventListener("message", listener);
                resolve(event.data.message);
            }
        };
        window.addEventListener("message", listener);
        setTimeout(() => {
            window.removeEventListener("message", listener);
            const error = new Error(`Guzztool injected script timed out while waiting for reply to message ${id}`);
            log.error(error);
            reject(error);
        }, timeout);
    });
}

// Dynamically import all subtools
const subtoolsContext = require.context('./subtools', true, /\.\/[^/]+\/main\.js$/);
const options = (await sendMessageAndWaitForResponse("getOptions"));
let subtools = subtoolsContext.keys()
    .reduce((list, subtoolPath) => {
        const id = subtoolPath.split('/')[1]; // './[subtool id]/main.js' => '[subtool id]'
        if (options[id].enabled) { // Filter out disabled subtools
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

// Call all subtools
for (const subtool of subtools) {
    subtool.roomListener = roomListener;
    subtool.init();
    subtool.log.info("Loaded");
}

// Init the room listener if it exists
roomListener?.initialize();
