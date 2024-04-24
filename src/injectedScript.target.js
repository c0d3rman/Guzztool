/* This script is injected into the page by contentScript.js and can access page variables. */


import { RoomListener } from './util/RoomListener.js';

// Dynamically import all subtools
const subtoolsContext = require.context('./subtools', true, /\.\/[^/]+\/main\.js$/);
const subtools = subtoolsContext.keys().map(subtool => subtoolsContext(subtool).default);


// Build up a guzztool object with things for subtools to use
const guzztool = {};
guzztool.log = (...args) => {
    console.log(`GUZZTOOL | ${guzztool._currentSubtool.name} |`, ...args);
}
if (typeof app !== 'undefined') { // Won't exist on the replay page
    guzztool.roomListener = new RoomListener(app);
}

// Call all subtools
for (const subtool of subtools) {
    guzztool._currentSubtool = subtool;
    subtool.init(guzztool);
}

// Init the room listener if it exists
guzztool.roomListener?.initialize();
