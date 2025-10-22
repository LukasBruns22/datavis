import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getColor, capitalize, formatLabels } from "./helper.js";
import { HIERARCHY_LEVELS } from "./config.js"; // BINS and GENRE_LEVEL_INDEX removed
import { TooltipManager } from "./tooltipManager.js"; // <-- IMPORTED

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
        
        // --- INSTANTIATED (on body for safe positioning) ---
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

        // --- REMOVED old tooltip creation ---

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
        
        // --- _drawLegend() call removed ---

        const total = d3.sum(donutData, d => d.count);

        const pie = d3.pie()
            .sort(null)
            .value(() => 1); // equal-size arcs

        const arcs = pie(donutData);

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
            // --- MODIFIED to pass event ---
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
            .attr("fill-opacity", d => (d.endAngle - d.startAngle > 0.15 ? 1 : 0))
            .selection();

        labelSelection.each(function (d) {
            const textEl = d3.select(this);
            const fullText = capitalize(formatLabels(d.data.shortName || d.data.name));

            const midRadius = (innerRadius + outerRadius) / 2;
            const arcAngle = d.endAngle - d.startAngle;
            const arcLength = midRadius * arcAngle;

            textEl.text(fullText);

            const textWidth = this.getComputedTextLength();

            if (textWidth > arcLength * 0.9) {
                let truncated = fullText;
                while (truncated.length > 3 && this.getComputedTextLength() > arcLength * 0.9) {
                    truncated = truncated.slice(0, -1);
                    textEl.text(truncated + "…");
                }
            }
        });
    }

    // --- MODIFIED to use TooltipManager ---
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

        const displayName = capitalize(d.data.name);
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

    // --- ENTIRE _drawLegend() METHOD REMOVED ---

    // --- MODIFIED to use TooltipManager ---
    _moveTooltip(event) {
        this.tooltip.move(event);
    }

    // --- MODIFIED to use TooltipManager ---
    _hideTooltip() {
        this.tooltip.hide();
    }

    _onClick(d) {
        this.tooltip.hide(); // <-- ADDED
        
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