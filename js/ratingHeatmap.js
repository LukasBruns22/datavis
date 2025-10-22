import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { formatLabels, capitalize, getColor } from "./helper.js";
import { HIERARCHY_LEVELS } from "./config.js";
import { TooltipManager } from "./tooltipManager.js";

export class RatingHeatmap {
    constructor(containerSelector, initalData, stateManager, dispatcher) {
        this.container = d3.select(containerSelector);
        this.svg = this.container.append("svg");
        this.stateManager = stateManager;
        
        const { width } = this.svg.node().getBoundingClientRect();
        this.width = width;

        this.data = initalData
        this.dispatcher = dispatcher
        this.margin = { top: 40, right: 0, bottom: 0, left: 0 };
        this.currentPath = stateManager.getCurrentPath()
        this.tooltip = new TooltipManager(this.container);
        this.resize() // Initial resize for width
        this.update(this.data)
    }

    resize() {
        const rect = this.container.node().getBoundingClientRect();
        this.width = rect.width - this.margin.left - this.margin.right;

        const currentHeight = this.svg.attr("height") || 300; 
        this.svg.attr("viewBox", `0 0 ${rect.width} ${currentHeight}`);
    }

    update(heatmapData) {
        if (!heatmapData) {
            return;
        }
        this.data = heatmapData
        this.currentPath = this.stateManager.getCurrentPath()
        const tooltip = this.tooltip;
        const { attribute, columns } = heatmapData;

        d3.select("#heatmap-title").text(`Title Ratings per ${capitalize(formatLabels(attribute))}`);

        const nCols = columns.length;
        const colWidth = (this.width - this.margin.left - this.margin.right) / nCols;
        const rowHeight = 40;
        const ratingColor = this.stateManager.getRatingColorScale();

        const maxTitles = columns.length > 0 ? d3.max(columns, col => col.titles.length) : 0;
        // +1 for header row, +4 for padding
        const requiredChartHeight = (maxTitles + 1) * rowHeight + 4; 
        this.height = requiredChartHeight; // Set internal height
        const totalSvgHeight = this.height + this.margin.top + this.margin.bottom;

        this.svg
            .attr("height", totalSvgHeight)
            .attr("viewBox", `0 0 ${this.width + this.margin.left + this.margin.right} ${totalSvgHeight}`);
        
        // Set container height explicitly so flexbox: 0 1 auto; works
        this.container.style("height", `${totalSvgHeight}px`);


        const g = this.svg.selectAll(".heatmap-g")
            .data([null])
            .join("g")
            .attr("class", "heatmap-g")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

        g.selectAll("*").remove();

        // header row: average rating per column
        const header = g.selectAll(".header-cell")
            .data(columns)
            .join("g")
            .attr("class", "header-cell")
            .attr("transform", (d, i) => `translate(${i * colWidth}, 0)`)
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => {
                tooltip.show({
                    header: capitalize(formatLabels(d.key)),
                    content: `Average rating: <b>${d.avgRating.toFixed(2)}</b>`,
                    footer: "Click to drill down"
                }, event);
            })
            .on("mousemove", event => tooltip.move(event))
            .on("mouseout", () => tooltip.hide())
            .on("click", (event, d) => {
                tooltip.hide();
                this._onClick(d);
            });

        const self = this;
        const swatchSize = 10
        const labelGroup = header.append("g")
            .attr("class", "attribute-label")
            .attr("transform", `translate(0, -20)`)

        labelGroup.each(function (d) {
            const group = d3.select(this);
            const isGenreLevel = (attribute === "genre");
            const fontSize = isGenreLevel ? 11 : 15;

            const tempText = group.append("text")
                .attr("font-size", fontSize)
                .attr("font-weight", "bold")
                .text(capitalize(formatLabels(d.shortLabel)));

            const textWidth = tempText.node().getBBox().width;
            tempText.remove();

            const totalWidth = textWidth + swatchSize + 4;
            const startX = (colWidth - totalWidth) / 2 - 5;

            group
                .on("mouseover", (event, d) => {
                    tooltip.show({
                        header: capitalize(formatLabels(d.key)),
                        content: `Average rating: <b>${d.avgRating.toFixed(2)}</b>`,
                        footer: "Click to drill down"
                    }, event);
                })
                .on("mousemove", event => tooltip.move(event))
                .on("mouseout", () => tooltip.hide())
                .on("click", (event, d) => {
                    tooltip.hide();
                    self._onClick(d);
                });

            group.append("rect")
                .attr("x", startX)
                .attr("y", -swatchSize / 2)
                .attr("width", swatchSize)
                .attr("height", swatchSize)
                .attr("fill", getColor(d.key, self.stateManager))
                .attr("stroke", "#333")
                .attr("stroke-width", 0.5)
                .attr("rx", 1.5)
                .attr("ry", 1.5);

            group.append("text")
                .attr("x", startX + swatchSize + 4)
                .attr("y", 0)
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .style("fill", "#222")
                .style("font-weight", "bold")
                .style("font-size", `${fontSize}px`)
                .text(capitalize(formatLabels(d.shortLabel)))
        });

        header.append("rect")
            .attr("width", colWidth - 4)
            .attr("height", rowHeight)
            .attr("fill", d => ratingColor(d.avgRating))
            .attr("rx", 4)
            .attr("ry", 4);

        header.append("text")
            .attr("x", (colWidth - 4) / 2)
            .attr("y", rowHeight / 2)
            .attr("dominant-baseline", "middle")
            .attr("text-anchor", "middle")
            .style("fill", "black")
            .style("font-weight", "bold")
            .style("font-size", "16px")
            .text(d => d.avgRating ? d.avgRating.toFixed(1) : "–");

        columns.forEach((col, i) => {
            col.titles.forEach((titleObj, j) => {
                const isSeries =
                    titleObj.type?.toLowerCase() === "tvseries" ||
                    titleObj.type?.toLowerCase() === "series";

                const cellGroup = g.append("g")
                    .attr("class", "heatmap-cell")
                    .attr("transform", `translate(${i * colWidth}, ${(j + 1) * rowHeight + 4})`)
                    .style("cursor", isSeries ? "pointer" : "default");

                cellGroup.append("rect")
                    .attr("width", colWidth - 4)
                    .attr("height", rowHeight - 4)
                    .attr("fill", ratingColor(titleObj.rating))
                    .attr("opacity", 0.7)
                    .attr("rx", 3)
                    .attr("ry", 3);


                cellGroup.append("text")
                    .attr("x", (colWidth - 4) / 2)
                    .attr("y", (rowHeight - 4) / 2 + 3)
                    .attr("dominant-baseline", "middle")
                    .attr("text-anchor", "middle")
                    .style("fill", "black")
                    .style("font-size", "16px")
                    .style("font-weight", "bold")
                    .text(d => `${titleObj.rating.toFixed(1)}`);


                cellGroup
                    .on("mouseover", (event) => {
                        this.tooltip.show({
                            header: titleObj.title,
                            content: `Average rating: <b>${titleObj.rating.toFixed(1)}</b>`,
                            footer: isSeries ? "Click to show episode ratings" : null
                        }, event);
                    })
                    .on("mousemove", event => tooltip.move(event))
                    .on("mouseout", () => tooltip.hide())
                    .on("click", (event, d) => {
                        if (titleObj.type === "tvSeries") {
                            tooltip.hide()
                            this.showSeriesEpisodes(titleObj.tconst, titleObj.title);
                        }
                    });
            });
        });

    }

    _onClick(d) {
        const newPath = [...this.currentPath, d.key];
        const maxDepth = HIERARCHY_LEVELS.indexOf("runtime") + 1;

        if (newPath.length < maxDepth) {
            this.currentPath = newPath;
            if (this.dispatcher) {
                this.dispatcher.emit('pathChange', {
                    path: newPath,
                    depth: newPath.length,
                });
            }
        }
    }

    showSeriesEpisodes(seriesTconst, seriesTitle) {
        const episodeData = this.stateManager.getEpisodeData();
        const episodes = episodeData.filter(d => d.parentTconst === seriesTconst && d.titleType === "tvEpisode");

        if (episodes.length === 0) {
            alert(`No episode data available for ${seriesTitle}`);
            return;
        }

        this.renderEpisodeHeatmap(seriesTitle, episodes);
    }

    renderEpisodeHeatmap(seriesTitle, episodes) {
        const margin = this.margin;
        const ratingColor = this.stateManager.getRatingColorScale();

        const seasons = Array.from(new Set(episodes.map(d => d.seasonNumber))).sort((a, b) => a - b);
        const maxEpisodes = d3.max(episodes, d => d.episodeNumber);

        const cellWidth = (this.width - margin.left - margin.right) / maxEpisodes;
        const cellHeight = 35; // Set a fixed cell height for episodes
        const requiredChartHeight = (seasons.length * cellHeight) + 30; 
        this.height = requiredChartHeight;
        const totalSvgHeight = this.height + this.margin.top + this.margin.bottom;

        this.svg
            .attr("height", totalSvgHeight)
            .attr("viewBox", `0 0 ${this.width + this.margin.left + this.margin.right} ${totalSvgHeight}`);
        
        // Set container height explicitly so flexbox respects it
        this.container.style("height", `${totalSvgHeight}px`);

        const g = this.svg.selectAll(".heatmap-g")
            .data([null])
            .join("g")
            .attr("class", "heatmap-g")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);

        g.selectAll("*").remove();


        d3.select("#heatmap-title").text(`Episode Ratings for ${seriesTitle}`);

        const titleEl = d3.select("#heatmap-title");

        // clear any previous back button
        titleEl.select(".back-button").remove();

        titleEl.append("span")
            .attr("class", "back-button")
            .style("margin-left", "15px")
            .style("cursor", "pointer")
            .style("font-size", "14px")
            .style("color", "#1f77b4")
            .style("text-decoration", "underline")
            .text("← Back")
            .on("click", () => {
                this.goBackToMainHeatmap();
                titleEl.text(`Title Ratings per ${capitalize(formatLabels(this.data.attribute))}`); // reset title
            });

        const x = d3.scaleBand()
            .domain(d3.range(1, maxEpisodes + 1))
            .range([0, maxEpisodes * cellWidth]);

        const y = d3.scaleBand()
            .domain(seasons)
            .range([0, seasons.length * cellHeight]);

        const cellGroup = g.selectAll(".episode-cell")
            .data(episodes)
            .join("g")
            .attr("class", "episode-cell")
            .attr("transform", d => `translate(${x(d.episodeNumber)}, ${y(d.seasonNumber)})`)
            .style("cursor", "pointer");

        cellGroup.append("rect")
            .attr("width", cellWidth - 4)
            .attr("height", cellHeight - 4)
            .attr("fill", d => ratingColor(d.averageRating))
            .attr("rx", 3)
            .attr("ry", 3);

        cellGroup.append("text")
            .attr("x", (cellWidth - 4) / 2)
            .attr("y", (cellHeight - 4) / 2 + 3)
            .attr("dominant-baseline", "middle")
            .attr("text-anchor", "middle")
            .style("fill", "black")
            .style("font-size", "15px")
            .style("font-weight", "bold")
            .each(function (d) {
                const text = d3.select(this);
                const ratingText = `${d.averageRating.toFixed(1)}`;
                text.text(ratingText);

                const bbox = text.node().getBBox();
                if (bbox.width > cellWidth || bbox.height > cellHeight - 8) {
                    text.text("");
                }
            });

        g.append("g")
            .attr("class", "episode-labels")
            .selectAll("text")
            .data(d3.range(1, maxEpisodes + 1))
            .join("text")
            .attr("x", d => x(d) + cellWidth / 2)
            .attr("y", -10)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text(d => `E. ${d}`);

        g.append("g")
            .attr("class", "season-labels")
            .selectAll("text")
            .data(seasons)
            .join("text")
            .attr("x", -10)
            .attr("y", d => y(d) + cellHeight / 2)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "middle")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text(d => `S. ${d}`);

        cellGroup
            .on("mouseover", (event, d) => {
                this.tooltip.show({
                    header: d.originalTitle || d.title,
                    content: `Rating: <b>${d.averageRating.toFixed(1)}</b>`,
                    footer: (d.seasonNumber && d.episodeNumber)
                        ? `S.${d.seasonNumber} - E.${d.episodeNumber}`
                        : null
                }, event);
            })
            .on("mousemove", event => this.tooltip.move(event))
            .on("mouseout", () => this.tooltip.hide())
    }

    goBackToMainHeatmap() {
        if (this.currentPath.length <= HIERARCHY_LEVELS.length) {
            if (this.dispatcher) {
                this.dispatcher.emit('pathChange', {
                    path: this.currentPath,
                    depth: this.currentPath.length,
                });
            }
        }
    }


}