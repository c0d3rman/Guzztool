/*
Guzztool's messaging utility.
Used for sending messages between the different parts of the extension (injected-script, content-script, background).
Use as follows:
```
import Messaging from '@guzztool/util/messaging';
const messaging = new Messaging('<source>');
const subtoolSpecific = new Messaging('<source>', '<subtool-id>');
```
Note that for messages to go between the injected-script and background,
a Messaging object must be created in the content-script to mediate.

KNOWN LIMITATION: since the content-script injects the injected-script,
injected-script's messaging often won't be ready to listen to messages from the content-script.
This can be worked around by sending a "ready" message from the injected-script on initialization
and listening for it in the content-script.
*/

import log from '@guzztool/util/log';
import { browser } from '@guzztool/util/util';


export class WindowMessagingChannel {
    postMessage(message) {
        window.postMessage(message);
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
        browser.runtime.sendMessage(message);
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
    static TARGETS = ["injected-script", "content-script", "background"];
    static PREFIX = "guzztool_";

    /**
     * Constructs a new Messaging instance
     * @param {string} source - the source this messaging instance is sending messages from
     * @param {string|null} context - the context this messaging instance is for (or null for global context)
     */
    constructor(source, context = null) {
        this.source = source;
        this.context = context;

        if (source === "injected-script") {
            // Injected script can only access the window channel
            const windowChannel = new WindowMessagingChannel();
            this.messagingChannels = Object.fromEntries(Messaging.TARGETS.map(target => [target, windowChannel]));
        } else if (source === "content-script") {
            // Content script can access both the window and browser channels (and prefers window when messaging itself)
            const windowChannel = new WindowMessagingChannel();
            const browserChannel = new BrowserMessagingChannel();
            this.messagingChannels = {
                "injected-script": windowChannel,
                "content-script": windowChannel,
                "background": browserChannel,
            };
            // Set up bridge to mediate between window and browser channels
            this._bridge();
        } else if (source === "background") {
            // Background script can only access the browser channel
            const browserChannel = new BrowserMessagingChannel();
            this.messagingChannels = Object.fromEntries(Messaging.TARGETS.map(target => [target, browserChannel]));
        } else {
            throw new Error(`Invalid source: ${source}`);
        }
    }

    /**
     * Returns a new Messaging instance with the given context
     * @param {string} context - The context to get
     * @returns {Messaging} A new Messaging instance with the given context
     */
    getContext(context) {
        if (context === this.context) return this;
        return new Messaging(this.source, context);
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
        // Automatically set target for replies
        if (replyTo) {
            if (target) throw new Error(`Targets are inferred automatically for replies; do not provide a target if you're replying to a message`);
            target = [replyTo.source];
            if (!type) type = replyTo.type;
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
     * Listens for messages of the given type
     * @param {string|string[]|null} type - The type or types of message to listen for. If null, listens for all types.
     * @param {function} callback - The callback to be called when a message of the given type is received
     * @param {boolean} [include_replies=false] - If true, the callback will be called even for messages which are direct replies to other messages
     * @returns {function} The listener function, in case you want to remove it later (with `window.removeEventListener("message", listener)`)
     */
    onMessage(type, callback, include_replies = false) {
        if (type && !(type instanceof Array)) type = [type];

        const listener = (event) => {
            const data = Messaging._removePrefix(event.data);
            // log.debug(`__Got a message (I'm ${this.source}):`, data);
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
            const data = Messaging._removePrefix(event.data);
            if (!data) return;
            if (data.source === "injected-script" && data.target.includes("background")) {
                log.debug("Forwarding message from injected-script to background", data);
                this.messagingChannels["background"].postMessage(data);
            } else if (data.source === "background" && data.target.includes("injected-script")) {
                log.debug("Forwarding message from background to injected-script", data);
                this.messagingChannels["injected-script"].postMessage(data);
            }
        };
        [...new Set(Object.values(this.messagingChannels))].forEach(channel => channel.addListener(listener));
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
