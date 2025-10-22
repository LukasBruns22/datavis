import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getColor, capitalize, formatLabels } from "./helper.js";
import { HIERARCHY_LEVELS } from "./config.js"; 
import { TooltipManager } from "./tooltipManager.js"; 

export class DonutChart {
    constructor(svgSelector, initialData, stateManager, dispatcher) {
        this.svg = d3.select(svgSelector).append("svg");
        const { width, height } = this.svg.node().getBoundingClientRect();
        this.width = width;
        this.height = height;
        this.data = initialData;
        this.stateManager = stateManager;
        this.dispatcher = dispatcher;
        this.currentPath = [];
        this.hierarchyLevels = HIERARCHY_LEVELS;
        
        this.tooltip = new TooltipManager(d3.select("body"));

        this._setupChartArea();
        this.update(initialData);
    }

    _setupChartArea() {
        this.svg.selectAll("*").remove();

        const { width, height } = this.svg.node().getBoundingClientRect();
        this.size = Math.min(width, height);
        this.radius = this.size / 2;
        this.innerRadius = this.radius * 0.35;
        this.outerRadius = this.radius * 0.8;

        this.svg = this.svg
            .attr("viewBox", [-this.radius, -this.radius + 50, this.size, this.size])
            .style("font-family", "sans-serif");

        this.container = this.svg.append("g");

        this.arc = d3.arc()
            .innerRadius(this.innerRadius)
            .outerRadius(this.outerRadius);

        // Transparent circle to capture center clicks
        this.centerCircle = this.svg.append("circle")
            .attr("r", this.innerRadius)
            .attr("fill", "white")
            .attr("stroke", "#ccc")
            .attr("stroke-width", 2)
            .style("cursor", "pointer")
            .on("click", () => this._goBack());

        // Center label
        this.centerLabel = this.svg.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-weight", "bold")
            .style("font-size", "14px")
            .style("pointer-events", "none")
            .text("Type");
    }

    update(donutData) {
        this.currentPath = this.stateManager.getCurrentPath();
        const centerText = this.currentPath.length > 0
            ? this.currentPath[this.currentPath.length - 1]
            : "Type";
        this.centerLabel.text(capitalize(formatLabels(centerText)));

        const total = d3.sum(donutData, d => d.count);

        // Sort data based on current hierarchy level
        const currentLevel = this.currentPath.length;
        const currentAttribute = HIERARCHY_LEVELS[currentLevel];
        
        let sortedData = [...donutData];
        
        // Sort by year (chronological)
        if (currentAttribute === 'year') {
            sortedData.sort((a, b) => {
                const yearA = parseInt(a.name.split('-')[0]);
                const yearB = parseInt(b.name.split('-')[0]);
                return yearA - yearB;
            });
        }
        // Sort by rating (low to high)
        else if (currentAttribute === 'rating') {
            const ratingOrder = [
                "Below Average (<6.0)",
                "Average (6.0-6.9)",
                "Good (7.0-7.9)",
                "Great (8.0-8.9)",
                "Excellent (9.0-10.0)"
            ];
            sortedData.sort((a, b) => {
                const indexA = ratingOrder.indexOf(a.name);
                const indexB = ratingOrder.indexOf(b.name);
                return indexA - indexB;
            });
        }
        // Sort by runtime (short to long)
        else if (currentAttribute === 'runtime') {
            const runtimeOrder = [
                "Short (< 45 min)",
                "Standard (45-119 min)",
                "Long (120-179 min)",
                "Epic (>= 180 min)"
            ];
            sortedData.sort((a, b) => {
                const indexA = runtimeOrder.indexOf(a.name);
                const indexB = runtimeOrder.indexOf(b.name);
                return indexA - indexB;
            });
        }
        // Sort individual movies by rating (lowest to highest)
        else if (currentLevel === HIERARCHY_LEVELS.length) {
            const movies = this.stateManager.getCurrentTitles?.() || [];
            sortedData.sort((a, b) => {
                const movieA = movies.find(m => m.title === a.name);
                const movieB = movies.find(m => m.title === b.name);
                const ratingA = movieA?.rating ?? 0;
                const ratingB = movieB?.rating ?? 0;
                return ratingA - ratingB; // lowest to highest
            });
        }

        const pie = d3.pie()
            .sort(null)
            .value(() => 1); // equal-size arcs

        const arcs = pie(sortedData);

        // --- PATHS JOIN ---
        const paths = this.container.selectAll("path")
            .data(arcs, d => d.data.name);

        paths.exit()
            .transition().duration(300)
            .attr("fill-opacity", 0)
            .remove();

        const pathsEnter = paths.enter().append("path")
            .attr("fill", d => getColor(d.data.name, this.stateManager))
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .attr("fill-opacity", 0.9)
            .attr("d", this.arc)
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => this._showTooltip(event, d, total))
            .on("mousemove", (event) => this._moveTooltip(event))
            .on("mouseout", () => this._hideTooltip())
            .on("click", (event, d) => this._onClick(d));

        paths.merge(pathsEnter)
            .transition().duration(600)
            .attr("fill", d => getColor(d.data.name, this.stateManager))
            .attr("d", this.arc)
            .attr("fill-opacity", 0.9);

        const labels = this.container.selectAll("text.label")
            .data(arcs, d => d.data.name);

        labels.exit().remove();

        const labelsEnter = labels.enter().append("text")
            .attr("class", "label")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-size", "14px")
            .style("pointer-events", "none")
            .text(d => capitalize(formatLabels(d.data.shortName || d.data.name)));

        const innerRadius = this.innerRadius;
        const outerRadius = this.outerRadius;

        function labelTransform(d) {
            const angle = (d.startAngle + d.endAngle) / 2 * 180 / Math.PI;
            const r = (innerRadius + outerRadius) / 2;
            return `rotate(${angle - 90}) translate(${r},0) rotate(${angle < 180 ? 0 : 180})`;
        }

        const labelSelection = labelsEnter.merge(labels)
            .transition().duration(1000)
            .attr("transform", labelTransform)
            .attr("fill-opacity", 1)
            .selection();

        labelSelection.each(function (d) {
            const textEl = d3.select(this);
            const fullText = capitalize(formatLabels(d.data.shortName || d.data.name));

            const midRadius = (innerRadius + outerRadius) / 2;
            const arcAngle = d.endAngle - d.startAngle;
            const arcLength = midRadius * arcAngle;

            // Use 75% of arc length to ensure text doesn't overflow visually
            const maxTextWidth = arcLength * 0.75;

            textEl.text(fullText);
            let textWidth = this.getComputedTextLength();

            // Truncate text to fit
            if (textWidth > maxTextWidth) {
                let truncated = fullText;
                // Keep reducing until it fits
                while (truncated.length > 0) {
                    truncated = truncated.slice(0, -1);
                    textEl.text(truncated + "…");
                    textWidth = this.getComputedTextLength();
                    
                    if (textWidth <= maxTextWidth) {
                        break;
                    }
                }
                if (textWidth > maxTextWidth) {
                    textEl.text("…");
                }
            }
        });
    }

    _showTooltip(event, d, total) {
        const isLeaf = this.currentPath.length >= HIERARCHY_LEVELS.length - 1;
        const path = this.stateManager.getCurrentPath();
        const formatSegment = s => s
            ? capitalize(s)
            : s;

        const pathString = path.length
            ? path.map(formatSegment).join(" → ")
            : "All Media";

        // title
        if (isLeaf && d.data && d.data.count === 1 && d.data.avgRating) {
            const movies = this.stateManager.getCurrentTitles?.() || [];
            const movie = movies.find(m => m.title === d.data.name);

            if (movie) {
                const movieHeader = movie.title;
                const movieContent = `
                    <strong>Rating:</strong> ${movie.rating?.toFixed(1) ?? "N/A"} / 10<br>
                    <strong>Runtime:</strong> ${movie.runtime ? `${movie.runtime} min` : "N/A"}<br>
                    <strong>Year:</strong> ${movie.year ?? "N/A"}<br>
                    <strong>Genre:</strong> ${movie.genre ?? "N/A"}<br>
                    <strong>Type:</strong> ${movie.type === "movie" ? "Movie" : "TV Show"}
                `;
                this.tooltip.show({ header: movieHeader, content: movieContent }, event);
                return;
            }
        }

        // aggregated Category (Type / Genre / Runtime / Rating)
        const value = d.data.count;
        const percentageOfParent = ((value / total) * 100).toFixed(2);

        const displayName = capitalize(formatLabels(d.data.name));
        const pathMarkup = path.length
            ? `<div style="font-size: 12px; color: #bbb; margin-bottom: 8px;">
               <span style="font-weight: 500;">Path:</span> ${pathString}
           </div>`
            : "";
        
        const header = displayName;
        const content = `
            ${pathMarkup}
            <strong>Count:</strong> ${value.toLocaleString()}<br>
            ${percentageOfParent ? `<strong>Fraction of Parent:</strong> ${percentageOfParent}%` : ""}
        `;
        const footer = "Click to drill down";

        this.tooltip.show({ header, content, footer }, event);
    }
    _moveTooltip(event) {
        this.tooltip.move(event);
    }
    _hideTooltip() {
        this.tooltip.hide();
    }

    _onClick(d) {
        this.tooltip.hide();
        
        const newPath = [...this.currentPath, d.data.name];
        if (newPath.length <= HIERARCHY_LEVELS.length) {
            this.currentPath = newPath; // update current path
            this.centerLabel.text(capitalize(formatLabels(d.data.name)));

            if (this.dispatcher) {
                this.dispatcher.emit('pathChange', {
                    path: newPath,
                    depth: newPath.length,
                });
            }
        }
    }

    _goBack() {
        if (this.currentPath.length === 0) return;

        this.currentPath.pop();
        const centerText = this.currentPath.length > 0
            ? this.currentPath[this.currentPath.length - 1]
            : "Type";
        this.centerLabel.text(capitalize(formatLabels(centerText)));

        if (this.dispatcher) {
            this.dispatcher.emit('pathChange', {
                path: [...this.currentPath],
                depth: this.currentPath.length,
            });
        }
    }

    resize() {
        this._setupChartArea();
        this.update(this.data);
    }
}