// --- Global variables for charts, data, and hierarchy definition ---
let sunburst, correlationPlot;
let flattenedData;
let currentFilterPath = []; // Track current drill-down path
let currentAttribute = 'type'; // Track current attribute being displayed

// --- Constants for Hierarchy Generation ---
const HIERARCHY_LEVELS = ["type", "genre", "year", "runtime", "rating"];
const TOP_N_GENRES = 10;

// ==================================================================
// === COLOR SYSTEM DEFINITION ======================================
// ==================================================================
const TOP_GENRES_FOR_COLOR = ['Drama', 'Comedy', 'Action', 'Adventure', 'Crime', 'Thriller', 'Romance', 'Sci-Fi', 'Horror', 'Fantasy'];

// The color scale mapping genres to the Tableau 10 palette
const genreColorScale = d3.scaleOrdinal()
    .domain(TOP_GENRES_FOR_COLOR)
    .range(d3.schemeTableau10);

/**
 * A simpler color function that returns a color based on genre.
 * @param {object} d The data object for the item being colored.
 * @returns {string} A hex color string.
 */
function getColor(d) {
    // The node can be structured differently depending on the chart
    const node = d.data ? d.data : d;
    const genre = node.genre || node.dominantGenre;

    // Use a special grey for any genre not in our main list (like 'Other')
    if (!genre || !TOP_GENRES_FOR_COLOR.includes(genre)) {
        return '#888888'; // A medium grey
    }

    // For all top genres, return the color from the Tableau 10 scale
    return genreColorScale(genre);
}

// This helper function is still used by the buildHierarchy function
function getDominantTopGenreForType(type) {
    const typeData = flattenedData.filter(d => d.type === type);
    const genreCounts = d3.rollup(typeData, v => v.length, d => d.genre);
    
    const sortedGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(d => d[0]);
    
    return sortedGenres.find(genre => TOP_GENRES_FOR_COLOR.includes(genre)) || TOP_GENRES_FOR_COLOR[0];
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

function updateTitle() {
    const titleElement = d3.select("#correlation-title");
    if (currentFilterPath.length === 0) {
        titleElement.text("IMDb Rating by Media Type");
        return;
    }

    const lastFilter = currentFilterPath[currentFilterPath.length - 1];
    let title = "";

    if (currentAttribute === 'genre') {
        title = `${lastFilter === 'movie' ? 'Movie' : 'TV Show'} Ratings by Genre`;
    } else if (currentAttribute === 'year') {
        title = `${lastFilter} Ratings by Year`;
    } else if (['runtime', 'rating'].includes(currentAttribute)) {
        const genre = currentFilterPath[1] || 'Media';
        title = `Runtime vs. Rating for ${genre}`;
    } else {
        title = `Correlation View for ${lastFilter}`;
    }
    titleElement.text(title);
}
// --- Create breadcrumb navigation ---
function createBreadcrumb() {
    const container = d3.select("#correlation-container") || d3.select("body");
    
    // Remove existing breadcrumb
    container.select(".breadcrumb-container").remove();
    
    // Create breadcrumb container
    const breadcrumbContainer = container.insert("div", ":first-child")
        .attr("class", "breadcrumb-container")
        .style("margin-bottom", "10px")
        .style("padding", "10px")
        .style("background-color", "#f8f9fa")
        .style("border-radius", "5px")
        .style("border", "1px solid #e9ecef");

    // Add title
    breadcrumbContainer.append("span")
        .style("font-weight", "bold")
        .style("margin-right", "10px")
        .text("Current View:");

    // Add breadcrumb items
    const breadcrumbItems = breadcrumbContainer.selectAll(".breadcrumb-item")
        .data([{name: "All Data", level: -1}].concat(currentFilterPath.map((item, i) => ({name: item, level: i}))))
        .enter()
        .append("span")
        .attr("class", "breadcrumb-item");

    breadcrumbItems
        .style("cursor", "pointer")
        .style("color", "#007bff")
        .style("text-decoration", "underline")
        .style("margin-right", "5px")
        .text(d => d.name)
        .on("click", function(event, d) {
            // Navigate back to this level
            if (d.level === -1) {
                // Reset to root
                currentFilterPath = [];
                currentAttribute = 'type';
                correlationPlot.update(flattenedData, currentAttribute);
            } else {
                // Navigate to specific level
                currentFilterPath = currentFilterPath.slice(0, d.level + 1);
                const filteredData = applyCurrentFilters();
                currentAttribute = HIERARCHY_LEVELS[currentFilterPath.length] || 'rating';
                correlationPlot.update(filteredData, currentAttribute);
            }
            createBreadcrumb(); // Update breadcrumb
        })
        .on("mouseover", function() {
            d3.select(this).style("color", "#0056b3");
        })
        .on("mouseout", function() {
            d3.select(this).style("color", "#007bff");
        });

    // Add separators
    breadcrumbItems.filter((d, i) => i < breadcrumbItems.size() - 1)
        .append("span")
        .style("margin", "0 5px")
        .style("color", "#6c757d")
        .text(">");

    // Add current attribute info
    breadcrumbContainer.append("span")
        .style("margin-left", "15px")
        .style("font-style", "italic")
        .style("color", "#6c757d")
        .text(`Showing: ${currentAttribute.charAt(0).toUpperCase() + currentAttribute.slice(1)} vs Rating`);
}

// --- Apply current filter path to get filtered data ---
function applyCurrentFilters() {
    let filtered = [...flattenedData];
    
    currentFilterPath.forEach((filterValue, i) => {
        const attribute = HIERARCHY_LEVELS[i];
        if (typeof filterValue === 'string' && filterValue.includes(' - ')) {
            const [min, max] = filterValue.split(' - ').map(parseFloat);
            filtered = filtered.filter(d => d[attribute] >= min && d[attribute] <= max);
        } else if (filterValue !== "Other" && filterValue !== "Media") {
            filtered = filtered.filter(d => String(d[attribute]) === String(filterValue));
        }
    });
    
    return filtered;
}

// --- Enhanced correlation plot click handler ---
function handleCorrelationClick(path, depth) {
    let filtered = [...flattenedData];
    
    // Apply the current filter path first
    currentFilterPath.forEach((filterValue, i) => {
        const attribute = HIERARCHY_LEVELS[i];
        if (typeof filterValue === 'string' && filterValue.includes(' - ')) {
            const [min, max] = filterValue.split(' - ').map(parseFloat);
            filtered = filtered.filter(d => d[attribute] >= min && d[attribute] <= max);
        } else if (filterValue !== "Other" && filterValue !== "Media") {
            filtered = filtered.filter(d => String(d[attribute]) === String(filterValue));
        }
    });
    
    // Apply the new filter from the click
    path.forEach((filterValue, i) => {
        const attribute = HIERARCHY_LEVELS[currentFilterPath.length + i];
        if (typeof filterValue === 'string' && filterValue.includes(' - ')) {
            const [min, max] = filterValue.split(' - ').map(parseFloat);
            filtered = filtered.filter(d => d[attribute] >= min && d[attribute] <= max);
        } else if (filterValue !== "Other" && filterValue !== "Media") {
            filtered = filtered.filter(d => String(d[attribute]) === String(filterValue));
        }
    });
    
    // Update filter path
    currentFilterPath = [...currentFilterPath, ...path];
    
    // Determine next attribute to show
    currentAttribute = HIERARCHY_LEVELS[currentFilterPath.length] || 'rating';
    
    // Update correlation plot
    correlationPlot.update(filtered, currentAttribute);
    
    // Also update sunburst if needed
    if (sunburst && typeof sunburst.highlightPath === 'function') {
        sunburst.highlightPath(currentFilterPath);
    }
    updateTitle();
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
    correlationPlot = new CorrelationPlot("#correlation-chart-svg", flattenedData, getColor, TOP_GENRES_FOR_COLOR, handleCorrelationClick);
    sunburst = new SunburstChart("#sunburst-container", hierarchicalData, handleSunburstClick, getColor);

    // --- 3. Initial Draw ---
    sunburst.draw();
    correlationPlot.update(flattenedData, currentAttribute);

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