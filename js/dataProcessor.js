import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getYearBin, getRuntimeBin, getRatingBin } from "./helper.js";
import { HIERARCHY_LEVELS, TOP_N_GENRES, BINS } from "./config.js";


export class DataProcessor {
    constructor(titles, stateManager) {
        this.rawData = titles;
        this.stateManager = stateManager;
        this.computeTopGenresAndScales()
    }

    // pre-flatten once (used by all charts)
    getFlattenedData() {
        if (!this.flattened) {
            this.flattened = this.rawData
                .filter(item =>
                    (item.titleType === 'movie' || item.titleType === 'tvSeries') &&
                    item.genres && item.genres.length > 0 &&
                    item.runtimeMinutes &&
                    item.averageRating &&
                    item.startYear && item.startYear < 2025
                )
                .flatMap(item => item.genres.map(genre => ({
                    type: item.titleType,
                    genre,
                    year: +item.startYear,
                    runtime: +item.runtimeMinutes,
                    rating: +item.averageRating,
                    title: item.originalTitle
                })));
        }

        return this.flattened;
    }

    computeTopGenresAndScales(TOP_N_GENRES = 10) {
        this.getFlattenedData();

        const genreCounts = d3.rollup(this.flattened, v => v.length, d => d.genre);
        const sortedGenres = Array.from(genreCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(d => d[0]);

        const topGenres = sortedGenres.slice(0, TOP_N_GENRES);

        const genreColorScale = d3.scaleOrdinal()
            .domain(topGenres)
            .range(d3.schemeTableau10)
            .unknown("#cccccc");

        const typeColorScale = d3.scaleOrdinal()
            .domain(['tvSeries', 'movie'])
            .range(['#1f77b4', '#ff7f0e']);

        const ratingColorScale = d3.scaleLinear()
            .domain([8, 10])
            .range(["#89d7a7ff", "#145a32"]);

        this.stateManager.setColorScales(genreColorScale, typeColorScale, ratingColorScale);
        this.stateManager.setTopGenres(topGenres);

        this.flattened.forEach(d => {
            d.genre = topGenres.includes(d.genre) ? d.genre : "Other";
        });
    }

    // get data filtered by current path (["movie", "Drama", "2000-2004"])
    getFilteredData() {
        const path = this.stateManager.getCurrentPath();
        const filters = {};
        const levels = HIERARCHY_LEVELS.slice(0, path.length);

        levels.forEach((level, i) => {
            filters[level] = path[i];
        });

        return this.stateManager.applyFilters(this.getFlattenedData(), filters);
    }


    getCorrelationData() {
        return this.getFilteredData();
    }

    getDonutData(selectedAttribute = null) {
        const path = this.stateManager.getCurrentPath();
        const currentLevel = path.length;
        const isLastLevel = currentLevel >= HIERARCHY_LEVELS.length;

        const data = this.getFilteredData();

        if (!isLastLevel) {
            const nextAttribute = selectedAttribute || HIERARCHY_LEVELS[currentLevel];
            const grouped = this._groupByAttribute(data, nextAttribute);

            const nonEmptyGrouped = Array.from(grouped)
                .filter(([key, values]) => values && values.length > 0);

            return nonEmptyGrouped.map(([key, values]) => {
                let longLabel = key;
                let shortLabel = key;

                // If attribute has BINS, get both labels
                if (BINS[nextAttribute]) {
                    const bin = BINS[nextAttribute].find(b => key === b.label || key === b.shortLabel);
                    if (bin) {
                        longLabel = bin.label;
                        shortLabel = bin.shortLabel || bin.label.split('(')[0].trim();
                    }
                }

                return {
                    name: longLabel,        
                    shortName: shortLabel, 
                    count: values.length,
                    avgRating: d3.mean(values, d => d.rating),
                };
            });
        } else {
            const topMovies = data
                .sort((a, b) => d3.descending(a.rating, b.rating))
                .slice(0, 10);
            this.stateManager.setCurrentTitles(topMovies);

            return topMovies.map(d => ({
                name: d.title,
                shortName: d.title, 
                count: 1,
                avgRating: d.rating,
            }));
        }
    }

    _groupByAttribute(data, attribute) {
        if (attribute === "year") return d3.group(data, d => getYearBin(d.year));
        if (attribute === "runtime") return d3.group(data, d => getRuntimeBin(d.runtime));
        if (attribute === "rating") return d3.group(data, d => getRatingBin(d.rating));
        return d3.group(data, d => d[attribute]);
    }

}