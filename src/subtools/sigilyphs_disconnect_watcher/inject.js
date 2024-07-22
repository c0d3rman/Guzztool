import { FunctionListenerProxy } from '@guzztool/util/ListenerProxy.js';

const subtool = {
    init: function () {
        app.on("loggedin", () => {
            try {
                this.log.info(`Login detected, setting up disconnect watcher.`);
                clearInterval(this.interval); // In case this is our second login

                this.receivedPong = true; // Set to false when sending a ping and back to true when receiving a pong

                // Intercept incoming PMs to receive pongs (and prevent them from displaying)
                this.addPMProxy = new FunctionListenerProxy(app.rooms[""].addPM, (originalFn, ...args) => {
                    try {
                        const sender = toID(args[0]);
                        const receiver = toID(args[2]);
                        const me = app.user.get("userid");
                        const message = args[1];

                        if (sender == me && receiver == me && message == "GUZZTOOL_SIGILYPH_PING") {
                            this.receivedPong = true;
                            this.log.debug("Received pong.");
                            return;
                        }

                        originalFn(...args);
                    } catch (e) { this.log.error(e) };
                });
                app.rooms[""].addPM = this.addPMProxy.proxy;

                // Send a ping every so often (and check if we received a pong since the last one)
                this.interval = setInterval(() => {
                    try {
                        if (!this.receivedPong) {
                            this.log.warn("Disconnected from server.");
                            app.addPopupMessage("Sigilyph says: Disconnected from server. Please refresh the page.");
                            clearInterval(this.interval);
                        } else {
                            this.receivedPong = false;
                            app.rooms[''].send(`/pm ${app.user.get("userid")}, GUZZTOOL_SIGILYPH_PING`);
                            this.log.debug("Sent ping.");
                        }
                    } catch (e) { this.log.error(e) };
                }, this.options.pollingInterval * 1000);

                // Intercept logouts so we can stop the disconnect watcher
                this.logoutProxy = new FunctionListenerProxy(app.user.logout, (originalFn, ...args) => {
                    try {
                        this.log.debug("Logout detected, stopping disconnect watcher.");
                        clearInterval(this.interval);
                        originalFn(...args);
                    } catch (e) { this.log.error(e) };
                });
                app.user.logout = this.logoutProxy.proxy;
            } catch (e) { this.log.error(e) };
        }, this);
    }
}

export default subtool;