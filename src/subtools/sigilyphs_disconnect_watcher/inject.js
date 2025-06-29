import { FunctionListenerProxy } from '@guzztool/util/ListenerProxy.js';

const subtool = {
    init: function () {
        // Intercept all incoming messages to check if we are alive
        this.receiveProxy = new FunctionListenerProxy(app.receive, (originalFn, ...args) => {
            try {
                this.registerPong();
                originalFn(...args);
            } catch (e) { this.log.error(e) };
        });
        app.receive = this.receiveProxy.proxy;

        // Set up PM interception to prevent pongs from displaying
        this.addPMProxy = new FunctionListenerProxy(app.rooms[""].addPM, (originalFn, ...args) => {
            try {
                const sender = toID(args[0]);
                const receiver = toID(args[2]);
                const me = app.user.get("userid");
                const message = args[1];

                if (sender == me && receiver == me && message == "GUZZTOOL_SIGILYPH_PING") {
                    this.log.debug("Received pong.");
                    // Pong will be registered by update()
                    return;
                }

                originalFn(...args);
            } catch (e) { this.log.error(e) };
        });
        app.rooms[""].addPM = this.addPMProxy.proxy;

        // Intercept logouts so we can stop the disconnect watcher
        this.logoutProxy = new FunctionListenerProxy(app.user.logout, (originalFn, ...args) => {
            try {
                this.log.debug("Logout detected, stopping disconnect watcher.");
                this.stopDisconnectWatcher();
                originalFn(...args);
            } catch (e) { this.log.error(e) };
        });
        app.user.logout = this.logoutProxy.proxy;

        // Check if already logged in and start watcher if so
        if (app.user.attributes.named) {
            this.log.info(`Already logged in, setting up disconnect watcher.`);
            this.startDisconnectWatcher();
        }

        // Listen for login events
        app.on("loggedin", () => {
            try {
                this.log.info(`Login detected, setting up disconnect watcher.`);
                this.startDisconnectWatcher();
            } catch (e) { this.log.error(e) };
        }, this);
    },

    startDisconnectWatcher: function () {
        this.pingSent = false;
        this.listenForPong();
    },

    stopDisconnectWatcher: function () {
        clearTimeout(this.timeout);
        this.pingSent = false;
    },

    registerPong: function () {
        this.pingSent = false;
        if (app.user.attributes.named) this.listenForPong();
    },

    listenForPong: function (timeout = null) {
        timeout = timeout || this.options.pollingInterval * 1000;
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            try {
                if (!app.user.attributes.named) {
                    this.log.debug("Not logged in, stopping disconnect watcher.");
                    this.stopDisconnectWatcher();
                    return;
                }

                if (!this.pingSent) {
                    // If we haven't had any contact with the server in a while, send a ping
                    app.rooms[''].send(`/pm ${app.user.get("userid")}, GUZZTOOL_SIGILYPH_PING`);
                    this.pingSent = true;
                    this.log.debug("Sent ping.");
                    this.listenForPong(this.options.timeoutDuration * 1000);
                } else {
                    // If you sent a ping already and didn't get a pong, you are disconnected
                    this.log.warn("Disconnected from server.");
                    app.addPopupMessage("Sigilyph says: Disconnected from server. Please refresh the page.");
                }
            } catch (e) { this.log.error(e) };
        }, timeout);
    }
}

export default subtool;