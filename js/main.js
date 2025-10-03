// --- Global variables for charts, data, and hierarchy definition ---
let sunburst, correlationPlot;
let flattenedData;

// --- Constants for Hierarchy Generation ---
const HIERARCHY_LEVELS = ["type", "genre", "year", "runtime", "rating"];
const TOP_N_GENRES = 10;

// ==================================================================
// === SINGLE SOURCE OF TRUTH FOR COLORS ============================
// ==================================================================

// These will be defined dynamically inside the data loading block
let genreColorScale, typeColorScale; 

// --- UPDATED Universal color function ---
function getSharedColor(d) {
    // Check if we're dealing with a sunburst node which has a 'depth' property
    if (d.depth) {
        // If it's the first level (type), use the type color scale
        if (d.depth === 1) {
            return typeColorScale(d.data.name);
        }
        // For deeper sunburst levels, find the genre and use the genre scale
        let genre;
        const genreNode = d.ancestors().find(a => HIERARCHY_LEVELS[a.depth - 1] === 'genre');
        if (genreNode) {
            genre = genreNode.data.name;
        }
        return genreColorScale(genre) || '#cccccc';
    }

    // Otherwise, it's a flat data point (for the correlation plot). Color it by genre.
    const item = d.data ? d.data : d; // Handles the {data: {genre: ...}} case from box plots
    return genreColorScale(item.genre) || '#cccccc';
}

function getRuntimeBin(runtime) {
    if (runtime >= 180) return "Epic (> 180 min)";
    if (runtime >= 120) return "Long (120-179 min)";
    if (runtime >= 45) return "Standard (45-119 min)";
    return "Short (< 45 min)";
}

// --- Helper for 5-year bins ---
function getYearBin(year) {
    const startYear = Math.floor(year / 5) * 5;
    const endYear = startYear + 4;
    return `${startYear} - ${endYear}`;
}

// --- Helper for human-readable rating bins ---
function getRatingBin(rating) {
    if (rating >= 9) return "Excellent (9.0-10.0)";
    if (rating >= 8) return "Great (8.0-8.9)";
    if (rating >= 7) return "Good (7.0-7.9)";
    if (rating >= 6) return "Average (6.0-6.9)";
    return "Below Average (<6.0)";
}

// --- 1. Load and Process Data ---
d3.json("data/02_CPI-31-Dataset.json").then(function(data) {
    // Flatten the data
    flattenedData = [];
    
    data.titles.forEach(item => {
        if ((item.titleType === 'movie' || item.titleType === 'tvSeries') && item.genres && item.genres.length > 0 && item.runtimeMinutes && item.averageRating && item.startYear) {
            item.genres.forEach(genre => {
                flattenedData.push({
                    type: item.titleType,
                    genre: genre,
                    year: +item.startYear,
                    runtime: +item.runtimeMinutes,
                    rating: +item.averageRating,
                    title: item.originalTitle
                });
            });
        }
    });

    
    flattenedData = flattenedData.filter(d => d.year <= 2024);
    

    const dispatcher = new Dispatcher();
    const stateManager = new StateManager();
    
    // --- UPDATED: Color Scale Definitions ---
    
    // Calculate top genres dynamically from the data
    const genreCounts = d3.rollup(flattenedData, v => v.length, d => d.genre);
    const sortedGenres = Array.from(genreCounts.entries()).sort((a, b) => b[1] - a[1]).map(d => d[0]);
    const topGenres = sortedGenres.slice(0, TOP_N_GENRES);

    genreColorScale = d3.scaleOrdinal()
        .domain(topGenres)
        .range(d3.schemeTableau10)
        .unknown("#cccccc");

    // Create a separate, distinct color scale for 'movie' and 'tvSeries'
    typeColorScale = d3.scaleOrdinal()
        .domain(['tvSeries', 'movie']) // <-- THIS IS THE CHANGED LINE
        .range(['#1f77b4', '#ff7f0e']); // Range is blue, then orange

    const hierarchicalData = { name: "Media", children: buildHierarchy(flattenedData, topGenres) };

    

    // --- 2. Initialize Charts ---
    sunburst = new SunburstChart("#sunburst-container", hierarchicalData, dispatcher, getSharedColor);
    correlationPlot = new CorrelationPlot("#correlation-chart-svg", flattenedData, getSharedColor, topGenres, dispatcher);
    const dropdown = new DropdownControl("#dropdown-container", HIERARCHY_LEVELS, dispatcher);

    // --- Central Event Listeners ---
    dispatcher.on('pathChange', (pathInfo) => {
        const currentPath = pathInfo.path;
        stateManager.setPath(currentPath, HIERARCHY_LEVELS);
        const filtered = stateManager.applyFilters(flattenedData);

        let attributeToPlot;
        if (pathInfo.isGoBack) { attributeToPlot = HIERARCHY_LEVELS[pathInfo.depth - 1]; } 
        else { attributeToPlot = HIERARCHY_LEVELS[pathInfo.depth] || 'rating'; }
        if (!attributeToPlot) { attributeToPlot = HIERARCHY_LEVELS[0]; }
        
        const attributeName = attributeToPlot.charAt(0).toUpperCase() + attributeToPlot.slice(1);
        d3.select("#correlation-title").text(`IMDb Rating vs ${attributeName}`);
        
        correlationPlot.update(filtered, attributeToPlot, currentPath);
        sunburst.update(currentPath);
    });

    dispatcher.on('jumpToAttribute', (attribute) => {
        const attributeName = attribute.charAt(0).toUpperCase() + attribute.slice(1);
        d3.select("#correlation-title").text(`Correlation: IMDb Rating vs ${attributeName}`);
        correlationPlot.update(flattenedData, attribute, []);
        sunburst.update([]);
    });

    // --- 3. Initial Draw ---
    sunburst.draw();
    correlationPlot.update(flattenedData, 'type', []);
    dropdown.render();

}).catch(function(error) {
    console.error("Error loading or processing data:", error);
});


// --- Build Hierarchy Function ---
function buildHierarchy(data, topGenres, level = 0) {
    if (level >= HIERARCHY_LEVELS.length) {
        return data.sort((a, b) => a.rating - b.rating)
            .slice(0, 10)
            .map(d => ({ name: d.title, value: 1, ...d }));
    }
    
    const currentLevel = HIERARCHY_LEVELS[level];
    const dominantGenre = d3.mode(data, d => d.genre);
    
    let childrenNodes;

    if (currentLevel === 'genre') {
        const genreBins = new Map();
        const otherData = [];
        
        data.forEach(d => {
            if (topGenres.includes(d.genre)) {
                if (!genreBins.has(d.genre)) genreBins.set(d.genre, []);
                genreBins.get(d.genre).push(d);
            } else { otherData.push(d); }
        });
        
        const children = Array.from(genreBins, ([genreName, genreData]) => ({
            name: genreName,
            children: buildHierarchy(genreData, topGenres, level + 1)
        }));
        
        children.sort((a, b) => topGenres.indexOf(a.name) - topGenres.indexOf(b.name));

        if (otherData.length > 0) {
            children.push({ name: "Other", children: buildHierarchy(otherData, topGenres, level + 1) });
        }
        
        childrenNodes = children.map(child => ({ 
            ...child,
            avgRating: d3.mean(child.children, d => d.avgRating),
            type: d3.mode(data, d => d.type), 
            genre: child.name 
        }));

    } else {
        let grouped;
        if (["runtime", "rating", "year"].includes(currentLevel)) {
            if (currentLevel === "rating") { grouped = d3.group(data, d => getRatingBin(d.rating)); } 
                else if (currentLevel === "runtime") {
                grouped = d3.group(data, d => getRuntimeBin(d.runtime));
            } else if (currentLevel === "year") { grouped = d3.group(data, d => getYearBin(d.year)); }
        } else { grouped = d3.group(data, d => d[currentLevel]); }
        
        childrenNodes = Array.from(grouped, ([key, values]) => ({
            name: key,
            children: buildHierarchy(values, topGenres, level + 1),
            avgRating: d3.mean(values, d => d.rating),
            type: d3.mode(values, d => d.type),
            genre: currentLevel === 'type' ? 'N/A' : dominantGenre
        }));
    }

    const ratingOrder = [ "Excellent (9.0-10.0)", "Great (8.0-8.9)", "Good (7.0-7.9)", "Average (6.0-6.9)", "Below Average (<6.0)" ];

    if (currentLevel === 'rating') {
        return childrenNodes.sort((a, b) => ratingOrder.indexOf(a.name) - ratingOrder.indexOf(b.name));
    } else if (['year', 'runtime'].includes(currentLevel)) {
        return childrenNodes.sort((a, b) => parseFloat(a.name) - parseFloat(b.name));
    }

    return childrenNodes;
}