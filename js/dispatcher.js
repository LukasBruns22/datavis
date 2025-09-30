class Dispatcher {
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

class StateManager {
    constructor() {
        this.filters = {}; // e.g., { type: 'movie', genre: 'Action' }
    }

    /**
     * Sets the current filter state from a hierarchical path.
     * @param {string[]} path - An array representing the filter path (e.g., ['movie', 'Action']).
     * @param {string[]} levels - The hierarchy definition (e.g., ['type', 'genre', ...]).
     */
    setPath(path, levels) {
        this.filters = {}; // Reset filters
        path.forEach((filterValue, i) => {
            const attribute = levels[i];
            if (attribute) {
                this.filters[attribute] = filterValue;
            }
        });
    }

    /**
     * Applies the current filters to a dataset.
     * @param {object[]} data - The array of data points to filter.
     * @returns {object[]} The filtered data.
     */
    applyFilters(data) {
        let filtered = [...data];
        for (const key in this.filters) {
            const filterValue = this.filters[key];
             if (typeof filterValue === 'string' && filterValue.includes(' - ')) {
                const [min, max] = filterValue.split(' - ').map(parseFloat);
                filtered = filtered.filter(d => d[key] >= min && d[key] <= max);
            } else if (filterValue !== "Other" && filterValue !== "Media") {
                filtered = filtered.filter(d => String(d[key]) === String(filterValue));
            }
        }
        return filtered;
    }
}