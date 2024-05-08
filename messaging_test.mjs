/*
Guzztool's messaging utility.
Used for sending messages between the different parts of the extension (injected-script, content-script, background).
Use as follows:
```
import Messaging from '@guzztool/util/messaging';
const messaging = new Messaging('<source>');
const subtoolSpecific = messaging.getContext('<subtool-id>');
```
Note that for messages to go between the injected-script and background,
a Messaging object must be created in the content-script to mediate.
*/


/*
DESIGN

(injected-script <-> content-script)
- communicate via window.postMessage
- since content-script injects the injected-script, it will init first
- therefore, injected-script initiates an "I'm ready" message to content-script
    - hypothetically could add retries, but if it doesn't go through the first time it probably never will
- content-script replies with an OK
- Channel readiness:
    - From content-script side - ready once it receives the "I'm ready"
    - From injected-script side - ready once it receives the OK

(content-script <-> background)
- communicate via browser.runtime.connect
- content-script initiates the connection
- background keeps a map of connections updated, so it can initiate messages
- Channel readiness:
    - From content-script side - ready once the connection is established
    - From background side - always ready by definition (since it never initiates connections)

(injected-script <-> background)
- communicate indirectly via content-script, which can talk to both
- messages from one channel get forwarded to the other based on target
- content-script sends updates on readiness state to the two sides
    - when (content-script <-> background) is ready, content-script notifies injected-script
    - when (injected-script <-> content-script) is ready, content-script notifies background
    - we assume no disconnects - if you restart the extension or something just refresh
- Channel readiness:
    - From injected-script side - ready once (injected-script <-> content-script) is ready and has notified about background readiness
    - From background side - ready once (content-script <-> background) is ready and has notified about injected-script readiness

Does not support more than one content script or injected script per tab. (They're centralized and pass a single Messaging object around to the subtools.)
*/

/*
Generalized design:
[rename context => scope, and context now refers to which kind of place you're runnning in]

- web:
  - Can send and receive from web and contentScript on its same tab via the window
- contentScript:
  - Can send and receive from web and contentScript on its same tab via the window 
  - Can send and receive from the background via browser.runtime.connect
- other:
 - Can send and receive from the background via browser.runtime.connect
 - Could theoretically talk to each other directly via browser.runtime, but not worth the complexity
- background:
  - Can send and receive from all except web via browser.runtime.connect
  - Acts as central hub

Basically the background script is the hub, and everyone else talks through it,
except the contentScript which can talk to its associated web and mediates between it and the background.

Forwarding logic:
- If you can reach your destination directly, send to there.
    - For web<->web, web<->contentScript, and contentScript<->contentScript this involves a tabId check.
- Else if you're background sending to web, forward to the associated contentScript.
- Else if you're web sending to anyone but your contentScript, forward to your contentScript.
- Else if you can reach background, forward to background.
- Else error (should never happen)
Forwarding happens by setting the target to the forwarder and setting a "forwardTo" field with the final targets.
If a receiver sees a "forwardTo" field, they set target to it and then check whether they themselves need to forward.

Web and contentScript have an associated tabId. You can send to same tab by using "web" as the target,
to a specific tab by using "web-<id>", or to all tabs by using "web-all". (And same for contentScript.)
These are shortcuts and get expanded to lists of "web-<id>" using the readiness table; there's no in-flight tabId field.
Messaging objects are singletons, so a tab can never have more than one web or contentScript. (Otherwise we could end up in nasty race conditions and loops.)

Readiness is based on browser.runtime.connect and managed centrally by the background script.
It sends out updates on change.
Web forwards its ready notification via its content script.
A contentScript disconnecting also implicitly disconnects its associated web.

Shortcuts:
- "all" to all but yourself (the default)
- "all_including_self" to all including yourself
- "self" to yourself
- "tab" to the current tab
- "tab-<id>" to web-<id> and contentScript-<id>
These get expanded out and then the list gets deduplicated.

Allow sending to multiple scopes. Also provide a special "_all" scope which targets/listens to all scopes.

Potential future upgrades:
- Using connectExternal when available.
- Bypassing background script in places where direct connections are possible.
*/




import log from '@guzztool/util/log';
import { browser } from '@guzztool/util/util';
import { getContextName } from 'webext-detect-page'



export class WindowMessagingChannel {
    postMessage(message) {
        return window.postMessage(message);
    }

    addListener(listener) {
        window.addEventListener("message", listener);
        return listener;
    }

    removeListener(listener) {
        window.removeEventListener("message", listener);
    }
}

export class BrowserMessagingChannel {
    constructor() {
        this.listeners = {};
    }

    postMessage(message) {
        return browser.runtime.sendMessage(message);
    }

    addListener(listener) {
        const wrapper = (request, sender, sendResponse) => listener({ data: request });
        browser.runtime.onMessage.addListener(wrapper);
        this.listeners[listener] = wrapper;
        return listener;
    }

    removeListener(listener) {
        browser.runtime.onMessage.removeListener(this.listeners[listener]);
        delete this.listeners[listener];
    }
}

/**
 * The background script is weird in that it needs to receive messages via browser.runtime.onMessage
 * but send messages via browser.tabs.sendMessage.
 */
export class BackgroundMessagingChannel {
    constructor() {
        this.listeners = {};
    }

    postMessage(message) {
        if (!message[`${Messaging.PREFIX}tabId`]) throw new Error(`tabId is required to send messages via BackgroundMessagingChannel (meaning the background script can't send messages to itself)`);
        return browser.tabs.sendMessage(message[`${Messaging.PREFIX}tabId`], message);
    }

    addListener(listener) {
        const wrapper = (request, sender, sendResponse) => listener({ data: request });
        browser.runtime.onMessage.addListener(wrapper);
        this.listeners[listener] = wrapper;
        return listener;
    }

    removeListener(listener) {
        browser.runtime.onMessage.removeListener(this.listeners[listener]);
        delete this.listeners[listener];
    }
}


class Messaging {
    static PREFIX = "guzztool_";
    // REACHABLE[sender][receiver] = channel
    // means sender can reach receiver through channel.
    // If REACHABLE[sender] is undefined, use REACHABLE["other"]
    static REACHABLE = {
        "web": { "contentScript": "window" },
        "contentScript": { "web": "window", "contentScript": "window", "background": "browser" },
        "background": { "contentScript": "browser", "other": "browser" }, // For simplicity background can't talk to itself
        "other": { "background": "browser" },
    };

    /**
     * Constructs a new Messaging instance.
     */
    constructor() {
        // Singleton
        if (Messaging._instance) return Messaging._instance
        Messaging._instance = this;

        this._unwrapped = this; // For use by getContext

        // Automatically detect what source we're running in
        this.source = getContextName();
        if (this.source === 'unknown') throw new Error(`Could not detect source for messaging`);

        if (this.source === "injected-script") {
            // Injected script can only access the window channel
            const windowChannel = new WindowMessagingChannel();
            this.messagingChannels = Object.fromEntries(Messaging.TARGETS.map(target => [target, windowChannel]));
        } else if (this.source === "content-script") {
            // Content script can access both the window and browser channels (and prefers window when messaging itself)
            const windowChannel = new WindowMessagingChannel();
            const browserChannel = new BrowserMessagingChannel();
            this.messagingChannels = {
                "injected-script": windowChannel,
                "content-script": windowChannel,
                "background": browserChannel,
            };
            // Get own tabId from the background script
            this.messagingChannels["background"].postMessage({ [`${Messaging.PREFIX}type`]: "whoami" }).then(response => {
                this.tabId = response.tabId;
                log.debug(`${this.source} acquired tabId ${this.tabId} from background`);

                // Set up bridge to mediate between window and browser channels
                this._bridge();
            });
        } else if (this.source === "background") {
            // Background script can only access the browser channel
            const backgroundChannel = new BackgroundMessagingChannel();
            this.messagingChannels = Object.fromEntries(Messaging.TARGETS.map(target => [target, backgroundChannel]));
            // Set up service that lets content scripts identify their own tabId
            this._serve_whoami();
        } else {
            throw new Error(`Invalid source: ${this.source}`);
        }
    }

    /**
     * Returns a scoped version of this Messaging instance, which will only send/receive on the given scope
     * @param {string} scope - The scope to get
     * @returns {Messaging} A scoped version of this Messaging instance
     */
    getScope(scope) {
        // Create a new proxy for the current object with a new scope
        return new Proxy(this._unwrapped, {
            get(target, prop, receiver) {
                if (prop === 'scope') return scope;
                return Reflect.get(target, prop, receiver);
            }
        });
    }

    /**
     * Posts a message to the given target(s)
     * @param {object} message - The message to be posted.
     * @param {string} message.type - Type of the message. (For replies, this is automatically set to the type of the message being replied to if not provided)
     * @param {string|string[]} message.target - Target(s) to post to. If not provided, posts to all targets except the source.
     * @param {object} [message.content={}] - Content of the message
     * @param {string|null} [message.context=this.contextId] - The context to send the message to (or null for global context)
     * @param {boolean} [message.awaitReply=false] - Set to true if the message is expecting a reply (will return a promise)
     * @param {number} [message.awaitReplyTimeout=5000] - Timeout in milliseconds for the reply
     * @param {object|null} [message.replyTo=null] - If this is a reply, the message to reply to
     */
    postMessage({
        type = null,
        target = null,
        content = {},
        context = this.context,
        awaitReply = false,
        awaitReplyTimeout = 5000,
        replyTo = null,
    }) {
        let tabId = this.tabId;

        // Automatically set target for replies
        if (replyTo) {
            if (target) throw new Error(`Targets are inferred automatically for replies; do not provide a target if you're replying to a message`);
            target = [replyTo.source];
            if (!type) type = replyTo.type;
            tabId = replyTo.tabId;
            replyTo = replyTo.id;
        }

        // Validate target
        if (target === null) target = Messaging.TARGETS.filter(t => t !== this.source);
        if (!(target instanceof Array)) target = [target];
        if (target.length === 0) throw new Error(`Target cannot be empty`);
        if (!target.every(t => Messaging.TARGETS.includes(t))) throw new Error(`Invalid target(s) ${target}`);

        // Build and send message
        let message = {
            id: crypto.randomUUID(),
            type,
            content,
            source: this.source,
            target,
            context,
            replyTo,
            tabId,
        };
        const prefixed_message = Messaging._addPrefix(message); // When going over the wire, all fields are prefixed to avoid conflicts with other message senders
        const channels = [...new Set(target.map(t => this.messagingChannels[t]))];
        log.debug(`Posting ${message.replyTo ? "reply" : "message"} via [${channels.map(c => c.constructor.name).join(", ")}]`, prefixed_message);
        channels.forEach(channel => channel.postMessage(prefixed_message));

        // Listen for reply and return a promise if awaitReply is true
        if (awaitReply) {
            return new Promise((resolve, reject) => {
                let timeoutId = null;
                const listener = (event) => {
                    const data = Messaging._removePrefix(event.data);
                    if (data &&
                        data.replyTo === message.id) {
                        log.debug("Received reply:", event.data);
                        [...new Set(Object.values(this.messagingChannels))].forEach(channel => channel.removeListener(listener));
                        clearTimeout(timeoutId);
                        resolve(data);
                    }
                };
                [...new Set(Object.values(this.messagingChannels))].forEach(channel => channel.addListener(listener));
                timeoutId = setTimeout(() => {
                    [...new Set(Object.values(this.messagingChannels))].forEach(channel => channel.removeListener(listener));
                    const error = new Error(`Timed out while waiting for reply to message: ${JSON.stringify(message)}`);
                    reject(error);
                }, awaitReplyTimeout);
            });
        }
    }

    /**
     * Takes a message with a list of targets and splits it into sub-messages to be sent to different channels and/or forwarders.
     * E.g. a message with fields
     *   {source: "contentScript-123", target: ["web-123", "contentScript-123", "background", "options", "web-456"]}
     * would be split into messages with fields:
     * - {target: ["web-123", "contentScript-123"], channel: "window"}
     * - {target: ["background"], channel: "browser"}
     * - {target: ["web-456", "options"], forwarder: "background", channel: "browser"}
     * @param {object} message - The message to resolve forwarding for
     * @returns {list} A list of sub-messages to be sent
     */
    _splitMessage(message) {
        // Split targets down by forwarder.
        const forwarders = {};
        for (const target of message.target) {
            const [targetContext, targetTabId] = Messaging._split_tabId(target);
            const [sourceContext, sourceTabId] = Messaging._split_tabId(this.source);
            const forwardTo = (forwarder) => {
                if (!forwarders[forwarder]) forwarders[forwarder] = [];
                forwarders[forwarder].push(target);
            }

            // If you can reach your destination directly, send to there.
            // If both the source and the target have a tabId, they must be the same.
            // (Applies for web<->web, web<->contentScript, and contentScript<->contentScript)
            if (Messaging.REACHABLE[this.source].includes(target) && !(sourceTabId && targetTabId && targetTabId !== sourceTabId)) {
                forwardTo(null);
            }
            // For background->web, forward to the associated contentScript.
            else if (sourceContext === "background" && targetContext === "web") {
                forwardTo(`contentScript-${sourceTabId}`);
            }
            // For web->anyone but the associated contentScript, forward to the associated contentScript.
            else if (sourceContext === "web" && target !== `contentScript-${sourceTabId}`) {
                forwardTo(`contentScript-${sourceTabId}`);
            }
            // If you can reach background, forward to background.
            else if (Messaging.REACHABLE[this.source].includes("background")) {
                forwardTo("background");
            }
            // Can't reach the destination. (Should never happen.)
            else {
                throw new Error(`Could not resolve forwarding for message: ${JSON.stringify(message)}`);
            }
        }

        // Create sub-messages for each forwarder.
        const subMessages = [];
        for (const [forwarder, targets] of Object.entries(forwarders)) {
            if (forwarder) {
                subMessages.push(Object.assign({}, message, {
                    target: targets,
                    forwarder,
                    channel: Messaging.REACHABLE[this.source][forwarder],
                }));
            } else {
                // Null forwarder means we send the message directly, which can happen via multiple channels, so split by channel.
                const channels = {};
                for (const target of targets) {
                    const channel = Messaging.REACHABLE[this.source][target];
                    if (!channels[channel]) channels[channel] = [];
                    channels[channel].push(target);
                }
                for (const [channel, targets] of Object.entries(channels)) {
                    subMessages.push(Object.assign({}, message, {
                        target: targets,
                        forwarder: null,
                        channel,
                    }));
                }
            }
        }
        return subMessages;
    }

    /**
     * Splits a context into its base context and tabId.
     * E.g. "contentScript-123" => ["contentScript", "123"],
     *      "background" => ["background", null]
     * @param {string} context - The context to split
     * @returns {string[]} The base context and tabId
     */
    static _split_tabId(context) {
        const [baseContext, tabId] = context.split('-');
        return [baseContext, tabId];
    }

    /**
     * Listens for messages of the given type
     * @param {string|string[]|null} type - The type or types of message to listen for. If null, listens for all types.
     * @param {function} callback - The callback to be called when a message of the given type is received
     * @param {boolean} [include_replies=false] - If true, the callback will be called even for messages which are direct replies to other messages
     * @returns {function} The listener function, in case you want to remove it later (with `window.removeEventListener("message", listener)`)
     */
    onMessage(type, callback, include_replies = false) {
        if (type && !(type instanceof Array)) type = [type];

        const listener = (event) => {
            log.debug(`__onMessage (I'm ${this.source}):`, event.data);
            const data = Messaging._removePrefix(event.data);
            if (data &&
                (!type || type.includes(data.type)) &&
                data.target.includes(this.source) &&
                (!data.context || data.context === this.context) &&
                (include_replies || !data.replyTo)) {
                log.debug("Received message:", event.data);
                callback(data);
            }
        };
        [...new Set(Object.values(this.messagingChannels))].forEach(channel => channel.addListener(listener));
        return listener;
    }

    /**
     * Set up forwarding between the window and browser channels.
     * Should only be called by the content script, since it has access to both.
     */
    _bridge() {
        const listener = (event) => {
            const message = Messaging._removePrefix(event.data);
            if (!message) return;
            if (message.source === "injected-script" && message.target.includes("background")) {
                message.tabId = this.tabId;
                log.debug("Forwarding message from injected-script to background", message);
                this.messagingChannels["background"].postMessage(Messaging._addPrefix(message));
            } else if (message.source === "background" && message.target.includes("injected-script")) {
                log.debug("Forwarding message from background to injected-script", message);
                this.messagingChannels["injected-script"].postMessage(Messaging._addPrefix(message));
            }
        };
        [...new Set(Object.values(this.messagingChannels))].forEach(channel => channel.addListener(listener));
    }

    /**
     * Set up service that lets content scripts identify their own tabId
     */
    _serve_whoami() {
        browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request[`${Messaging.PREFIX}type`] === `whoami`) {
                log.debug(`Responding to whoami request from ${sender.tab.id}`);
                sendResponse({ tabId: sender.tab.id });
            }
        });
    }

    /**
     * Adds a prefix to all keys of the given object
     * Used to avoid conflicts with other message senders that might also rely on fields like "id" and "type"
     * @param {object} obj
     */
    static _addPrefix(obj) {
        return Object.keys(obj).reduce((newObj, key) => {
            newObj[`${Messaging.PREFIX}${key}`] = obj[key];
            return newObj;
        }, {});
    }

    /**
     * Removes a prefix from all keys of the given object
     * @param {object} obj
     * @returns {object|bool} The object without the prefix, or `false` if any key does not have a prefix
     */
    static _removePrefix(obj) {
        if (Object.keys(obj).some(key => !key.startsWith(Messaging.PREFIX))) return false;
        return Object.keys(obj).reduce((newObj, key) => {
            newObj[key.slice(Messaging.PREFIX.length)] = obj[key];
            return newObj;
        }, {});
    }
}

export default Messaging;
