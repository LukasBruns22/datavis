import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { groupByAttribute } from "./helper.js";
import { HIERARCHY_LEVELS, BINS, TOP_N_GENRES } from "./config.js";


export class DataProcessor {
    constructor(rawData, stateManager) {
        this.rawTitles = rawData.titles;
        this.rawPersons = rawData.persons
        this.stateManager = stateManager;
        this.computeTopGenresAndScales()
    }

    computeTopGenresAndScales() {
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
            .domain([1, 4, 10])
            .range(["#b22222", "#f4d03f", "#1e894cff"])
            .interpolate(d3.interpolateLab);

        this.stateManager.setColorScales(genreColorScale, typeColorScale, ratingColorScale);
        this.stateManager.setTopGenres(topGenres);

        this.flattened.forEach(d => {
            d.genre = topGenres.includes(d.genre) ? d.genre : "Other";
        });
    }

    // small preprocessing to assure no invalid titles
    getPreprocessedTitles() {
        if (!this.preprocessedTitles) {
            this.preprocessedTitles = this.rawTitles
                .filter(item =>
                    (item.titleType === 'movie' || item.titleType === 'tvSeries') &&
                    item.genres && item.genres.length > 0 &&
                    item.runtimeMinutes &&
                    item.averageRating &&
                    item.startYear && item.startYear < 2025
                )
                .map(item => ({
                    tconst: item.tconst,
                    title: item.originalTitle,
                    type: item.titleType,
                    genres: item.genres,
                    year: +item.startYear,
                    runtime: +item.runtimeMinutes,
                    rating: +item.averageRating
                }));
        }

        return this.preprocessedTitles;
    }

    getFlattenedData() {
        if (!this.flattened) {
            this.flattened = this.getPreprocessedTitles()
                .flatMap(item =>
                    item.genres.map(genre => ({
                        ...item,
                        genre
                    }))
                );
        }

        return this.flattened;
    }

    // get data filtered by current path (["movie", "Drama", "2000-2004"])
    getFilteredData() {
        return this.stateManager.applyFilters(this.getFlattenedData());
    }

    getFilteredUnflattenedData() {
        return this.stateManager.applyFilters(this.getPreprocessedTitles());
    }

    getCorrelationData() {
        return this.getFilteredData();
    }

    getActorAttributeNetworkData() {
        return { persons: this.rawPersons, titles: this.getFilteredUnflattenedData() }
    }

    //TODO: remove duplicates in "Other" genre
    getDonutData(selectedAttribute = null) {
        const path = this.stateManager.getCurrentPath();
        const currentLevel = path.length;
        const isLastLevel = currentLevel >= HIERARCHY_LEVELS.length;

        const data = this.getFilteredData();

        if (!isLastLevel) {
            const nextAttribute = selectedAttribute || HIERARCHY_LEVELS[currentLevel];
            const grouped = groupByAttribute(data, nextAttribute);

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

}