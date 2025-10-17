import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { formatLabels, capitalize, getColor } from "./helper.js";
import { BINS, HIERARCHY_LEVELS } from "./config.js";

/* 
TODO:
- Stop Heatmap drilldown at runtime
- Implement tooltips
- Summarize episodes to a single series in dataprocessor
- When clicking on a series, use series heatmap.
- Better color scale
*/

export class RatingHeatmap {
    constructor(containerSelector, initalData, stateManager, dispatcher) {
        this.container = d3.select(containerSelector);
        this.svg = this.container.append("svg");
        this.stateManager = stateManager;
        const { width, height } = this.svg.node().getBoundingClientRect();
        this.width = width;
        this.height = height;
        this.data = initalData
        this.dispatcher = dispatcher
        this.margin = { top: 20, right: 0, bottom: 0, left: 20 };
        this.currentPath = stateManager.getCurrentPath()
        this.resize()
        this.update(this.data)
    }

    resize() {
        const rect = this.container.node().getBoundingClientRect();
        this.width = rect.width - this.margin.left - this.margin.right;
        this.height = rect.height - this.margin.top - this.margin.bottom;
        this.svg.attr("viewBox", `0 0 ${rect.width} ${rect.height}`);
    }

    update(heatmapData) {
        if (!heatmapData) {
            return;
        }
        this.currentPath = this.stateManager.getCurrentPath()
        const { attribute, columns } = heatmapData;
        const nCols = columns.length;
        const colWidth = (this.width - this.margin.left - this.margin.right) / nCols;
        const rowHeight = 50;

        const genreColor = this.stateManager.getGenreColorScale();
        const ratingColor = this.stateManager.getRatingColorScale();

        const g = this.svg.selectAll(".heatmap-g")
            .data([null])
            .join("g")
            .attr("class", "heatmap-g")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

        g.selectAll("*").remove();

        const tooltip = this.container.append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("padding", "20px 30px")
            .style("background", "rgba(0, 0, 0, 0.85)")
            .style("color", "white")
            .style("font-size", "15px")
            .style("pointer-events", "none")
            .style("opacity", 0)
            .style("border-radius", "8px")
            .style("max-width", "400px");

        // header row: average rating per column
        const header = g.selectAll(".header-cell")
            .data(columns)
            .join("g")
            .attr("class", "header-cell")
            .attr("transform", (d, i) => `translate(${i * colWidth}, 0)`)
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => {
                tooltip.transition().duration(150).style("opacity", 1);
                const path = this.stateManager.getCurrentPath();
            })
            .on("mousemove", (event) => {
                tooltip
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseout", () => {
                tooltip.transition().duration(150).style("opacity", 0);
            });


        header.append("rect")
            .attr("width", colWidth - 4)
            .attr("height", rowHeight)
            .attr("fill", d => ratingColor(d.avgRating))
            .attr("rx", 4)
            .attr("ry", 4)

        const swatchSize = 10;
        header.append("rect")
            .attr("x", 4)
            .attr("y", 4)
            .attr("width", swatchSize)
            .attr("height", swatchSize)
            .attr("fill", d => getColor(d.key, this.stateManager))
            .attr("stroke", "#333")
            .attr("stroke-width", 0.5)
            .attr("rx", 1.5)
            .attr("ry", 1.5);

        header.append("text")
            .attr("x", (colWidth - 4) / 2)
            .attr("y", rowHeight / 2)
            .attr("dominant-baseline", "middle")
            .attr("text-anchor", "middle")
            .style("fill", "white")
            .style("font-weight", "bold")
            .style("font-size", "13px")
            .text(d => `${capitalize(formatLabels(d.shortLabel))}`);

        header.append("text")
            .attr("x", (colWidth - 4) / 2)
            .attr("y", rowHeight / 2 + 15)
            .attr("dominant-baseline", "middle")
            .attr("text-anchor", "middle")
            .style("fill", "white")
            .style("font-size", "13px")
            .text(d => `★ ${d.avgRating.toFixed(1)}`);

        header.on("click", (event, d) => {
                tooltip.transition().duration(100).style("opacity", 0);
                this._onClick(d);
            })

        // --- Movie Rows ---
        const maxTitles = d3.max(columns, d => d.titles.length);

        columns.forEach((col, i) => {
            col.titles.forEach((titleObj, j) => {
                g.append("rect")
                    .attr("x", i * colWidth)
                    .attr("y", (j + 1) * rowHeight + 4)
                    .attr("width", colWidth - 4)
                    .attr("height", rowHeight - 4)
                    .attr("fill", ratingColor(titleObj.rating))
                    .attr("opacity", 0.7)
                    .attr("rx", 3)
                    .attr("ry", 3);

                // g.append("text")
                //     .attr("x", i * colWidth + (colWidth - 4) / 2)
                //     .attr("y", (j + 1.5) * rowHeight)
                //     .attr("dominant-baseline", "middle")
                //     .attr("text-anchor", "middle")
                //     .attr("fill", "white")
                //     .attr("font-size", "13px")
                //     .text(`${titleObj.title}`);

                // g.append("text")
                //     .attr("x", i * colWidth + (colWidth - 4) / 2)
                //     .attr("y",(j + 1.5) * rowHeight + 15)
                //     .attr("dominant-baseline", "middle")
                //     .attr("text-anchor", "middle")
                //     .style("fill", "white")
                //     .style("font-size", "13px")
                //     .text(d => `★ ${titleObj.rating.toFixed(1)}`);
                });
        });

    }

    _onClick(d) {
        const newPath = [...this.currentPath, d.key];
        console.log(newPath)
        if (newPath.length <= HIERARCHY_LEVELS.length) {
            this.currentPath = newPath;
            if (this.dispatcher) {
                console.log("Clicked")
                this.dispatcher.emit('pathChange', {
                    path: newPath,
                    depth: newPath.length,
                });
            }
        }
        // else if (d.nodeType === "actor") {
        //     this._highlightActorConnections(d);
        // }
        console.log(d)
    }


}