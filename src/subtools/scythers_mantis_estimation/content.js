import browser from 'webextension-polyfill';

const subtool = {
    init: function () {
        // Listen for messages from the injected script to get asset URLs
        this.messaging.onMessage("get_file_url", (message) => {
            return browser.runtime.getURL(`subtools/${this.manifest.id}/${message.data.file_path}`);
        });
    }
}

export default subtool; 