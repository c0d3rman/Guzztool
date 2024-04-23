/* This script is injected into the page by contentScript.js and can access page variables. */


import { RoomListener } from './util/RoomListener.js';
import zoruas_spoilerguard from './subtools/zoruas_spoilerguard/main.js';
import togepis_lucky_button from './subtools/togepis_lucky_button/main.js';
import meowths_TTS from './subtools/meowths_TTS/main.js';

// Declare all subtools. Add new ones here
const subtools = [
    zoruas_spoilerguard,
    togepis_lucky_button,
    meowths_TTS
];

// Build up guzztool object with things for subtools to use
const guzztool = {};
guzztool.log = (...args) => {
    console.log(`GUZZTOOL | ${guzztool._currentSubtool.name} |`, ...args);
}
if (typeof app !== 'undefined') { // Won't exist on the replay page
    guzztool.roomListener = new RoomListener(app); // eslint-disable-line no-undef
}

// Call all subtools
for (const subtool of subtools) {
    guzztool._currentSubtool = subtool;
    subtool.init(guzztool);
}

// Init the room listener if it exists
guzztool.roomListener?.initialize();
