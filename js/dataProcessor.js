import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { groupByAttribute } from "./helper.js";
import { HIERARCHY_LEVELS, BINS, TOP_N_GENRES, GENRE_SHORT } from "./config.js";


export class DataProcessor {
    constructor(rawData, stateManager) {
        this.rawTitles = rawData.titles;
        this.rawPersons = rawData.persons
        this.stateManager = stateManager;
        this.computeTopGenres()
        this.computeColorScales()
    }

    computeColorScales() {

        const topGenres = this.stateManager.getTopGenres()

        const genreColorScale = d3.scaleOrdinal()
            .domain(topGenres)
            .range(d3.schemeTableau10)
            .unknown("#cccccc");

        const typeColorScale = d3.scaleOrdinal()
            .domain(['tvSeries', 'movie'])
            .range(['#1f77b4', '#ff7f0e']);


        const ratingColorScale = d3.scaleThreshold()
            .domain([2, 4, 6, 7.5, 9, 10])  // cutoff points
            .range([
                "#5D3872", // <2
                "#E64D3D", // 2–4
                "#F59C10", // 4–6
                "#F3CE3C", // 6–7.5
                "#29B263", // 7.5–9
                "#19683A"  // ≥9
            ]);

        this.stateManager.setColorScales(genreColorScale, typeColorScale, ratingColorScale);

    }

    computeTopGenres() {
        const genreCounts = d3.rollup(
            this.rawTitles.flatMap(d => d.genres.map(g => ({ genre: g }))),
            v => v.length,
            d => d.genre
        );
        const sortedGenres = Array.from(genreCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(d => d[0]);

        const topGenres = sortedGenres.slice(0, TOP_N_GENRES);
        this.stateManager.setTopGenres(topGenres)
    }

    getEpisodeData() {
        if (!this.episodeData) {
            this.episodeData = this.rawTitles
                .filter(item =>
                    (item.titleType === 'tvEpisode') &&
                    item.genres && item.genres.length > 0 &&
                    item.runtimeMinutes &&
                    item.averageRating &&
                    item.startYear && item.startYear < 2025
                )
        }
        return this.episodeData;
    }

    // small preprocessing to assure no invalid titles
    getPreprocessedTitles() {
        if (!this.preprocessedTitles) {
            const topGenres = this.stateManager.getTopGenres()

            this.preprocessedTitles = this.rawTitles
                .filter(item =>
                    (item.titleType === 'movie' || item.titleType === 'tvSeries') &&
                    item.genres && item.genres.length > 0 &&
                    item.runtimeMinutes &&
                    item.averageRating &&
                    item.startYear && item.startYear < 2025
                )
                .map(item => {
                    const mappedGenres = item.genres
                        .map(g => topGenres.includes(g) ? g : "Other");
                    const uniqueGenres = [...new Set(mappedGenres)];

                    return {
                        tconst: item.tconst,
                        title: item.originalTitle,
                        type: item.titleType,
                        tconst: item.tconst,
                        seasonCount: item.seasonCount,
                        genres: uniqueGenres,
                        year: +item.startYear,
                        runtime: +item.runtimeMinutes,
                        rating: +item.averageRating
                    };
                });
        }

        return this.preprocessedTitles;
    }

    getFlattenedData() {
        if (!this.flattened) {
            this.flattened = this.getPreprocessedTitles()
                .flatMap(item =>
                    item.genres.map(genre => ({
                        tconst: item.tconst,
                        title: item.title,
                        type: item.type,
                        genre,
                        year: item.year,
                        runtime: item.runtime,
                        rating: item.rating,
                        tconst: item.tconst,
                        seasonCount: item.seasonCount
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

    getDonutData(selectedAttribute = null) {
        const path = this.stateManager.getCurrentPath();
        const currentLevel = path.length;
        const isLastLevel = currentLevel >= HIERARCHY_LEVELS.length;

        const data = this.getFilteredData();

        if (!isLastLevel) {
            const nextAttribute = selectedAttribute || HIERARCHY_LEVELS[currentLevel];
            const grouped = groupByAttribute(data, nextAttribute);

            const nonEmptyGrouped = Array.from(grouped)
                .filter(([_, values]) => values && values.length > 0);

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
            const topTitles = data
                .sort((a, b) => d3.descending(a.rating, b.rating))
                .slice(0, 10);
            this.stateManager.setCurrentTitles(topTitles);

            return topTitles.map(d => ({
                name: d.title,
                shortName: d.title,
                count: 1,
                avgRating: d.rating,
            }));
        }
    }

    getHeatmapData() {
        const path = this.stateManager.getCurrentPath();
        const currentLevel = path.length;
        const nextAttribute = HIERARCHY_LEVELS[currentLevel];

        const maxHeatmapLevel = HIERARCHY_LEVELS.indexOf("runtime");
        if (currentLevel > maxHeatmapLevel) return null;

        if (!nextAttribute) return null; 

        const useFlattened = ["genre", "runtime", "year"].includes(nextAttribute);
        const data = useFlattened
            ? this.getFilteredData()
            : this.getFilteredUnflattenedData();
        const bins = BINS[nextAttribute];

        const grouped = d3.group(data, d => {
            if (bins) {
                const bin = bins.find(b => d[nextAttribute] >= b.min && d[nextAttribute] <= b.max);
                return bin ? bin.label : "Unknown";
            }
            return d[nextAttribute];
        });

        const columns = Array.from(grouped, ([key, values]) => {
            const avgRating = d3.mean(values, d => d.rating);
            const topTitles = values
                .sort((a, b) => d3.descending(a.rating, b.rating))
                .slice(0, 5)
                .map(d => ({
                    title: d.title,
                    rating: d.rating,
                    type: d.type,
                    tconst: d.tconst,
                    seasonCount: d.seasonCount
                }));

            // find short label if this attribute has bins
            let shortLabel = key;
            if (bins) {
                const matchedBin = bins.find(b => b.label === key);
                if (matchedBin && matchedBin.shortLabel) {
                    shortLabel = matchedBin.shortLabel;
                }
            } else if (nextAttribute == "genre") {
                shortLabel = GENRE_SHORT[key]
            }


            return {
                key,          // full label 
                shortLabel,   // short label 
                avgRating,
                titles: topTitles
            };
        });

        if (nextAttribute === "genre") {
            const genreOrder = new Map(this.stateManager.getTopGenres().map((g, i) => [g, i]));
            columns.sort((a, b) => {
                const ai = genreOrder.has(a.key) ? genreOrder.get(a.key) : Infinity;
                const bi = genreOrder.has(b.key) ? genreOrder.get(b.key) : Infinity;
                return ai - bi || d3.ascending(a.key, b.key);
            });
        }

        return {
            attribute: nextAttribute,
            columns
        };
    }
}