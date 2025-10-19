import { BINS } from "./config.js";

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

    setCurrentTitles(currentTitles) {
        this.currentTitles = currentTitles
    }

    getCurrentTitles() {
        return this.currentTitles
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

    setDataProcessor(processor) {
        this.dataProcessor = processor;
    }

    getDataProcessor() {
        return this.dataProcessor;
    }

    getEpisodeData() {
        return this.dataProcessor.getEpisodeData()
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
            const filterLabel = this.filters[key];
            if (!filterLabel) continue;

            const bin = BINS[key]?.find(b => b.label === filterLabel);

            filtered = filtered.filter(d => {
                const value = d[key] ?? d[`${key}s`]; // handle plural keys like "genres"

                if (bin) {
                    // bin-based filtering (numeric ranges)
                    return value >= bin.min && value <= bin.max;
                }

                if (Array.isArray(value)) {
                    // e.g. for genres: ["Drama", "Action", "Comedy"]
                    return value.includes(filterLabel);
                }

                if (filterLabel !== "Type") {
                    return String(value) === String(filterLabel);
                }

                return true;
            });
        }

        return filtered;
    }
}