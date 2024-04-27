/* This script is injected into the page by contentScript.js and can access page variables. */

import { RoomListener } from '@guzztool/util/RoomListener.js';


// Helper function to send a message to the content script and wait for a response
const sendMessageAndWaitForResponse = async (message, timeout = 5000) => {
    const id = crypto.randomUUID();
    window.postMessage({
        target: "guzztool-content-script",
        message: message,
        id
    });
    return new Promise((resolve, reject) => {
        const listener = (event) => {
            if (event.data && event.data.target === "guzztool-injected-script" && event.data.id === id) {
                window.removeEventListener("message", listener);
                resolve(event.data.message);
            }
        };
        window.addEventListener("message", listener);
        setTimeout(() => {
            window.removeEventListener("message", listener);
            reject(new Error('Guzztool message timeout'));
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
            list.push(subtool);
        }
        return list;
    }, []);
console.log(subtools);


// Build up a guzztool object with things for subtools to use
const guzztool = {};
guzztool.log = (...args) => {
    console.log(`GUZZTOOL |`, ...args); // TODO logger doesn't properly detect subtool, use a better system
}
if (typeof app !== 'undefined') { // Won't exist on the replay page
    guzztool.roomListener = new RoomListener(app);
}

// Call all subtools
for (const subtool of subtools) {
    subtool.init(guzztool);
}

// Init the room listener if it exists
guzztool.roomListener?.initialize();
