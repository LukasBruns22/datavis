export class StateManager {
    constructor() {
        this.filters = {}; // e.g., { type: 'movie', genre: 'Action' }
        this.currentPath = [];  // Stores the current hierarchical path globally
    }

    /**
     * Returns the current hierarchical path.
     */
    getCurrentPath() {
        return this.currentPath;
    }

    getGenreColorScale() {
        return this.genreColorScale;
    }

    getTypeColorScale() {
        return this.typeColorScale;
    }

    getRatingColorScale() {
        return this.ratingColorScale;
    }

    getTopGenres() {
        return this.topGenres;
    }

    /**
     * Sets the current filter state from a hierarchical path.
     * @param {string[]} path - An array representing the filter path (e.g., ['movie', 'Action']).
     * @param {string[]} levels - The hierarchy definition (e.g., ['type', 'genre', ...]).
     */
    setPath(path, levels) {
        this.filters = {}; // Reset filters
        this.currentPath = path.slice();
        path.forEach((filterValue, i) => {
            const attribute = levels[i];
            if (attribute) {
                this.filters[attribute] = filterValue;
            }
        });
    }



    setColorScales(genreColorScale, typeColorScale, ratingColorScale) {
        this.genreColorScale = genreColorScale;
        this.typeColorScale = typeColorScale;
        this.ratingColorScale = ratingColorScale;
    }


    setTopGenres(topGenres) {
        this.topGenres = topGenres;
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