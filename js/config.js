export const HIERARCHY_LEVELS = ["type", "genre", "year", "runtime", "rating"];
export const GENRE_LEVEL_INDEX = HIERARCHY_LEVELS.indexOf("genre");
export const TOP_N_GENRES = 10;

export const BINS = {
    runtime: [
        { label: "Short (< 45 min)", shortLabel: "Short", min: 0, max: 44 },
        { label: "Standard (45-119 min)", shortLabel: "Standard", min: 45, max: 119 },
        { label: "Long (120-179 min)", shortLabel: "Long", min: 120, max: 179 },
        { label: "Epic (>= 180 min)", shortLabel: "Epic", min: 180, max: Infinity }
    ],
    rating: [
        { label: "Below Average (<6.0)", shortLabel: "Below Avg", min: 0, max: 5.99 },
        { label: "Average (6.0-6.9)", shortLabel: "Average", min: 6.0, max: 6.9 },
        { label: "Good (7.0-7.9)", shortLabel: "Good", min: 7.0, max: 7.9 },
        { label: "Great (8.0-8.9)", shortLabel: "Great", min: 8.0, max: 8.9 },
        { label: "Excellent (9.0-10.0)", shortLabel: "Excellent", min: 9.0, max: 10.0 }
    ],
    year: [
        { label: "2000 - 2004", shortLabel: "2000-04", min: 2000, max: 2004 },
        { label: "2005 - 2009", shortLabel: "2005-09", min: 2005, max: 2009 },
        { label: "2010 - 2014", shortLabel: "2010-14", min: 2010, max: 2014 },
        { label: "2015 - 2019", shortLabel: "2015-19", min: 2015, max: 2019 },
        { label: "2020 - 2024", shortLabel: "2020-24", min: 2020, max: 2024 }
    ]
};