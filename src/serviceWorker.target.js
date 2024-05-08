import { nested_assign } from '@guzztool/util/util';
import { getStorageData, setStorageData } from '@guzztool/util/storage';
import log, { setLogLevel } from '@guzztool/util/log';
import browser from 'webextension-polyfill';
import * as messaging from "webext-bridge/background";


try {
    browser.runtime.onInstalled.addListener(async () => {
        // Initialize storage on installation.
        const currentStorageData = await getStorageData();

        if (!currentStorageData.options) currentStorageData.options = {};
        currentStorageData.options = nested_assign(Object.values(SUBTOOLS).reduce((d, subtool) => {
            d[subtool.id] = {
                enabled: false,
                subtool_settings: subtool.settings?.reduce((d, setting) => {
                    d[setting.id] = setting.default;
                    return d;
                }, {}) ?? {},
            };
            return d;
        }, {}), currentStorageData.options);

        // Set a first-time install flag so the options page knows to display the intro modal.
        currentStorageData.firstTimeInstall = true;

        await setStorageData(currentStorageData);
        log.info("Initialized default settings.");

        // Open the options page to let user turn on the subtools they want.
        await browser.runtime.openOptionsPage();
    });

    // Fetch a page for someone, which lets us bypass CORS issues.
    // Requires the correct "host_permissions" in manifest.json
    messaging.onMessage("fetch", async (message) => {
        const response = await fetch(message.data.url);
        switch (message.data.mode) {
            case 'json':
                return await response.json();
            case 'text':
            default:
                return await response.text();
        }
    });


    // Debug mode
    browser.storage.sync.onChanged.addListener((changes) => {
        if (changes.options &&
            changes.options.newValue._guzztool.subtool_settings.debug != changes.options.oldValue._guzztool.subtool_settings.debug) {
            log.info(`Debug mode ${changes.options.newValue._guzztool.subtool_settings.debug ? 'enabled' : 'disabled'}`);
            setLogLevel(changes.options.newValue._guzztool.subtool_settings.debug || __DEV__);
        }
    });
} catch (e) {
    log.error(e);
}
