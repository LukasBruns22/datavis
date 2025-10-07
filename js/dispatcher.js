export class Dispatcher {
    constructor() {
        this.events = {};
    }

    /**
     * Subscribe a callback function to an event.
     * @param {string} eventName - The name of the event to subscribe to.
     * @param {function} callback - The function to call when the event is emitted.
     */
    on(eventName, callback) {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }
        this.events[eventName].push(callback);
    }

    /**
     * Emit an event, calling all subscribed callbacks with the provided data.
     * @param {string} eventName - The name of the event to emit.
     * @param {*} data - The data to pass to the callbacks.
     */
    emit(eventName, data) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(callback => callback(data));
        }
    }
}