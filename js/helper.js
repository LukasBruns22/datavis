import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { HIERARCHY_LEVELS, BINS, GENRE_LEVEL_INDEX } from "./config.js";

export function capitalize(val) {
    return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

export function formatLabels(name) {
    if (typeof name !== 'string') return name;
    if (name === 'movie') return 'Movies';
    if (name === 'tvSeries') return 'TV Shows';
    return name;
}

export function getColor(attributeValue, stateManager) {
    const currentPath = stateManager.getCurrentPath();
    const currentLevel = currentPath.length;
    const currentAttribute = HIERARCHY_LEVELS[currentLevel];

    // type
    if (currentLevel === 0) {
        return stateManager.getTypeColorScale()(attributeValue);
    }

    // genre
    if (currentLevel === 1) {
        return stateManager.getGenreColorScale()(attributeValue);
    }

    // continuous attributes or movies
    const baseGenre = currentPath[GENRE_LEVEL_INDEX] || currentPath[1]; // fallback
    const baseColor = d3.color(stateManager.getGenreColorScale()(baseGenre));

    // continuous attributes (runtime, year, rating)
    if (BINS[currentAttribute]) {
        const attributeBins = BINS[currentAttribute];

        // Find index of the bin object by matching label
        const binIndex = attributeBins.findIndex(b => b.label === attributeValue);
        if (binIndex >= 0) {
            const brightnessScale = d3.scaleLinear()
                .domain([0, attributeBins.length - 1])
                .range([-1, 1]);

            const modificationAmount = brightnessScale(binIndex);
            return modificationAmount < 0
                ? baseColor.darker(Math.abs(modificationAmount))
                : baseColor.brighter(modificationAmount);
        }
    }

    // --- Last Level: Movies (no bins) ---
    const movies = stateManager.getCurrentTitles?.() || [];
    
    // Sort movies by rating (lowest to highest) to ensure consistent color mapping
    const sortedMovies = [...movies].sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0));
    
    const index = sortedMovies.findIndex(m => m.title === attributeValue);
    const total = Math.max(sortedMovies.length, 1);

    const brightnessScale = d3.scaleLinear()
        .domain([0, total - 1])
        .range([-0.8, 0.8]); // index 0 (lowest rating) = darker, last index (highest rating) = brighter

    const modificationAmount = brightnessScale(index);
    return modificationAmount < 0
        ? baseColor.darker(Math.abs(modificationAmount))
        : baseColor.brighter(modificationAmount);
}

export function getRuntimeBin(runtime) {
    if (runtime >= 180) return "Epic (>= 180 min)";
    if (runtime >= 120) return "Long (120-179 min)";
    if (runtime >= 45) return "Standard (45-119 min)";
    return "Short (< 45 min)";
}

export function getYearBin(year) {
    const startYear = Math.floor(year / 5) * 5;
    const endYear = startYear + 4;
    return `${startYear} - ${endYear}`;
}

export function getRatingBin(rating) {
    if (rating >= 9) return "Excellent (9.0-10.0)";
    if (rating >= 8) return "Great (8.0-8.9)";
    if (rating >= 7) return "Good (7.0-7.9)";
    if (rating >= 6) return "Average (6.0-6.9)";
    return "Below Average (<6.0)";
}

export const BINNING_FUNCTIONS = {
    runtime: getRuntimeBin,
    year: getYearBin,
    rating: getRatingBin
};

export function groupByAttribute(data, attribute) {
    if (attribute === "year") return d3.group(data, d => getYearBin(d.year));
    if (attribute === "runtime") return d3.group(data, d => getRuntimeBin(d.runtime));
    if (attribute === "rating") return d3.group(data, d => getRatingBin(d.rating));
    return d3.group(data, d => d[attribute]);
}

export function getCurrentAttributeLabel(stateManager) {
    const currentPath = stateManager.getCurrentPath();
    const currentAttribute = HIERARCHY_LEVELS[currentPath.length]

    return capitalize(currentAttribute)
}