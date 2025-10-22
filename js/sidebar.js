import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { TooltipManager } from "./tooltipManager.js";
import { RATING_BINS, HIERARCHY_LEVELS, GENRE_LEVEL_INDEX, BINS } from "./config.js";
import { getColor, capitalize, formatLabels, getCurrentAttributeLabel } from "./helper.js";

export class Sidebar {
    constructor(selector, stateManager, dispatcher) {
        this.container = d3.select(selector);
        this.stateManager = stateManager;
        this.dispatcher = dispatcher;
        this.tooltip = new TooltipManager(d3.select("body"));
        this.ratingBins = RATING_BINS;
    }

    /**
     * Renders the static parts of the sidebar (Rating Scale)
     */
    render() {
        this.container.selectAll("*").remove(); // Clear container
        const currentAttribute = getCurrentAttributeLabel(this.stateManager)

        // --- 1. Rating Scale ---
        this.container.append("h2")
            .text("Rating Scale");
        
        this.ratingScaleContainer = this.container.append("div")
            .attr("id", "rating-scale-container");

        this.ratingBins.forEach(bin => {
            const item = this.ratingScaleContainer.append("div")
                .attr("class", "rating-scale-item")
                .on("mouseover", (event) => {
                    this.tooltip.show({
                        header: bin.label,
                        content: `${bin.domain[0]} - ${bin.domain[1]}`,
                        footer: null
                    }, event);
                })
                .on("mousemove", (event) => this.tooltip.move(event))
                .on("mouseout", () => this.tooltip.hide());

            item.append("div")
                .attr("class", "rating-scale-color")
                .style("background-color", bin.color);

            item.append("span")
                .attr("class", "rating-scale-label")
                .text(bin.label);
        });

        // --- 2. Legend ---
        this.container.append("h2")
            .text(`${currentAttribute} Legend`);
        
        this.legendSvg = this.container.append("svg")
            .attr("id", "legend-svg");
        
        this.legendGroup = this.legendSvg.append("g")
            .attr("class", "legend-group"); // Transform will be set in update
    }

    /**
     * Updates the dynamic legend based on the current drill-down state.
     */
    update() {
        // Clear previous legend
        this.legendGroup.selectAll("*").remove();
        
        const groupY = 20; // This is our top padding
        this.legendGroup.attr("transform", `translate(5, ${groupY})`);
        
        const defs = this.legendSvg.select("defs").empty() 
            ? this.legendSvg.append("defs") 
            : this.legendSvg.select("defs");

        const currentLevel = this.stateManager.getCurrentPath().length;
        const currentAttribute = HIERARCHY_LEVELS[currentLevel];
        const legendItemSize = 15; 
        const legendSpacing = 5;
        const legendItemHeight = legendItemSize + legendSpacing;

        // Get sidebar width for dynamic truncation
        const sidebarWidth = this.container.node().getBoundingClientRect().width;

        // type
        if (currentLevel === 0) {
            const typeData = ["movie", "tvSeries"];
            const typeScale = this.stateManager.getTypeColorScale();

            const items = this.legendGroup.selectAll(".legend-item")
                .data(typeData)
                .join("g")
                .attr("class", "legend-item")
                .attr("transform", (d, i) => `translate(0, ${i * legendItemHeight})`);

            items.append("rect")
                .attr("width", legendItemSize)
                .attr("height", legendItemSize)
                .attr("rx", 3).attr("ry", 3)
                .style("fill", d => typeScale(d));

            items.append("text")
                .attr("x", legendItemSize + legendSpacing)
                .attr("y", legendItemSize / 2)
                .attr("dy", "0.35em")
                .text(d => capitalize(formatLabels(d)));
        }

        // genre
        else if (currentLevel === 1) {
            const genreScale = this.stateManager.getGenreColorScale();
            const genreData = [...this.stateManager.topGenres ?? [], "Other"];

            const items = this.legendGroup.selectAll(".legend-item")
                .data(genreData)
                .join("g")
                .attr("class", "legend-item")
                .attr("transform", (d, i) => `translate(0, ${i * legendItemHeight})`);

            items.append("rect")
                .attr("width", legendItemSize)
                .attr("height", legendItemSize)
                .attr("rx", 3).attr("ry", 3)
                .style("fill", d => genreScale(d));

            items.append("text")
                .attr("x", legendItemSize + legendSpacing)
                .attr("y", legendItemSize / 2)
                .attr("dy", "0.35em")
                .text(d => capitalize(formatLabels(d)))
                .each(function(d) {
                    const text = d3.select(this);
                    const labelText = capitalize(formatLabels(d));
                    
                    const padding = 15; // 5px g-translate + 10px extra
                    const textX = legendItemSize + legendSpacing;
                    const availableWidth = sidebarWidth - textX - padding;
                    
                    if (text.node().getBBox().width > availableWidth) {
                        let currentLabel = labelText;
                        while (text.node().getBBox().width > availableWidth && currentLabel.length > 3) {
                            currentLabel = currentLabel.slice(0, -1);
                            text.text(currentLabel + '...');
                        }
                    }
                });
        }

        // continuous attributes (runtime, year, rating)
        else if (currentLevel >= 2 && currentLevel < HIERARCHY_LEVELS.length && currentAttribute) {
            const baseGenre = this.stateManager.getCurrentPath()[GENRE_LEVEL_INDEX];
            const baseColor = d3.color(this.stateManager.getGenreColorScale()(baseGenre));
            const bins = BINS[currentAttribute];

            if (!bins || !baseColor) {
                this.legendSvg.attr("height", 0);
                return;
            };

            const colorScale = d3.scaleLinear()
                .domain([0, bins.length - 1])
                .range([-1, 1]); 

            const colorStops = bins.map((b, i) => {
                const mod = colorScale(i);
                const c = mod < 0 ? baseColor.darker(Math.abs(mod)) : baseColor.brighter(mod);
                return c.formatHex();
            });

            const gradientId = `legend-gradient-${currentAttribute}`;
            defs.select(`#${gradientId}`).remove(); 

            const gradient = defs.append("linearGradient")
                .attr("id", gradientId)
                .attr("x1", "0%").attr("x2", "0%") 
                .attr("y1", "0%").attr("y2", "100%"); 

            const n = colorStops.length;
            colorStops.forEach((color, i) => {
                const start = (i / n) * 100;
                const end = ((i + 1) / n) * 100;
                gradient.append("stop")
                    .attr("offset", `${start}%`)
                    .attr("stop-color", color);
                gradient.append("stop")
                    .attr("offset", `${end}%`)
                    .attr("stop-color", color);
            });
            
            const rectWidth = "100%"; 
            
            // --- MODIFIED: Increased height ---
            const rectHeight = 150; // <-- Increased from 100

            this.legendGroup.append("rect")
                .attr("width", rectWidth)
                .attr("height", rectHeight)
                .style("fill", `url(#${gradientId})`)
                .style("stroke", "#ccc")
                .style("stroke-width", 1);

            let startLabel = "", endLabel = "";
            if (currentAttribute === "year") { startLabel = "Older"; endLabel = "Newer"; }
            else if (currentAttribute === "runtime") { startLabel = "Shorter"; endLabel = "Longer"; }
            else if (currentAttribute === "rating") { startLabel = "Lower"; endLabel = "Higher"; }

            this.legendGroup.append("text")
                .text(startLabel)
                .attr("x", 0)
                .attr("y", 0)
                .attr("dy", "-0.5em") 
                .style("font-weight", 500);

            this.legendGroup.append("text")
                .text(endLabel)
                .attr("x", 0)
                .attr("y", rectHeight) 
                .attr("dy", "1.2em") 
                .style("font-weight", 500);
        }

        // individual movies - show brightness gradient based on genre
        else if (currentLevel === HIERARCHY_LEVELS.length) {
            const baseGenre = this.stateManager.getCurrentPath()[GENRE_LEVEL_INDEX];
            const baseColor = d3.color(this.stateManager.getGenreColorScale()(baseGenre));

            if (!baseColor) {
                this.legendSvg.attr("height", 0);
                return;
            }

            const gradientId = 'legend-gradient-movies';
            defs.select(`#${gradientId}`).remove();

            const gradient = defs.append("linearGradient")
                .attr("id", gradientId)
                .attr("x1", "0%").attr("x2", "0%")
                .attr("y1", "0%").attr("y2", "100%");

            // Create smooth gradient from darker to brighter
            // Matching the brightness range used in getColor: [-0.8, 0.8]
            const numStops = 20;
            for (let i = 0; i <= numStops; i++) {
                const t = i / numStops;
                const brightnessValue = -0.8 + (t * 1.6); // -0.8 to 0.8
                
                const color = brightnessValue < 0
                    ? baseColor.darker(Math.abs(brightnessValue))
                    : baseColor.brighter(brightnessValue);
                
                gradient.append("stop")
                    .attr("offset", `${t * 100}%`)
                    .attr("stop-color", color.formatHex());
            }

            const rectWidth = "100%";
            const rectHeight = 150;

            this.legendGroup.append("rect")
                .attr("width", rectWidth)
                .attr("height", rectHeight)
                .style("fill", `url(#${gradientId})`)
                .style("stroke", "#ccc")
                .style("stroke-width", 1);

            this.legendGroup.append("text")
                .text("Lower")
                .attr("x", 0)
                .attr("y", 0)
                .attr("dy", "-0.5em")
                .style("font-weight", 500);

            this.legendGroup.append("text")
                .text("Higher")
                .attr("x", 0)
                .attr("y", rectHeight)
                .attr("dy", "1.2em")
                .style("font-weight", 500);
        }
        
        // Dynamic Height Calculation (no changes needed here)
        const bbox = this.legendGroup.node().getBBox();
        const totalHeight = groupY + bbox.y + bbox.height + 15; 
        
        if (totalHeight > 30) {
            this.legendSvg.attr("height", totalHeight);
        } else {
            this.legendSvg.attr("height", 0);
        }
    }
}