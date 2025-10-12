import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getColor, capitalize, formatLabels } from "./helper.js";
import { HIERARCHY_LEVELS, BINS, GENRE_LEVEL_INDEX } from "./config.js";

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

        this._setupChartArea();
        this._setupBreadcrumbs();
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

        // Tooltip
        this.tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("opacity", 0)
            .style("pointer-events", "none")
            .style("background-color", "rgba(0, 0, 0, 0.85)")
            .style("color", "white")
            .style("padding", "20px 30px")
            .style("border-radius", "8px")
            .style("font-size", "15px")
            .style("max-width", "400px");

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
            .text("Media");
    }

    _setupBreadcrumbs() {
        this.breadcrumbGroup = this.svg.append("g")
            .attr("class", "breadcrumb-group")
            .attr("transform", `translate(${-this.radius}, ${-this.radius})`); // top-left margin
    }

    update(donutData) {
        this.currentPath = this.stateManager.getCurrentPath();
        const centerText = this.currentPath.length > 0
            ? this.currentPath[this.currentPath.length - 1]
            : "Media";
        this.centerLabel.text(capitalize(formatLabels(centerText)));
        this._renderBreadcrumbs();
        this._drawLegend();
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
            .on("mouseover", (event, d) => this._showTooltip(event, d, total))
            .on("mousemove", (event) => this._moveTooltip(event))
            .on("mouseout", () => this._hideTooltip())
            .on("click", (event, d) => this._onClick(d));

        paths.merge(pathsEnter)
            .transition().duration(600)
            .attr("fill", d => getColor(d.data.name, this.stateManager))
            .attr("d", this.arc)
            .attr("fill-opacity", 0.9);

        // --- LABELS ---
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
            .transition().duration(600)
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
                this.tooltip
                    .html(`
                    <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #555;">
                        ${movie.title}
                    </div>
                    <div style="font-size: 12px; line-height: 1.6;">
                        <strong>Rating:</strong> ${movie.rating?.toFixed(1) ?? "N/A"} / 10<br>
                        <strong>Runtime:</strong> ${movie.runtime ? `${movie.runtime} min` : "N/A"}<br>
                        <strong>Year:</strong> ${movie.year ?? "N/A"}<br>
                        <strong>Genre:</strong> ${movie.genre ?? "N/A"}<br>
                        <strong>Type:</strong> ${movie.type === "movie" ? "Movie" : "TV Show"}
                    </div>
                `)
                    .style("opacity", 1);
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

        this.tooltip
            .html(`
            <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #555;">
                ${displayName}
            </div>
            ${pathMarkup}
            <div style="font-size: 12px; line-height: 1.6;">
                <strong>Count:</strong> ${value.toLocaleString()}<br>
                ${percentageOfParent ? `<strong>Fraction of Parent:</strong> ${percentageOfParent}%` : ""}
            </div>
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #555; font-style: italic; color: #999; font-size: 14px;">Click to drill down</div>
        `)
            .style("opacity", 1);
    }

    _renderBreadcrumbs() {
        const pathArray = this.currentPath;

        const buttonHeight = 30;
        const buttonPadding = 8;
        const arrowSpacing = 20;
        const rowSpacing = 10;
        const availableWidth = this.width - 10;

        let xPos = 0;
        let yPos = 0;

        this.breadcrumbGroup.selectAll("*").remove();

        pathArray.forEach((name, i) => {
            const formattedName = capitalize(formatLabels(name))
            const tempText = this.breadcrumbGroup.append("text").text(formattedName)
                .style("font-size", "11px")
                .style("font-weight", "600");
            const textWidth = tempText.node().getBBox().width;
            tempText.remove();
            const buttonWidth = textWidth + 2 * buttonPadding;

            const nextElementWidth = buttonWidth + (i < pathArray.length - 1 ? arrowSpacing : 0);
            if (xPos > 0 && xPos + nextElementWidth > availableWidth) {
                xPos = 0;
                yPos += buttonHeight + rowSpacing;
            }

            const buttonGroup = this.breadcrumbGroup.append("g")
                .attr("transform", `translate(${xPos}, ${yPos})`)
                .style("cursor", "pointer")
                .on("click", () => this._onBreadcrumbClick(i));

            buttonGroup.append("rect")
                .attr("width", buttonWidth)
                .attr("height", buttonHeight)
                .attr("rx", 8).attr("ry", 8)
                .style("fill", "#f8f9fa").style("stroke", "#dee2e6");

            buttonGroup.append("text")
                .text(formattedName)
                .attr("x", buttonPadding)
                .attr("y", buttonHeight / 2)
                .attr("dy", "0.35em")
                .style("font-size", "11px")
                .style("font-weight", "600")
                .style("fill", "#333");

            xPos += buttonWidth;

            if (i < pathArray.length - 1) {
                this.breadcrumbGroup.append("text")
                    .text("→")
                    .attr("x", xPos + arrowSpacing / 2)
                    .attr("y", yPos + buttonHeight / 2)
                    .attr("dy", "0.35em")
                    .attr("text-anchor", "middle")
                    .style("font-size", "11px")
                    .style("fill", "#888");

                xPos += arrowSpacing;
            }
        });
    }



    _onBreadcrumbClick(index) {
        if (index === this.currentPath.length - 1) {
            this.currentPath = this.currentPath.slice(0, index);
        } else {
            this.currentPath = this.currentPath.slice(0, index + 1);
        }
        const centerText = this.currentPath[this.currentPath.length - 1] || "Media"
        this.centerLabel.text(capitalize(formatLabels(centerText)));

        if (this.dispatcher) {
            this.dispatcher.emit('pathChange', {
                path: [...this.currentPath],
                depth: this.currentPath.length,
            });
        }
        this._renderBreadcrumbs();
    }

    _drawLegend() {
        // Remove previous legend
        if (!this.legendGroup) {
            this.legendGroup = this.svg.append("g")
                .attr("class", "legend-group")
                .attr("transform", `translate(${-this.radius}, ${this.radius * 0.9})`);
        }
        this.legendGroup.selectAll("*").remove();

        const currentLevel = this.stateManager.getCurrentPath().length;
        const currentAttribute = HIERARCHY_LEVELS[currentLevel];
        const legendItemSize = 18;
        const legendSpacing = 5;

        // type
        if (currentLevel === 0) {
            const typeData = ["movie", "tvSeries"];
            const typeScale = this.stateManager.getTypeColorScale();

            const items = this.legendGroup.selectAll(".legend-item")
                .data(typeData)
                .join("g")
                .attr("class", "legend-item")
                .attr("transform", (d, i) => `translate(0, ${i * (legendItemSize + legendSpacing)})`);

            items.append("rect")
                .attr("width", legendItemSize)
                .attr("height", legendItemSize)
                .attr("rx", 3).attr("ry", 3)
                .style("fill", d => typeScale(d));

            items.append("text")
                .attr("x", legendItemSize + legendSpacing)
                .attr("y", legendItemSize / 2)
                .attr("dy", "0.35em")
                .style("font-size", "10px")
                .style("font-weight", "500")
                .text(d => capitalize(formatLabels(d)));

            return;
        }

        // genre
        if (currentLevel === 1) {
            const genreScale = this.stateManager.getGenreColorScale();
            const genreData = [...this.stateManager.topGenres ?? [], "Other"];

            const items = this.legendGroup.selectAll(".legend-item")
                .data(genreData)
                .join("g")
                .attr("class", "legend-item")
                .attr("transform", (d, i) => {
                    const x = (i % 5) * (legendItemSize * 4);
                    const y = Math.floor(i / 5) * (legendItemSize + legendSpacing);
                    return `translate(${x}, ${y})`;
                });

            items.append("rect")
                .attr("width", legendItemSize)
                .attr("height", legendItemSize)
                .attr("rx", 3).attr("ry", 3)
                .style("fill", d => genreScale(d));

            items.append("text")
                .attr("x", legendItemSize + legendSpacing)
                .attr("y", legendItemSize / 2)
                .attr("dy", "0.35em")
                .style("font-size", "10px")
                .style("font-weight", "500")
                .text(d => capitalize(formatLabels(d)));

            return;
        }

        // continuous attributes (runtime, year, rating)
        //TODO: put in middle of chart
        if (currentLevel >= 2 && currentAttribute) {
            const baseGenre = this.stateManager.getCurrentPath()[GENRE_LEVEL_INDEX];
            const baseColor = d3.color(this.stateManager.getGenreColorScale()(baseGenre));
            const bins = BINS[currentAttribute];

            if (!bins) return;

            const colorScale = d3.scaleLinear()
                .domain([0, bins.length - 1])
                .range([-1, 1]);

            const colorStops = bins.map((b, i) => {
                const mod = colorScale(i);
                const c = mod < 0 ? baseColor.darker(Math.abs(mod)) : baseColor.brighter(mod);
                return c.formatHex();
            });


            // Draw gradient definition
            const gradientId = `legend-gradient-${currentAttribute}`;
            const defs = this.svg.select("defs").empty() ? this.svg.append("defs") : this.svg.select("defs");
            defs.select(`#${gradientId}`).remove(); // remove old if exists

            const gradient = defs.append("linearGradient")
                .attr("id", gradientId)
                .attr("x1", "0%").attr("x2", "100%")
                .attr("y1", "0%").attr("y2", "0%");

            // Instead of continuous interpolation, make discrete bands
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
            const rectWidth = 300;
            const rectHeight = 20;

            this.legendGroup.append("rect")
                .attr("width", rectWidth)
                .attr("height", rectHeight)
                .style("fill", `url(#${gradientId})`)
                .style("stroke", "#ccc")
                .style("stroke-width", 1);

            // Label ends
            let startLabel = "", endLabel = "";
            if (currentAttribute === "year") { startLabel = "Older"; endLabel = "Newer"; }
            else if (currentAttribute === "runtime") { startLabel = "Shorter"; endLabel = "Longer"; }
            else if (currentAttribute === "rating") { startLabel = "Lower Rating"; endLabel = "Higher Rating"; }

            this.legendGroup.append("text")
                .text(startLabel)
                .attr("y", rectHeight + 25)
                .style("font-size", "10px")
                .style("fill", "#333");

            this.legendGroup.append("text")
                .text(endLabel)
                .attr("x", rectWidth)
                .attr("y", rectHeight + 25)
                .attr("text-anchor", "end")
                .style("font-size", "10px")
                .style("fill", "#333");
        }
    }


    _moveTooltip(event) {
        this.tooltip
            .style("left", `${event.pageX + 15}px`)
            .style("top", `${event.pageY + 15}px`);
    }

    _hideTooltip() {
        this.tooltip.transition().duration(300).style("opacity", 0);
    }

    _onClick(d) {
        const newPath = [...this.currentPath, d.data.name];
        if (newPath.length <= HIERARCHY_LEVELS.length) {
            this.currentPath = newPath; // update current path
            this.centerLabel.text(capitalize(formatLabels(d.data.name)));
            this._renderBreadcrumbs();

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
            : "Media";
        this.centerLabel.text(capitalize(formatLabels(centerText)));
        this._renderBreadcrumbs();

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
