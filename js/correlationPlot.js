import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getYearBin, getColor, BINNING_FUNCTIONS, formatLabels, capitalize } from "./helper.js";
import { TooltipManager } from "./tooltipManager.js"; // <-- IMPORTED

export class CorrelationPlot {
    constructor(svgSelector, initialData, stateManager, dispatcher) {
        this.svg = d3.select(svgSelector);
        this.data = initialData;
        this.stateManager = stateManager
        this.dispatcher = dispatcher; // Store the dispatcher
        
        // --- MODIFIED: Increased bottom margin from 40 to 70 ---
        // This makes room for the rotated x-axis labels
        this.margin = { top: 40, right: 20, bottom: 70, left: 45 };

        this.showTrendLine = false;
        this.currentPath = []; // Track the drill-down path
        this.hierarchyLevels = ['type', 'genre', 'year', 'runtime']; // Define hierarchy

        // --- INSTANTIATED (on body for safe positioning) ---
        this.tooltip = new TooltipManager(d3.select("body")); 
        
        this._setupChartArea();
        this.resize();
    }


    _setupChartArea() {
        this.chartGroup = this.svg.append("g");
        this.xAxisGroup = this.chartGroup.append("g").attr("class", "x-axis");
        this.yAxisGroup = this.chartGroup.append("g").attr("class", "y-axis");

        // Enhanced axis labels
        this.xAxisLabel = this.chartGroup.append("text")
            .attr("class", "axis-label")
            .style("text-anchor", "middle")
            .style("font-size", scaledFont(15))
            .style("font-weight", "bold")
            .style("fill", "#333");

        this.yAxisLabel = this.chartGroup.append("text")
            .attr("class", "axis-label")
            .style("text-anchor", "middle")
            .style("font-size", scaledFont(15))
            .style("font-weight", "bold")
            .style("fill", "#333");

        // Trend line toggle button
        this.trendToggleButton = this.svg.append("g")
            .attr("class", "trend-toggle")
            .style("opacity", 0)
            .style("cursor", "pointer");

        this.trendToggleText = this.trendToggleButton.append("text")
            .attr("text-anchor", "middle")
            .style("dominant-baseline", "middle")
            .style("font-size", scaledFont(15))
            .style("font-weight", "600")
            .style("fill", "#495057")
            .text("Show Trend Line");

        const padding = { x: 10, y: 5 };
        const textBBox = this.trendToggleText.node().getBBox();

        // Standardize button size based on the trend toggle button
        this.uniformButtonWidth = textBBox.width + padding.x;
        this.uniformButtonHeight = textBBox.height + padding.y;

        this.trendToggleText.attr("x", this.uniformButtonWidth / 2).attr("y", this.uniformButtonHeight / 2);

        this.trendToggleButton.insert("rect", "text")
            .attr("width", this.uniformButtonWidth)
            .attr("height", this.uniformButtonHeight)
            .attr("rx", 6)
            .attr("ry", 6)
            .style("fill", "#f8f9fa")
            .style("stroke", "#dee2e6")
            .style("stroke-width", 1);

        this.trendToggleButton.on("click", () => {
            this.showTrendLine = !this.showTrendLine;
            this._updateTrendLine();
            this._updateToggleButton();
        });

        this.trendToggleButton
            .on("mouseover", () => {
                this.trendToggleButton.select("rect")
                    .transition().duration(200)
                    .style("fill", "#e9ecef")
                    .style("stroke", "#adb5bd");
            })
            .on("mouseout", () => {
                this.trendToggleButton.select("rect")
                    .transition().duration(200)
                    .style("fill", "#f8f9fa")
                    .style("stroke", "#dee2e6");
            });

        // --- REMOVED old tooltip creation ---
    }

    resize() {
        const container = this.svg.node().parentElement;
        const containerWidth = container.getBoundingClientRect().width;
        
        // --- MODIFIED: Calculate height based on width (4:3 aspect ratio) ---
        const aspectRatio = 4 / 3;
        // Ensure a minimum height
        const calculatedHeight = containerWidth / aspectRatio;
        const containerHeight = Math.max(calculatedHeight, 350); // Min height of 350px

        this.svg.attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`)
            .attr("width", null)
            // --- MODIFIED: Set explicit SVG height ---
            .attr("height", containerHeight);
        
        // --- THIS LINE IS REMOVED ---
        // d3.select(container).style("height", `${containerHeight}px`);

        this.width = containerWidth - this.margin.left - this.margin.right;
        this.height = containerHeight - this.margin.top - this.margin.bottom; // This is now based on width
        this.chartGroup.attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
        this.xAxisGroup.attr("transform", `translate(0, ${this.height})`);
        
        // --- MODIFIED: Moved X-axis label further down ---
        this.xAxisLabel.attr("transform", `translate(${this.width / 2}, ${this.height + 65})`);

        // --- MODIFIED: Moved Y-axis label further left ---
        this.yAxisLabel.attr("transform", `translate(-35, ${this.height / 2}) rotate(-90)`);
        
        // --- MODIFIED: This line is changed to vertically center the button in the margin ---
        const buttonY = (this.margin.top / 2) - (this.uniformButtonHeight / 2);
        this.trendToggleButton.attr("transform", `translate(${containerWidth - this.uniformButtonWidth - this.margin.right}, ${buttonY})`);
    }


    // correlationPlot.js
    update(data, attribute) {
        // --- ADDED: Call resize on update ---
        // This ensures the plot recalculates its aspect-ratio height if data changes
        // and also correctly sets the scale ranges before drawing.
        this.resize();

        this.currentPath = this.stateManager.getCurrentPath()

        if (this.currentPath.length > 3) {
            return;
        }
        d3.select("#correlation-title").text(`Rating vs ${capitalize(formatLabels(attribute))}`);
        

        this.chartGroup.selectAll(".plot-element").remove();
        this.chartGroup.selectAll(".trend-line").remove();
        this.yAxisLabel.text("Rating");

        this.currentData = data;
        this.currentXAttribute = attribute || 'genre';

        const yValue = d => d.rating;

        if (this.currentXAttribute === 'year') {
            this._updateBoxPlot(data, 'year', yValue);
            this._hideTrendToggle();
        } else if (attribute === 'other-genres') {
            this._updateBoxPlot(data, 'other-genres', yValue);
            this._hideTrendToggle();
        } else if (['runtime', 'rating'].includes(this.currentXAttribute) && data.length > 1) {
            this._updateScatterPlot(data, this.currentXAttribute, yValue);
            this._showTrendToggle();
        } else {
            this._updateBoxPlot(data, this.currentXAttribute, yValue);
            this._hideTrendToggle();
        }
    }


    _updateScatterPlot(data, xAttribute, yValue) {
        this.xAxisLabel.text(xAttribute.charAt(0).toUpperCase() + xAttribute.slice(1));
        const xValue = d => d[xAttribute];
        
        // --- MODIFIED: Scales are now set here, using this.height from resize() ---
        this.xScale = d3.scaleLinear().domain(d3.extent(data, xValue)).nice().range([0, this.width]);
        this.yScale = d3.scaleLinear().domain(d3.extent(data, yValue)).nice().range([this.height, 0]);
        
        const xAxis = d3.axisBottom(this.xScale).tickFormat(d3.format(".0f"));
        const yAxis = d3.axisLeft(this.yScale).tickFormat(d3.format(".1f"));
        const xDomain = this.xScale.domain();
        const xTicks = this.xScale.ticks();
        if (xTicks[xTicks.length - 1] < xDomain[1]) {
            xTicks.push(xDomain[1]);
        }
        xAxis.tickValues(xTicks);
        this.xAxisGroup.transition().duration(500).call(xAxis);
        this.yAxisGroup.transition().duration(500).call(yAxis);
        
        // --- MODIFIED: Reset text styles for non-rotated labels ---
        this.xAxisGroup.selectAll("text")
            .style("text-anchor", "middle")
            .attr("dx", "0")
            .attr("dy", "0.71em") // default
            .attr("transform", "rotate(0)")
            .style("font-size", scaledFont(16))
            .style("fill", "#333");
            
        this.yAxisGroup.selectAll("text").style("font-size", scaledFont(14)).style("fill", "#333");
        
        this.chartGroup.selectAll(".plot-element")
            .data(data)
            .join("circle")
            .attr("class", "plot-element")
            .attr("cx", d => this.xScale(xValue(d)))
            .attr("cy", d => this.yScale(yValue(d)))
            .attr("r", 6)
            .style("fill", d => getColor(BINNING_FUNCTIONS[xAttribute](d[xAttribute]), this.stateManager))
            .style("opacity", 1)
            .style("stroke", "black")
            .style("stroke-width", 0.5)
            .style("cursor", "pointer")
             // --- MODIFIED to use TooltipManager ---
            .on("mouseover", (event, d) => {
                const header = d.title;
                const content = `
                    <strong>Rating:</strong> ${d.rating.toFixed(1)} / 10<br>
                    <strong>Runtime:</strong> ${d.runtime} min<br>
                    <strong>Year:</strong> ${d.year}<br>
                    <strong>Genre:</strong> ${d.genre}<br>
                    <strong>Type:</strong> ${d.type === 'movie' ? 'Movie' : 'TV Show'}
                `;
                this.tooltip.show({ header, content }, event);
            })
            .on("mousemove", (event) => {
                this.tooltip.move(event); // <-- ADDED
            })
            .on("mouseout", () => {
                this.tooltip.hide(); // <-- MODIFIED
            });
        this._updateTrendLine();
    }

    _updateBoxPlot(data, groupingAttribute, yValue) {
        this.currentPath = this.stateManager.getCurrentPath()
        this.xAxisLabel.text(groupingAttribute.charAt(0).toUpperCase() + groupingAttribute.slice(1));
        const topGenres = this.stateManager.getTopGenres()

        let groupingFunction;
        if (groupingAttribute === 'genre') {
            groupingFunction = d => topGenres.includes(d.genre) ? d.genre : 'Other';
        } else if (groupingAttribute === 'year') {
            groupingFunction = d => getYearBin(d.year);
        } else {
            groupingFunction = d => d[groupingAttribute];
        }

        const groupedData = d3.group(data, groupingFunction);
        if (groupingAttribute === 'year') groupedData.delete(null);

        const stats = Array.from(groupedData, ([key, values]) => {
            const ratings = values.map(yValue).sort(d3.ascending);
            const q1 = d3.quantile(ratings, 0.25);
            const median = d3.quantile(ratings, 0.5);
            const q3 = d3.quantile(ratings, 0.75);
            const iqr = q3 - q1;
            const min = Math.max(d3.min(ratings), q1 - 1.5 * iqr);
            const max = Math.min(d3.max(ratings), q3 + 1.5 * iqr);
            const mean = d3.mean(ratings);
            const count = values.length;
            const stdDev = d3.deviation(ratings);

            const genreCounts = d3.rollup(values, v => v.length, d => d.genre);
            const dominantGenre = Array.from(genreCounts.entries())
                .sort((a, b) => b[1] - a[1])[0][0];

            const typeCounts = d3.rollup(values, v => v.length, d => d.type);
            const typeDistribution = Array.from(typeCounts.entries())
                .map(([type, count]) => `${type === 'movie' ? 'Movies' : 'TV Shows'}: ${count}`)
                .join(', ');

            return {
                key, min, q1, median, q3, max, mean, count, stdDev,
                dominantGenre, 
                typeDistribution, values
            };
        });

        let domainOrder;
        if (groupingAttribute === 'genre') {
            domainOrder = [...topGenres, 'Other'].filter(key => groupedData.has(key));
        } else if (groupingAttribute === 'year') {
            domainOrder = Array.from(groupedData.keys())
                .sort((a, b) => +a.split(" - ")[0] - +b.split(" - ")[0]);
        } else if (groupingAttribute === 'type') {
            domainOrder = ['movie', 'tvSeries'].filter(key => groupedData.has(key));
        } else {
            domainOrder = Array.from(groupedData.keys()).sort();
        }

        // --- MODIFIED: Scales are now set here, using this.height from resize() ---
        this.xScale = d3.scaleBand().domain(domainOrder).range([0, this.width]).padding(0.1);
        this.yScale = d3.scaleLinear().domain([0, 10]).nice().range([this.height, 0]);

        const xAxis = d3.axisBottom(this.xScale);
        if (groupingAttribute === 'type') {
            xAxis.tickFormat(d => (d === 'movie' ? 'Movies' : d === 'tvSeries' ? 'TV Shows' : d));
        }

        const yAxis = d3.axisLeft(this.yScale).tickFormat(d3.format(".1f"));

        this.xAxisGroup.transition().duration(500).call(xAxis);
        this.yAxisGroup.transition().duration(500).call(yAxis);

        // --- MODIFIED: Rotate labels to prevent overlap ---
        this.xAxisGroup.selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(-45)")
            .style("font-size", scaledFont(14)) // Slightly smaller font for rotated labels
            .style("fill", "#333");

        this.yAxisGroup.selectAll("text").style("font-size", scaledFont(14)).style("fill", "#333");

        const boxGroup = this.chartGroup.selectAll(".box-group")
            .data(stats, d => d.key)
            .join("g")
            .attr("class", "plot-element box-group")
            .attr("transform", d => `translate(${this.xScale(d.key)}, 0)`)
            .style("cursor", "pointer")

            // --- MODIFIED to use TooltipManager ---
            .on("mouseover", (event, d) => {
                d3.select(event.currentTarget).select("rect")
                    .attr("stroke-width", 3)
                    .attr("stroke", "#007bff");

                const header = (d.key === 'movie') ? 'Movies' : (d.key === 'tvSeries' || d.key === 'tvseries') ? 'TV Shows' : capitalize(formatLabels(d.key));
                let typeDistributionText = (d.typeDistribution || '')
                    .replace(/\bmovie\b/gi, "Movies")
                    .replace(/\btvSeries\b/gi, "TV Shows")
                    .replace(/\btvseries\b/gi, "TV Shows");

                const content = `
                    <div style="font-weight:700; margin-bottom:4px;">📊 Statistics</div>
                    <div>🔢 Count: ${d.count.toLocaleString()}</div>
                    <div>📊 Median: ${d.median.toFixed(2)}/10</div>
                    <div>📈 Mean: ${d.mean.toFixed(2)}/10</div>
                    <div>σ Std Dev: ${d.stdDev ? d.stdDev.toFixed(2) : 'N/A'}</div>
                    <div>↕ Range: ${d.min.toFixed(1)} – ${d.max.toFixed(1)}</div>
                    <div style="border-top:1px solid #555; margin-top: 6px; padding-top: 6px; font-weight:700; margin-bottom:4px;">📂 Distribution</div>
                    <div>${typeDistributionText}</div>
                `;
                const footer = "Click to drill down";

                this.tooltip.show({ header, content, footer }, event);
            })
            .on("mousemove", (event) => {
                 this.tooltip.move(event); // <-- ADDED
            })
            .on("mouseout", (event) => {
                d3.select(event.currentTarget).select("rect")
                    .attr("stroke-width", 1)
                    .attr("stroke", "#888");

                this.tooltip.hide(); // <-- MODIFIED
            })
            .on("click", (event, d) => {
                this.tooltip.hide(); // <-- MODIFIED
                
                d3.select(event.currentTarget).select("rect")
                    .attr("stroke", "#28a745").attr("stroke-width", 4)
                    .transition().duration(200)
                    .attr("stroke", "#888").attr("stroke-width", 1);

                if (this.dispatcher) {
                    const newPath = [...this.currentPath, d.key];
                    const newDepth = this.currentPath.length + 1;
                    this.dispatcher.emit('pathChange', { path: newPath, depth: newDepth });
                } else {
                    console.error('Dispatcher is not defined in CorrelationPlot');
                }
            });

        boxGroup.append("line")
            .attr("class", "whisker")
            .attr("y1", d => this.yScale(d.min)).attr("y2", d => this.yScale(d.max))
            .attr("x1", this.xScale.bandwidth() / 2).attr("x2", this.xScale.bandwidth() / 2)
            .attr("stroke", "#888").attr("stroke-width", 1.5);

        boxGroup.selectAll(".whisker-cap")
            .data(d => [d.min, d.max])
            .join("line")
            .attr("class", "whisker-cap")
            .attr("y1", d => this.yScale(d)).attr("y2", d => this.yScale(d))
            .attr("x1", this.xScale.bandwidth() * 0.3)
             // --- BUG FIX: 'a' changed to 'this' ---
            .attr("x2", this.xScale.bandwidth() * 0.7)
            .attr("stroke", "#888").attr("stroke-width", 1.5);

        boxGroup.append("rect")
            .attr("class", "box-rect")
            .attr("y", d => this.yScale(d.q3))
            .attr("width", this.xScale.bandwidth())
            .attr("height", d => this.yScale(d.q1) - this.yScale(d.q3))
            .attr("stroke", "#888").attr("stroke-width", 1)
            .style("fill", d => getColor(d.key, this.stateManager)) // Corrected fill call
            .style("transition", "all 0.15s ease");

        boxGroup.append("line")
            .attr("class", "median-line")
            .attr("y1", d => this.yScale(d.median)).attr("y2", d => this.yScale(d.median))
            .attr("x1", 0).attr("x2", this.xScale.bandwidth())
            .attr("stroke", "black").attr("stroke-width", 3);
    }

    _showTrendToggle() {
        this.trendToggleButton.transition().duration(300).style("opacity", 1);
    }

    _hideTrendToggle() {
        this.trendToggleButton.transition().duration(300).style("opacity", 0);
        this.showTrendLine = false;
        this._updateToggleButton();
    }

    _updateToggleButton() {
        this.trendToggleText.text(this.showTrendLine ? "Hide Trend Line" : "Show Trend Line");
        this.trendToggleButton.select("rect").style("fill", this.showTrendLine ? "#d4edda" : "#f8f9fa")
            .style("stroke", this.showTrendLine ? "#c3e6cb" : "#dee2e6");
        this.trendToggleText.style("fill", this.showTrendLine ? "#155724" : "#495057");
    }

    _updateTrendLine() {
        this.chartGroup.selectAll(".trend-line").remove();
        if (!this.showTrendLine || !this.currentData || !this.xScale || !this.yScale) return;
        const data = this.currentData;
        const xValue = d => d[this.currentXAttribute];
        const yValue = d => d.rating;
        const regression = this._calculateLinearRegression(data, xValue, yValue);
        if (!regression) return;
        const { slope, intercept } = regression;
        const xDomain = this.xScale.domain();
        const lineData = [{ x: xDomain[0], y: slope * xDomain[0] + intercept }, { x: xDomain[1], y: slope * xDomain[1] + intercept }];
        this.chartGroup.append("line").attr("class", "trend-line")
            .attr("x1", this.xScale(lineData[0].x)).attr("y1", this.yScale(lineData[0].y))
            .attr("x2", this.xScale(lineData[1].x)).attr("y2", this.yScale(lineData[1].y))
            .style("stroke", "#e74c3c").style("stroke-width", 8).style("stroke-dasharray", "5,5")
            .style("opacity", 0).transition().duration(500).style("opacity", 0.8);
    }

    _calculateLinearRegression(data, xValue, yValue) {
        const validData = data.filter(d => !isNaN(xValue(d)) && !isNaN(yValue(d)) && isFinite(xValue(d)) && isFinite(yValue(d)));
        if (validData.length < 2) return null;
        const n = validData.length;
        const sumX = d3.sum(validData, xValue);
        const sumY = d3.sum(validData, yValue);
        const sumXY = d3.sum(validData, d => xValue(d) * yValue(d));
        const sumXX = d3.sum(validData, d => xValue(d) * xValue(d));
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        const yMean = sumY / n;
        const ssTotal = d3.sum(validData, d => Math.pow(yValue(d) - yMean, 2));
        const ssRes = d3.sum(validData, d => Math.pow(yValue(d) - (slope * xValue(d) + intercept), 2));
        // --- BUG FIX: 'total' changed to 'ssTotal' ---
        const r2 = 1 - (ssRes / ssTotal);
        return { slope, intercept, r2: Math.max(0, r2) };
    }


}