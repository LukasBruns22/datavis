import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export const HIERARCHY_LEVELS = ["type", "genre", "year", "runtime", "rating"];
const GENRE_LEVEL_INDEX = HIERARCHY_LEVELS.indexOf("genre");

const BINS = {
    runtime: [
        "Short (< 45 min)",
        "Standard (45-119 min)",
        "Long (120-179 min)",
        "Epic (> 180 min)"
    ],
    year: [
        "2000 - 2004",
        "2005 - 2009",
        "2010 - 2014",
        "2015 - 2019",
        "2020 - 2024"
    ],
    rating: [
        "Below Average (<6.0)",
        "Average (6.0-6.9)",
        "Good (7.0-7.9)",
        "Great (8.0-8.9)",
        "Excellent (9.0-10.0)"
    ]
};

export function getColor(attributeValue, stateManager) {
    const currentPath = stateManager.getCurrentPath(); // e.g., ["movies", "drama", "120-179min"]
    const currentAttribute = HIERARCHY_LEVELS[currentPath.length]

    // current attribute is "type"
    if (currentPath.length === 0) {
        return stateManager.getTypeColorScale()(attributeValue);
    }

    // current attribute is "genre"
    if (currentPath.length === 1) {
        return stateManager.getGenreColorScale()(attributeValue);
    }

    // Length > 1 → continuous attributes (runtime, year and rating)
    // Use genre (last categorical) as base color
    const baseColor = stateManager.getGenreColorScale()(currentPath[GENRE_LEVEL_INDEX]);
    const attributeBins = BINS[currentAttribute]

    const brightnessScale = d3.scaleLinear()
        .domain([0, attributeBins.length - 1])
        .range([-1, 1]); 

    const modificationAmount = brightnessScale(attributeBins.indexOf(attributeValue));
    const parsedColor = d3.color(baseColor);

    if (modificationAmount < 0) {
        // d.darker() takes a value > 0, so we use Math.abs()
        return parsedColor.darker(Math.abs(modificationAmount));
    } else {
        return parsedColor.brighter(modificationAmount);

    }
}

export function getRuntimeBin(runtime) {
    if (runtime >= 180) return "Epic (> 180 min)";
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