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
import _ from 'lodash';


export class WindowMessagingChannel {
    name = "window";
    id = "window";

    postMessage(message) { return window.postMessage(message); }

    addListener(listener) {
        window.addEventListener("message", listener);
        return listener;
    }

    removeListener(listener) {
        window.removeEventListener("message", listener);
    }
}

export class BrowserMessagingChannel {
    name = "browser";

    constructor(port) {
        this.port = port;
        this.id = `${this.name}-${port.name}`;
        this.listeners = {};
    }

    postMessage(message) { return this.port.postMessage(message); }

    addListener(listener) {
        const wrapper = this.listeners[listener] = (request, sender, sendResponse) => listener({ data: request });
        this.port.onMessage.addListener(wrapper);
        return listener;
    }

    removeListener(listener) {
        this.port.onMessage.removeListener(this.listeners[listener]);
        delete this.listeners[listener];
    }
}


class Messaging {
    // When going over the wire, all fields are prefixed to avoid conflicts with other message senders.
    // You can modify this prefix if you want to avoid conflicts with others using this same library,
    // though they shouldn't happen anyway because all window-channel contexts have unique IDs.
    static PREFIX = "guzztool_";

    // `REACHABLE[sender][receiver] = channel` means sender can reach receiver through channel.
    static REACHABLE = {
        "web": { "web": "window", "contentScript": "window" }, // For simplicity only web and contentScript can directly talk to themselves
        "contentScript": { "web": "window", "contentScript": "window", "background": "browser" },
        "background": { "contentScript": "browser", "devToolsPage": "browser", "extension": "browser", "options": "browser" },
        "devToolsPage": { "background": "browser" },
        "extension": { "background": "browser" },
        "options": { "background": "browser" },
    };

    /**
     * Constructs a new Messaging instance.
     */
    constructor() {
        // Singleton
        if (Messaging._instance) return Messaging._instance
        Messaging._instance = this;

        this._unwrapped = this; // For use by getContext
        this.listeners = [];

        // Automatically detect what source we're running in
        this.context = getContextName();
        if (this.context === 'unknown') throw new Error(`Could not detect source for messaging`);

        // Acquire tabID where relevant
        if (this.context === "contentScript") {
            // this.context += "-" + crypto.randomUUID().slice(0, 8);
            this.context += "-FAKEID";
        } else if (this.context === "web") {
            // TBD fetch from contentScript? get as input when injected? Align on first interaction?
            // For now we fake it
            this.context += "-FAKEID";
        }

        // Set up messaging channels
        const [baseContext, tabId] = Messaging._split_tabId(this.context);
        this.channels = {
            "window": null,
            "browser": {},
        };
        if (Object.values(Messaging.REACHABLE[baseContext]).includes("window")) {
            this.channels.window = new WindowMessagingChannel();
            log.debug(`Window channel initialized for me (${this.context}).`);
        }
        if (this.context === "background") {
            browser.runtime.onConnect.addListener(port => {
                if (port.name in this.channels.browser) throw new Error(`Port already exists: ${port.name}`);
                this.channels.browser[port.name] = new BrowserMessagingChannel(port);
                this.listeners.forEach(listener => this.channels.browser[port.name].addListener(listener));
                log.debug(`Browser channel initialized between me (${this.context}) and ${port.name}.`);
            });
        } else if (Messaging.REACHABLE[baseContext]["background"] == "browser") {
            this.channels.browser.background = new BrowserMessagingChannel(browser.runtime.connect({ name: this.context }));
            log.debug(`Browser channel initialized between me (${this.context}) and background.`);
        }

        // Set up forwarding
        this.onMessage(null, (message) => {
            if (message.forwarder === this.context) {
                log.debug(`${this.context} forwarding message:`, message);
                this.postMessage({
                    type: message.type,
                    target: message.target,
                    content: message.content,
                    scope: message.scope,
                    replyTo: message.replyTo,
                    source: message.source,
                    id: message.id,
                });
            }
        }, { include_replies: true, include_forwards: true, all_scopes: true });

        log.debug(`Messaging initialized for context '${this.context}'.`);
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
        const [sourceContext, sourceTabId] = Messaging._split_tabId(this.context);

        // Split targets into groups by forwarder.
        const forwarders = _.groupBy(message.target, target => {
            const [targetContext, targetTabId] = Messaging._split_tabId(target);

            // If you can reach your destination directly, send to there.
            // If both the source and the target have a tabId, they must be the same.
            // (Applies for web<->web, web<->contentScript, and contentScript<->contentScript)
            if (this._getChannelFor(target) && !(sourceTabId && targetTabId && targetTabId !== sourceTabId)) {
                return ""; // `null` can't be a key so "" is an intermediary (null still ends up as the forwarder in the output)
            }
            // For background->web, forward to the associated contentScript.
            else if (sourceContext === "background" && targetContext === "web") {
                return `contentScript-${targetTabId}`;
            }
            // For web->anyone it can't reach, forward to the associated contentScript.
            else if (sourceContext === "web") {
                return `contentScript-${sourceTabId}`;
            }
            // If you can reach background, forward to background.
            else if (this._getChannelFor("background")) {
                return "background";
            }
            // Can't reach the destination. (Should never happen.)
            else {
                throw new Error(`Could not resolve forwarding for message: ${JSON.stringify(message)}`);
            }
        });

        // Create one or more sub-messages for each forwarder, splitting up by channel where necessary.
        const subMessages = [];
        for (const [forwarder, targets] of Object.entries(forwarders)) {
            let channelGroups;
            if (forwarder) channelGroups = { [this._getChannelFor(forwarder).id]: targets };
            else channelGroups = _.groupBy(targets, target => this._getChannelFor(target).id);
            for (const [channelId, channelTargets] of Object.entries(channelGroups)) {
                subMessages.push(Object.assign({}, message, {
                    target: channelTargets,
                    forwarder: forwarder || null,
                    channel: this._getChannelFor(forwarder || channelTargets[0]), // They're all the same so we use the first
                }));
            }

            // // If not forwarding, split up each browser target into its own sub-message (but leave window targets grouped).
            // if (!forwarder) {
            //     const channels = _.groupBy(targets, target => {
            //         const [targetContext, targetTabId] = Messaging._split_tabId(target);
            //         return Messaging.REACHABLE[sourceContext][targetContext];
            //     });
            //     if (channels.window) {
            //         subMessages.push(Object.assign({}, message, {
            //             target: channels.window,
            //             forwarder: null,
            //             channel: "window",
            //         }));
            //     }
            //     if (channels.browser) {
            //         subMessages.push(...channels.browser.map(target => Object.assign({}, message, {
            //             target,
            //             forwarder: null,
            //             channel: "browser",
            //         })));
            //     }
            //     // If forwarding, leave targets grouped.
            // } else {
            //     const [forwarderContext, forwarderTabId] = Messaging._split_tabId(forwarder);
            //     subMessages.push(Object.assign({}, message, {
            //         target: targets,
            //         forwarder,
            //         channel: Messaging.REACHABLE[sourceContext][forwarderContext],
            //     }));
            // }
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
     * Posts a message to the given target(s)
     * @param {object} message - The message to be posted.
     * @param {string} message.type - Type of the message. (For replies, this is automatically set to the type of the message being replied to if not provided.)
     * @param {string|string[]} message.target - Target(s) to post to. If not provided, posts to all targets except the source.
     * @param {object} [message.content={}] - Content of the message
     * @param {string|null} [message.scope=this.scope] - The context to send the message to (or null for global context).
     * @param {boolean} [message.awaitReply=false] - If true, returns a promise that resolves when a reply is received. (If multiple are received the promise resolves on the first one; you can set up your own logic with onMessage(include_replies=true) if you need to.)
     * @param {number} [message.awaitReplyTimeout=5000] - Timeout in milliseconds for the reply.
     * @param {object|string|null} [message.replyTo=null] - If this is a reply, the message to reply to. This also accepts the message ID string, but using this is not recommended as you'll have to ensure other fields are correct yourself.
     * @param {string|null} [message.source=null] - For internal use only.
     * @param {string|null} [message.id=null] - For internal use only.
     */
    postMessage({
        type = null,
        target = null,
        content = {},
        scope = this.scope,
        awaitReply = false,
        awaitReplyTimeout = 5000,
        replyTo = null,
        source = null,
        id = null
    }) {
        // Automatically infer fields for replies
        if (replyTo && typeof replyTo === "object") {
            if (target) throw new Error(`Targets are inferred automatically for replies; do not provide a target if you're replying to a message.`);
            target = [replyTo.source];
            if (!type) type = replyTo.type;
            replyTo = replyTo.id;
        }

        // Validate target
        // TBD edit this to use active targets instead of a constant list
        if (target === null) throw new Error("target null (TEMP)"); //target = Messaging.TARGETS.filter(t => t !== this.context);
        if (!(target instanceof Array)) target = [target];
        if (target.length === 0) throw new Error(`Target cannot be empty`);
        // if (!target.every(t => Messaging.TARGETS.includes(t))) throw new Error(`Invalid target(s) ${target}`);

        // Build base message
        const message = {
            id: id ?? crypto.randomUUID(),
            type,
            content,
            source: source ?? this.context,
            target,
            scope,
            replyTo,
        };

        // Split into multiple messages for different forwarders & channels and send each one
        const subMessages = this._splitMessage(message);
        subMessages.forEach(subMessage => this._postMessage(subMessage));

        // If awaitReply is set, listen for replies and return a promise if awaitReply is true
        if (awaitReply) {
            let replySources;
            if (awaitReply === true) replySources = message.target;
            else if (awaitReply instanceof Array) replySources = awaitReply;
            else replySources = [awaitReply];
            if (_.difference(replySources, message.target).length > 0) throw new Error(`awaitReply targets must be a subset of the message's targets, but these weren't: ${_.difference(replySources, message.target)}`);

            const promises = replySources.map(replySource => new Promise((resolve, reject) => {
                const channel = subMessages.find(subMessage => subMessage.target.includes(replySource)).channel;
                if (!channel) reject(new Error(`${replySource} has no channel (is unreachable or hasn't connected yet)`));

                let timeoutId = null;
                const listener = (event) => {
                    const potentialReply = Messaging._removePrefix(event.data);
                    if (potentialReply && potentialReply.replyTo === message.id && potentialReply.source === replySource) {
                        log.debug(`${this.context} received reply:`, potentialReply);
                        channel.removeListener(listener);
                        clearTimeout(timeoutId);
                        resolve(potentialReply);
                    }
                };
                log.debug(`${this.context} listening for reply to ${message.id} from ${replySource} on ${channel.name}`);
                channel.addListener(listener);

                if (awaitReplyTimeout) {
                    timeoutId = setTimeout(() => {
                        channel.removeListener(listener);
                        const error = new Error(`Timed out while waiting for ${replySource}'s reply to message: ${JSON.stringify(message)}`);
                        reject(error);
                    }, awaitReplyTimeout);
                }
            }));

            if (awaitReply === true) return promises.length > 1 ? Promise.all(promises) : promises[0];
            else if (awaitReply instanceof Array) return promises;
            else return promises[0];
        }
    }

    /**
     * Expects a channel field (which will be deleted)
     * For browser messages without a forwarder, expects only one target
     * @param {object} message - The message to be posted.
     */
    _postMessage(message) {
        const { channel, ...prunedMessage } = message;
        if (!channel) throw new Error(`Invalid channel for message: ${JSON.stringify(message)}`);
        log.debug(`${this.context} posting ${message.replyTo ? "reply" : "message"}: `, prunedMessage);

        const immediateTarget = message.forwarder ? [message.forwarder] : message.target;
        if (immediateTarget.length > 1 && channel.name == "browser") throw new Error(`Can't send to multiple browser targets at once: ${immediateTarget}`);

        channel.postMessage(Messaging._addPrefix(prunedMessage));
    }

    /**
     * Listens for messages of the given type
     * @param {string|string[]|null} type - The type or types of message to listen for. If null, listens for all types.
     * @param {function} callback - The callback to be called when a message of the given type is received
     * @param {object} [options] - Options for the listener
     * @param {boolean} [options.include_replies=false] - If true, the callback will be called even for messages which are direct replies to other messages
     * @param {boolean} [options.include_forwards=false] - If true, the callback will be called even for messages which are forward requests for other messages
     * @param {boolean} [options.all_scopes=false] - If true, the callback will be called for messages in any scope, not just the current one
     * @returns {function} The listener function, in case you want to remove it later (with `window.removeEventListener("message", listener)`)
     */
    onMessage(type, callback, { include_replies = false, include_forwards = false, all_scopes = false } = {}) {
        if (type && !(type instanceof Array)) type = [type];

        const listener = (event) => {
            const data = Messaging._removePrefix(event.data);
            if (data &&
                (!type || type.includes(data.type)) &&
                (data.target.includes(this.context) || (include_forwards && data.forwarder == this.context)) &&
                (!data.scope || data.scope === this.scope || all_scopes) &&
                (include_replies || !data.replyTo) &&
                (include_forwards || !data.forwarder)) {
                log.debug(`${this.context} received message:`, data);
                callback(data);
            }
        };
        this._getAllChannels().forEach(channel => channel.addListener(listener)); // Set the listener for all currently-active channels
        this.listeners.push(listener); // Save it so it can be added to all new channels that connect later
        return listener;
    }


    /**
     * Returns the channel for the given context, or null if there isn't one
     * (either because it's unreachable or hasn't connected yet.)
     * @param {string} context - The context to get the channel for
     * @returns {object|null} The channel for the given context
     */
    _getChannelFor(context) {
        const [baseContext, tabId] = Messaging._split_tabId(context);
        const [myBaseContext, myTabId] = Messaging._split_tabId(this.context);
        const channelName = Messaging.REACHABLE[myBaseContext][baseContext];
        if (!channelName) return null;
        else if (channelName == "browser") return this.channels.browser[context] || null;
        else if (channelName == "window") return this.channels.window;
        else throw new Error(`Invalid channel: ${channelName}`);
    }

    /**
     * Returns all active channels.
     * @returns {object[]} All active channels
     */
    _getAllChannels() {
        return [this.channels.window, ...Object.values(this.channels.browser)].filter(channel => channel);
    }

    /**
     * Returns a promise that resolves when the given contexts are ready.
     * @param {string[]} contexts - The contexts to wait for.
     */
    ready(contexts = []) {

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
