class CorrelationPlot {
    constructor(svgSelector, initialData, colorFunction, topGenres, dispatcher) {
        this.svg = d3.select(svgSelector);
        this.data = initialData;
        this.color = colorFunction;
        this.topGenres = topGenres;
        this.dispatcher = dispatcher; // Store the dispatcher
        this.margin = { top: 50, right: 30, bottom: 70, left: 80 };
        this.showTrendLine = false;
        this.currentPath = []; // Track the drill-down path
        this.hierarchyLevels = ['type', 'genre', 'year', 'runtime']; // Define hierarchy
        this._setupChartArea();
        this.resize();
    }

    _setupChartArea() {
        this.chartGroup = this.svg.append("g");
        this.xAxisGroup = this.chartGroup.append("g").attr("class", "x-axis");
        this.yAxisGroup = this.chartGroup.append("g").attr("class", "y-axis");
        
        this.navigationGroup = this.svg.append("g").attr("class", "navigation-group");
        
        // Enhanced axis labels
        this.xAxisLabel = this.chartGroup.append("text")
            .attr("class", "axis-label")
            .style("text-anchor", "middle")
            .style("font-size", "35px")
            .style("font-weight", "bold")
            .style("fill", "#333");
            
        this.yAxisLabel = this.chartGroup.append("text")
            .attr("class", "axis-label")
            .style("text-anchor", "middle")
            .style("font-size", "35px")
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
            .style("font-size", "35px")
            .style("font-weight", "600")
            .style("fill", "#495057")
            .text("Show Trend Line");

        const padding = { x: 15, y: 10 };
        const textBBox = this.trendToggleText.node().getBBox();
        const rectWidth = textBBox.width + padding.x * 2;
        const rectHeight = textBBox.height + padding.y * 2;

        this.trendToggleText.attr("x", rectWidth / 2).attr("y", rectHeight / 2);

        this.trendToggleButton.insert("rect", "text")
            .attr("width", rectWidth)
            .attr("height", rectHeight)
            .attr("rx", 15)
            .attr("ry", 15)
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
            
        d3.selectAll('.correlation-tooltip').remove();

        this.tooltip = d3.select("body").append("div")
            .attr("class", "correlation-tooltip")
            .style("position", "absolute")
            .style("background", "rgba(0, 0, 0, 0.85)")
            .style("color", "#f8f9fa")
            .style("padding", "30px 50px")
            .style("border-radius", "10px")
            .style("font-size", "35px")
            .style("font-family", "'Segoe UI', sans-serif")
            .style("box-shadow", "0 6px 35px rgba(0,0,0,0.45)")
            .style("pointer-events", "none")
            .style("opacity", 0)
            .style("z-index", 1000);
    }

    _renderNavigation() {
    if (!this.navigationGroup) return;
    this.navigationGroup.selectAll("*").remove();

    if (this.currentPath.length === 0) return;

    const buttonPadding = { x: 12, y: 6 };
    const buttonSpacing = 10;
    const arrowSpacing = 14;

    let xPos = this.margin.left;
    const yPos = this.margin.top - 40;

    this.currentPath.forEach((levelValue, i) => {
        // Get the name of the hierarchy level (e.g., 'type', 'genre')
        const levelName = this.hierarchyLevels[i];

        // Use a map for user-friendly headers
        const labelMap = {
            'type': 'Type', 'genre': 'Genre',
            'year': 'Year', 'runtime': 'Runtime'
        };
        const header = labelMap[levelName] || levelName;

        // Make the label more descriptive, e.g., "Genre: Action"
        const label = `${header}: ${levelValue}`;

        const group = this.navigationGroup.append("g")
            .attr("transform", `translate(${xPos}, ${yPos})`)
            .style("cursor", "pointer");

        const rect = group.append("rect")
            .attr("rx", 15).attr("ry", 15)
            .style("fill", "#f8f9fa").style("stroke", "#dee2e6")
            .style("stroke-width", 1).style("transition", "fill 0.2s ease-in-out");

        const text = group.append("text")
            .text(label).style("font-size", "35px")
            .style("font-weight", "600").style("fill", "#333333");

        const textBBox = text.node().getBBox();
        const rectWidth = textBBox.width + buttonPadding.x * 2;
        const rectHeight = textBBox.height + buttonPadding.y * 2;

        rect.attr("width", rectWidth)
            .attr("height", rectHeight);

        text.attr("x", buttonPadding.x)
            .attr("y", rectHeight / 2)
            .style("dominant-baseline", "middle");

        // The click handler now correctly emits a 'pathChange' event
        group.on("click", () => {
            const newPath = this.currentPath.slice(0, i + 1);
            const newDepth = newPath.length;

            this.dispatcher.emit('pathChange', { path: newPath, depth: newDepth });
        });

        group
            .on("mouseover", () => rect.style("fill", "#e9ecef"))
            .on("mouseout", () => rect.style("fill", "#f8f9fa"));

        xPos += rectWidth + buttonSpacing;

        if (i < this.currentPath.length - 1) {
            this.navigationGroup.append("text")
                .text("→").attr("x", xPos).attr("y", yPos + rectHeight / 2)
                .style("dominant-baseline", "middle").style("font-size", "14px")
                .style("fill", "#333");
            xPos += arrowSpacing;
        }
    });
}

   resize() {
        const container = this.svg.node().parentElement;
        const containerWidth = container.getBoundingClientRect().width;
        const containerHeight = container.getBoundingClientRect().height;
        this.svg.attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`)
            .attr("width", null).attr("height", null);
        this.width = containerWidth - this.margin.left - this.margin.right;
        this.height = containerHeight - this.margin.top - this.margin.bottom;
        this.chartGroup.attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
        this.xAxisGroup.attr("transform", `translate(0, ${this.height})`);
        this.xAxisLabel.attr("transform", `translate(${this.width / 2}, ${this.height + 65})`);
        this.yAxisLabel.attr("transform", `translate(-75, ${this.height / 2}) rotate(-90)`);
        this.trendToggleButton.attr("transform", `translate(${containerWidth - 255}, 10)`);
    }

    // In correlationPlot.js

update(data, attribute, path) {
    this.chartGroup.selectAll(".plot-element").remove();
    this.chartGroup.selectAll(".trend-line").remove();
    this.yAxisLabel.text("IMDB Rating");

    // The component now accepts its state instead of trying to calculate it.
    this.currentData = data;
    this.currentXAttribute = attribute || 'genre';
    this.currentPath = path || []; // Set the path directly from the argument

    // With the correct path, the breadcrumbs will now render correctly.
    this._renderNavigation();

    const yValue = d => d.rating;

    if (this.currentXAttribute === 'year') {
        this._updateBoxPlot(data, 'year', yValue);
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
        this.xAxisGroup.selectAll("text").style("font-size", "30px").style("fill", "#333");
        this.yAxisGroup.selectAll("text").style("font-size", "30px").style("fill", "#333");
        this.chartGroup.selectAll(".plot-element")
            .data(data)
            .join("circle")
            .attr("class", "plot-element")
            .attr("cx", d => this.xScale(xValue(d)))
            .attr("cy", d => this.yScale(yValue(d)))
            .attr("r", 12)
            .style("fill", d => this.color(d))
            .style("opacity", 0.7)
            .style("stroke", "black")
            .style("stroke-width", 0.5)
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => {
                this.tooltip.transition().duration(200).style("opacity", 1);
                this.tooltip.html(`
                    <div style="font-weight:700; font-size:35px; margin-bottom:6px; color:#fff;">${d.title}</div>
                    <div style="border-top:1px solid rgba(255,255,255,0.2); margin:6px 0;"></div>
                    <div style="color:#f1f3f5;"><strong>Rating:</strong> ${d.rating.toFixed(1)} / 10</div>
                    <div style="color:#f1f3f5;"><strong>Runtime:</strong> ${d.runtime} min</div>
                    <div style="color:#f1f3f5;"><strong>Year:</strong> ${d.year}</div>
                    <div style="color:#f1f3f5;"><strong>Genre:</strong> ${d.genre}</div>
                    <div style="color:#f1f3f5;"><strong>Type:</strong> ${d.type === 'movie' ? 'Movie' : 'TV Show'}</div>
                `)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseout", () => {
                this.tooltip.transition().duration(200).style("opacity", 0);
            });
        this._updateTrendLine();
    }

    _updateBoxPlot(data, groupingAttribute, yValue) {
    this.xAxisLabel.text(groupingAttribute.charAt(0).toUpperCase() + groupingAttribute.slice(1));

    let groupingFunction;
    if (groupingAttribute === 'genre') {
        groupingFunction = d => this.topGenres.includes(d.genre) ? d.genre : 'Other';
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

        // --- FIXED: Correct logic to find the dominant genre string ---
        const genreCounts = d3.rollup(values, v => v.length, d => d.genre);
        const dominantGenre = Array.from(genreCounts.entries())
            .sort((a, b) => b[1] - a[1])[0][0];

        const typeCounts = d3.rollup(values, v => v.length, d => d.type);
        const typeDistribution = Array.from(typeCounts.entries())
            .map(([type, count]) => `${type === 'movie' ? 'Movies' : 'TV Shows'}: ${count}`)
            .join(', ');

        return {
            key, min, q1, median, q3, max, mean, count, stdDev,
            dominantGenre, // This is now a string, e.g., "Action"
            typeDistribution, values
        };
    });

    let domainOrder;
    if (groupingAttribute === 'genre') {
        domainOrder = [...this.topGenres, 'Other'].filter(key => groupedData.has(key));
    } else if (groupingAttribute === 'year') {
        domainOrder = Array.from(groupedData.keys())
            .sort((a, b) => +a.split(" - ")[0] - +b.split(" - ")[0]);
    } else if (groupingAttribute === 'type') {
        domainOrder = ['movie', 'tvSeries'].filter(key => groupedData.has(key));
    } else {
        domainOrder = Array.from(groupedData.keys()).sort();
    }

    this.xScale = d3.scaleBand().domain(domainOrder).range([0, this.width]).padding(0.1);
    this.yScale = d3.scaleLinear().domain([0, 10]).nice().range([this.height, 0]);

    const xAxis = d3.axisBottom(this.xScale);
    if (groupingAttribute === 'type') {
        xAxis.tickFormat(d => (d === 'movie' ? 'Movies' : d === 'tvSeries' ? 'TV Shows' : d));
    }

    const yAxis = d3.axisLeft(this.yScale).tickFormat(d3.format(".1f"));

    this.xAxisGroup.transition().duration(500).call(xAxis);
    this.yAxisGroup.transition().duration(500).call(yAxis);

    this.xAxisGroup.selectAll("text").style("font-size", "30px").style("fill", "#333");
    this.yAxisGroup.selectAll("text").style("font-size", "30px").style("fill", "#333");

    const boxGroup = this.chartGroup.selectAll(".box-group")
        .data(stats, d => d.key)
        .join("g")
        .attr("class", "plot-element box-group")
        .attr("transform", d => `translate(${this.xScale(d.key)}, 0)`)
        .style("cursor", "pointer")
        // In correlationPlot.js, inside the _updateBoxPlot method

        .on("mouseover", (event, d) => {
            d3.select(event.currentTarget).select("rect")
                .attr("stroke-width", 3)
                .attr("stroke", "#007bff");

            const header = (d.key === 'movie') ? 'Movies' : (d.key === 'tvSeries' || d.key === 'tvseries') ? 'TV Shows' : d.key;
            let typeDistributionText = (d.typeDistribution || '')
                .replace(/\bmovie\b/gi, "Movies")
                .replace(/\btvSeries\b/gi, "TV Shows")
                .replace(/\btvseries\b/gi, "TV Shows");

            this.tooltip.transition().duration(200).style("opacity", 1);
            this.tooltip.html(`
                <div style="font-weight:700; font-size:35px; margin-bottom:8px; color:#fff;">${header}</div>
                <div style="border-top:1px solid rgba(255,255,255,0.08); margin:6px 0;"></div>
                <div style="color:#fff; font-weight:700; margin-bottom:4px;">📊 Statistics</div>
                <div style="color:#f1f3f5">🔢 Count: ${d.count.toLocaleString()}</div>
                <div style="color:#f1f3f5">📊 Median: ${d.median.toFixed(2)}/10</div>
                <div style="color:#f1f3f5">📈 Mean: ${d.mean.toFixed(2)}/10</div>
                <div style="color:#f1f3f5">σ Std Dev: ${d.stdDev ? d.stdDev.toFixed(2) : 'N/A'}</div>
                <div style="color:#f1f3f5">↕ Range: ${d.min.toFixed(1)} – ${d.max.toFixed(1)}</div>
                <div style="border-top:1px solid rgba(255,255,255,0.08); margin:6px 0;"></div>
                <div style="color:#fff; font-weight:700; margin-bottom:4px;">📂 Distribution</div>
                <div style="color:#f1f3f5">${typeDistributionText}</div>
                <div style="margin-top:8px; color:#aaa; font-weight:700;"><em>Click to drill down</em></div>
            `);

            const maxWidth = (window.innerWidth || document.documentElement.clientWidth);
            const left = Math.min(event.pageX + 15, maxWidth - 240);
            const top = Math.max(10, event.pageY - 10);
            this.tooltip.style("left", left + "px").style("top", top + "px");
        })  
        .on("mouseout", (event) => {
            d3.select(event.currentTarget).select("rect")
                .attr("stroke-width", 1)
                .attr("stroke", "#888");

            this.tooltip.transition().duration(150).style("opacity", 0);
        })
        .on("click", (event, d) => {
            this.tooltip.style("opacity", 0);
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
        .attr("x1", this.xScale.bandwidth() * 0.3).attr("x2", this.xScale.bandwidth() * 0.7)
        .attr("stroke", "#888").attr("stroke-width", 1.5);

    boxGroup.append("rect")
        .attr("class", "box-rect")
        .attr("y", d => this.yScale(d.q3))
        .attr("width", this.xScale.bandwidth())
        .attr("height", d => this.yScale(d.q1) - this.yScale(d.q3))
        .attr("stroke", "#888").attr("stroke-width", 1)
        .style("fill", d => this.color({ data: { genre: d.dominantGenre } })) // Corrected fill call
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
        const r2 = 1 - (ssRes / ssTotal);
        return { slope, intercept, r2: Math.max(0, r2) };
    }
}