// --- Global variables for charts, data, and hierarchy definition ---
let sunburst, correlationPlot;
let flattenedData;

// --- Constants for Hierarchy Generation ---
const HIERARCHY_LEVELS = ["type", "genre", "year", "runtime", "rating"];
const TOP_N_GENRES = 10;

// ==================================================================
// === COLOR SYSTEM DEFINITION ======================================
// ==================================================================
const TOP_GENRES_FOR_COLOR = ['Drama', 'Comedy', 'Action', 'Adventure', 'Crime', 'Thriller', 'Romance', 'Sci-Fi', 'Horror', 'Fantasy'];

const genreColorScale = d3.scaleOrdinal()
    .domain(TOP_GENRES_FOR_COLOR)
    .range(d3.schemeTableau10);

// Declare the scale variables here, but don't define them yet.
let ratingSaturationScale, yearSaturationScale, runtimeSaturationScale;

function getColor(d, saturationAttribute = null) {
    const node = d.data ? d.data : d;

    // 1. DETERMINE HUE FROM GENRE
    let genre = node.genre;
    
    // For sunburst nodes, handle hierarchy traversal
    if (!genre && d.ancestors) {
        const genreNode = d.ancestors().find(a => HIERARCHY_LEVELS[a.depth - 1] === 'genre');
        if (genreNode) genre = genreNode.data.name;
    }
    
    // Special handling for type-level nodes in sunburst
    if (!genre || !TOP_GENRES_FOR_COLOR.includes(genre)) {
        // If we're at type level, use the most common genre for that type
        if (d.depth === 1 && d.data) { // This is a type-level node in sunburst
            // Get the dominant top genre for this type
            genre = getDominantTopGenreForType(d.data.name);
        }
    }
    
    if (!genre || !TOP_GENRES_FOR_COLOR.includes(genre)) {
        return '#cccccc';
    }
    
    const baseHue = genreColorScale(genre);
    const hslColor = d3.hsl(baseHue);

    // 2. DETERMINE LIGHTNESS FROM TYPE
    const type = node.type || (d.ancestors ? d.ancestors().find(a => a.depth === 1)?.data.name : null);
    hslColor.l = (type === 'tvSeries') ? 0.75 : 0.5;

    // 3. DETERMINE SATURATION BASED ON THE PROVIDED ATTRIBUTE
    if (saturationAttribute === 'year' && node.year && yearSaturationScale) {
        hslColor.s = yearSaturationScale(node.year);
    } else if (saturationAttribute === 'runtime' && node.runtime && runtimeSaturationScale) {
        hslColor.s = runtimeSaturationScale(node.runtime);
    } else if (saturationAttribute === 'rating' && node.rating && ratingSaturationScale) {
        hslColor.s = ratingSaturationScale(node.rating);
    } else {
        hslColor.s = 0.8;
    }

    return hslColor.toString();
}

// Helper function to get dominant top genre for a given type
function getDominantTopGenreForType(type) {
    const typeData = flattenedData.filter(d => d.type === type);
    const genreCounts = d3.rollup(typeData, v => v.length, d => d.genre);
    
    // Find the most common genre that's in our top genres
    const sortedGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(d => d[0]);
    
    return sortedGenres.find(genre => TOP_GENRES_FOR_COLOR.includes(genre)) || TOP_GENRES_FOR_COLOR[0];
}

// --- Helper for 5-year bins ---
function getYearBin(year) {
    const startYear = Math.floor(year / 5) * 5;
    const endYear = startYear + 4;
    return `${startYear} - ${endYear}`;
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

    // =========================================================
    // === CALCULATE EXTENTS *AFTER* POPULATING DATA ===
    // =========================================================
    const yearExtent = d3.extent(flattenedData, d => d.year);
    const runtimeExtent = d3.extent(flattenedData, d => d.runtime);

    // Now that we have the extents, we can define our scales
    ratingSaturationScale = d3.scaleLinear().domain([1, 10]).range([0.3, 1.0]).clamp(true);
    yearSaturationScale = d3.scaleLinear().domain(yearExtent).range([0.3, 1.0]).clamp(true);
    runtimeSaturationScale = d3.scaleLinear().domain(runtimeExtent).range([0.3, 1.0]).clamp(true);
    // =========================================================

    const genreCounts = d3.rollup(flattenedData, v => v.length, d => d.genre);
    const sortedGenres = Array.from(genreCounts.entries()).sort((a, b) => b[1] - a[1]).map(d => d[0]);
    const hierarchicalData = { name: "Media", children: buildHierarchy(flattenedData, sortedGenres) };

    // --- 2. Initialize Charts ---
    correlationPlot = new CorrelationPlot("#correlation-chart-svg", flattenedData, getColor, TOP_GENRES_FOR_COLOR);
    sunburst = new SunburstChart("#sunburst-container", hierarchicalData, handleSunburstClick, getColor);

    // --- 3. Initial Draw ---
    sunburst.draw();
    correlationPlot.update(flattenedData, 'type');

    createDropdown(HIERARCHY_LEVELS);

}).catch(function(error) {
    console.error("Error loading or processing data:", error);
});

function handleSunburstClick(path, depth) {
    let filtered = [...flattenedData];
    path.forEach((filterValue, i) => {
        const attribute = HIERARCHY_LEVELS[i];
        if (typeof filterValue === 'string' && filterValue.includes(' - ')) {
            const [min, max] = filterValue.split(' - ').map(parseFloat);
            filtered = filtered.filter(d => d[attribute] >= min && d[attribute] <= max);
        } else if (filterValue !== "Other" && filterValue !== "Media") {
            filtered = filtered.filter(d => String(d[attribute]) === String(filterValue));
        }
    });
    const nextAttribute = HIERARCHY_LEVELS[depth] || 'rating';
    correlationPlot.update(filtered, nextAttribute);
}

function buildHierarchy(data, sortedGenres, level = 0) {
    const avgRating = d3.mean(data, d => d.rating);
    const dominantType = d3.mode(data, d => d.type);
    const dominantGenre = d3.mode(data, d => d.genre);
    
    if (level >= HIERARCHY_LEVELS.length - 1 || data.length < 20) {
        return data.sort((a, b) => b.rating - a.rating).slice(0, 10)
            .map(d => ({ name: d.title, value: 1, ...d }));
    }
    
    const currentLevel = HIERARCHY_LEVELS[level];
    
    if (currentLevel === 'genre') {
        const topN = sortedGenres.slice(0, TOP_N_GENRES);
        const genreBins = new Map();
        const otherData = [];
        
        data.forEach(d => {
            if (topN.includes(d.genre)) {
                if (!genreBins.has(d.genre)) genreBins.set(d.genre, []);
                genreBins.get(d.genre).push(d);
            } else { 
                otherData.push(d); 
            }
        });
        
        const children = Array.from(genreBins, ([genreName, genreData]) => ({
            name: genreName,
            children: buildHierarchy(genreData, sortedGenres, level + 1)
        }));
        
        if (otherData.length > 0) {
            children.push({ 
                name: "Other", 
                children: buildHierarchy(otherData, sortedGenres, level + 1) 
            });
        }
        
        return children.map(child => ({ 
            ...child, 
            avgRating, 
            type: dominantType, 
            genre: child.name 
        }));
    }
    
    let grouped;
    if (["runtime", "rating", "year"].includes(currentLevel)) {
        const domain = data.map(d => d[currentLevel]);
        if (["runtime", "rating"].includes(currentLevel)) {
        // Keep the original numeric binning for runtime and rating
        const domain = data.map(d => d[currentLevel]);
        const quantiles = d3.scaleQuantile().domain(domain).range(["Q1", "Q2", "Q3", "Q4"]);
        grouped = d3.group(data, d => {
            const [min, max] = quantiles.invertExtent(quantiles(d[currentLevel]));
            return `${d3.format(".1f")(min)} - ${d3.format(".1f")(max)}`;
        });
    } else if (currentLevel === "year") {
        // NEW: 5-year bins for year
        grouped = d3.group(data, d => {
            const startYear = Math.floor(d.year / 5) * 5;
            const endYear = startYear + 4;
            return `${startYear} - ${endYear}`;
        });
} else {
    grouped = d3.group(data, d => d[currentLevel]);
}
    } else {
        grouped = d3.group(data, d => d[currentLevel]);
    }
    
    return Array.from(grouped, ([key, values]) => ({
        name: key,
        children: buildHierarchy(values, sortedGenres, level + 1),
        avgRating: d3.mean(values, d => d.rating),
        type: d3.mode(values, d => d.type),
        // FIXED: For type level (level 0), use the dominant top genre for that type
        genre: currentLevel === 'type' ? getDominantTopGenreForType(key) : dominantGenre
    }));
}

function createDropdown(attributes) {
    const container = d3.select("#dropdown-container");
    container.selectAll("*").remove();

    container.append("label")
        .attr("for", "attribute-dropdown")
        .text("Jump to Attribute")
        .style("margin-right", "8px");

    const dropdown = container.append("select")
        .attr("id", "attribute-dropdown")
        .style("max-width", "50%");
        

    dropdown.selectAll("option")
        .data(attributes)
        .enter()
        .append("option")
        .attr("value", d => d)
        .text(d => d.charAt(0).toUpperCase() + d.slice(1));

    dropdown.on("change", function(event) {
        const selected = d3.select(this).property("value");
        correlationPlot.update(flattenedData, selected);
        d3.select("#correlation-title").text(`Correlation: IMDb Rating vs ${selected}`);
    });
}