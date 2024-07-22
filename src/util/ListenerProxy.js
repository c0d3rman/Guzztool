/**
 * ListenerProxy class to create a custom proxy object with event handling.
 * 
 * Example usage:
 * ```
 * let originalObject = { name: "John", age: 30 };
 * // Proxy the object
 * let objectProxy = new ListenerProxy(originalObject);
 * originalObject = objectProxy.proxy;
 * // Listen to various events on the proxied object
 * objectProxy.on("set", (event, target, prop, value) => console.log(`Set ${prop} to ${value}`));
 * objectProxy.on("deleteProperty", (event, target, prop) => console.log(`Deleted ${prop} (used to be ${target[prop]})`));
 * objectProxy.on("*", (event, target, ...args) => console.log(event, target, ...args));
 * // When the object is updated, listeners will fire
 * originalObject.name = "Jane";
 * delete originalObject.age;
 * ```
 */
export class ListenerProxy {
    /**
     * List of proxy methods to be handled.
     */
    static proxyMethods = ['get', 'set', 'apply', 'construct', 'defineProperty', 'deleteProperty', 'getOwnPropertyDescriptor', 'getPrototypeOf', 'has', 'isExtensible', 'ownKeys', 'preventExtensions', 'set'];

    /**
     * Constructor for ListenerProxy class.
     * @param {Object} target - The target object to be proxied.
     */
    constructor(target) {
        this.target = target;
        this.handler = ListenerProxy.proxyMethods.reduce((handlers, method) => {
            handlers[method] = (...args) => {
                this._emit(method, ...args); // The target is always the first arg in all Proxy methods
                return Reflect[method](...args);
            };
            return handlers;
        }, {});
        this.proxy = new Proxy(target, this.handler);
        this.events = {};
    }

    /**
     * Add an event listener to the proxy. The listener has a signature of (event, target, ...args) => void.
     * You can also listen to the special "*" event which will be called for all events.
     * @param {string | Array<string>} event - The event or events to listen for.
     * @param {Function} listener - The function to be called when the event is emitted.
     */
    on(event, listener) {
        if (!Array.isArray(event)) event = [event];
        event.forEach(e => {
            if (!this.events[e]) this.events[e] = [];
            this.events[e].push(listener);
        });
    }

    /**
     * Emit an event on the proxy.
     * @param {string} event - The event to emit.
     * @param {Object} target - The target object.
     * @param  {...any} args - The arguments to be passed to the event listeners.
     */
    _emit(event, target, ...args) {
        this.events[event]?.forEach(listener => listener(event, target, ...args));
        this.events['*']?.forEach(listener => listener(event, target, ...args));
    }
}

/**
 * ArrayListenerProxy class to create a custom proxy for arrays with event handling.
 * 
 * Example usage:
 * ```
 * let originalArray = [];
 * // Proxy the array
 * let arrayProxy = new ArrayListenerProxy(originalArray);
 * originalArray = arrayProxy.proxy;
 * // Listen to various events on the proxied array
 * arrayProxy.on("mutate", (event, target, ...args) => console.log(event, target, ...args));
 * arrayProxy.on("*", (event, target, ...args) => console.log(event, target, ...args));
 * // When the array is updated, listeners will fire
 * originalArray.push("Dog");
 * ```
 */
export class ArrayListenerProxy extends ListenerProxy {
    /**
     * List of array mutating methods to be handled.
     */
    static mutatingArrayMethods = ['copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'];

    /**
     * Constructor for ArrayListenerProxy class.
     * @param {Array} target - The target array to be proxied.
     */
    constructor(target) {
        super(target);
        const get = this.handler.get;
        this.handler.get = (target, prop, receiver) => {
            // If someone wants to get a mutating method of the array, give them a wrapped version that emits a mutate event
            if (ArrayListenerProxy.mutatingArrayMethods.includes(prop)) {
                return (...args) => {
                    this._emit("mutate", target, { type: prop, args: args });
                    return get(target, prop, receiver).apply(target, args);
                };
            }
            // Otherwise just give them what they asked for
            return get(target, prop, receiver);
        };
        this.on(["set", "deleteProperty"], (event, target, ...args) => {
            this._emit("mutate", target, { event: event, args: args });
        });
    }
}

/**
 * FunctionListenerProxy class that allows messing with a function's arguments and return value.
 * 
 * Example usage:
 * ```
 * let someFunction = (a, b, c) => a + b + c;
 * let functionProxy = new FunctionListenerProxy(someFunction, (originalFn, a, b, c) => {
 *     console.log(a, b, c);
 *     if (a === 1 && b === 2 && c === 3) return -1;
 *     if (a > b) return originalFn(b * 2, a, c);
 *     return originalFn(a, b, c);
 * });
 * someFunction = functionProxy.proxy;
 * ```
 */
export class FunctionListenerProxy extends ListenerProxy {
    /**
     * Constructor for FunctionListenerProxy class.
     * @param {Function} target - The target function to be proxied.
     * @param {Function} proxyFn - The function to proxy the target function with.
     */
    constructor(target, proxyFn) {
        super(target);
        this.proxyFn = proxyFn;
        this.handler.apply = (target, thisArg, argumentsList) => {
            this._emit("apply", target, { thisArg, argumentsList });
            return this.proxyFn((...args) => Reflect.apply(target, thisArg, args), ...argumentsList);
        };
    }
}

