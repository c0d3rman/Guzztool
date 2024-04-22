/* This script is injected into the page by contentScript.js and can access page variables. */


import { RoomListener } from './util/RoomListener.js';
import zoruas_spoilerguard from './subtools/zoruas_spoilerguard/main.js';
import togepis_lucky_button from './subtools/togepis_lucky_button/main.js';

const subtools = [zoruas_spoilerguard, togepis_lucky_button];

// eslint-disable-next-line no-undef
const roomListener = new RoomListener(app);
for (const subtool of subtools) {
    subtool.init({ roomListener });
}
roomListener.initialize();
