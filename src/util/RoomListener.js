import { ListenerProxy } from './ListenerProxy.js';

/**
 * Binds to a Showdown app and listens for rooms being created or deleted.
 */
export class RoomListener {
    constructor(app) {
        this.roomsProxy = new ListenerProxy(app.rooms);
        app.rooms = this.roomsProxy.proxy;
        this.handlers = { "new": [], "delete": [] }
        this.roomsProxy.on("set", (event, target, prop, value) => {
          this.handlers["new"].forEach(listener => listener(prop, value));
        });
        this.roomsProxy.on("deleteProperty", (event, target, prop) => {
            this.handlers["delete"].forEach(listener => listener(prop));
        });
        this.initialRooms = Object.keys(this.roomsProxy.target);
    }

    /**
     * Add a listener for rooms being created or deleted.
     * @param {string|string[]} event - The event(s) to listen for; valid options are "new" and "delete".
     * @param {function} listener - The listener function. Signature is (roomId, room) for "new" and (roomId) for "delete".
     */
    on(event, listener) {
        if (!Array.isArray(event)) event = [event];
        event.forEach(e => {
            if (!(e in this.handlers)) throw new Error(`Invalid event: ${e}`);
            this.handlers[e].push(listener);
        });
    }

    /**
     * Trigger "new" event for all initial rooms, after everyone has had the chance to set their listeners.
     * Skips rooms that don't exist anymore.
     * You should call this after all listeners have been set.
     */
    initialize() {
        this.initialRooms.forEach(roomId => {
            if (!(roomId in this.roomsProxy.target)) return;
            this.handlers["new"].forEach(listener => listener(roomId, this.roomsProxy.target[roomId]));
        });
    }
}