class CorrelationPlot {
    constructor(svgSelector, initialData, colorFunction, topGenres, onBoxClickCallback) {
        this.svg = d3.select(svgSelector);
        this.data = initialData;
        this.color = colorFunction;
        this.topGenres = topGenres;
        this.onBoxClick = onBoxClickCallback; // callback for drill-down
        this.margin = { top: 20, right: 30, bottom: 60, left: 60 };
        this._setupChartArea();
        this.resize();
    }

    _setupChartArea() {
        this.chartGroup = this.svg.append("g");
        this.xAxisGroup = this.chartGroup.append("g").attr("class", "x-axis");
        this.yAxisGroup = this.chartGroup.append("g").attr("class", "y-axis");
        this.xAxisLabel = this.chartGroup.append("text").attr("class", "axis-label").style("text-anchor", "middle");
        this.yAxisLabel = this.chartGroup.append("text").attr("class", "axis-label").style("text-anchor", "middle");
        this.tooltip = d3.select("body").append("div").attr("class", "tooltip").style("opacity", 0);
    }

    resize() {
        const container = this.svg.node().parentElement;
        const containerWidth = container.getBoundingClientRect().width;
        const containerHeight = container.getBoundingClientRect().height;

        this.svg
            .attr('width', containerWidth)
            .attr('height', containerHeight);

        this.width = containerWidth - this.margin.left - this.margin.right;
        this.height = containerHeight - this.margin.top - this.margin.bottom;

        this.chartGroup.attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
        this.xAxisGroup.attr("transform", `translate(0, ${this.height})`);

        this.xAxisLabel
            .attr("transform", `translate(${this.width / 2}, ${this.height + this.margin.bottom - 10})`);

        this.yAxisLabel
            .attr("transform", `translate(-40, ${this.height / 2}) rotate(-90)`);
    }

    update(data, attribute) {
        this.chartGroup.selectAll(".plot-element").remove();
        this.yAxisLabel.text("IMDB Rating");

        const yValue = d => d.rating;

        if (attribute === 'year') {
            // Boxplots for 5-year intervals
            this._updateBoxPlot(data, 'year', yValue);
        } else if (['runtime', 'rating'].includes(attribute) && data.length > 1) {
            this._updateScatterPlot(data, attribute, yValue);
        } else {
            this._updateBoxPlot(data, attribute || 'genre', yValue);
        }
    }

    _updateScatterPlot(data, xAttribute, yValue) {
        this.xAxisLabel.text(xAttribute.charAt(0).toUpperCase() + xAttribute.slice(1));
        const xValue = d => d[xAttribute];
        this.xScale = d3.scaleLinear().domain(d3.extent(data, xValue)).nice().range([0, this.width]);
        this.yScale = d3.scaleLinear().domain(d3.extent(data, yValue)).nice().range([this.height, 0]);
        this.xAxisGroup.transition().duration(500).call(d3.axisBottom(this.xScale));
        this.yAxisGroup.transition().duration(500).call(d3.axisLeft(this.yScale));
        
        const saturationAttribute = xAttribute;
        this.chartGroup.selectAll(".plot-element")
            .data(data)
            .join("circle")
              .attr("class", "plot-element")
              .attr("cx", d => this.xScale(xValue(d)))
              .attr("cy", d => this.yScale(yValue(d)))
              .attr("r", 4)
              .style("fill", d => this.color(d, saturationAttribute))
              .style("opacity", 0.8)
              .style("stroke", "black")
              .style("stroke-width", 0.5);
    }

    _updateBoxPlot(data, groupingAttribute, yValue) {
        this.xAxisLabel.text(groupingAttribute.charAt(0).toUpperCase() + groupingAttribute.slice(1));

        let groupingFunction;
        if (groupingAttribute === 'genre') {
            groupingFunction = d => this.topGenres.includes(d.genre) ? d.genre : 'Other';
        } else if (groupingAttribute === 'year') {
            groupingFunction = d => getYearBin(d.year); // 5-year bins
        } else {
            groupingFunction = d => d[groupingAttribute];
        }

        const groupedData = d3.group(data, groupingFunction);
        if (groupingAttribute === 'year') groupedData.delete(null); // remove empty/future bins

        const stats = Array.from(groupedData, ([key, values]) => {
            const ratings = values.map(yValue).sort(d3.ascending);
            const q1 = d3.quantile(ratings, 0.25);
            const median = d3.quantile(ratings, 0.5);
            const q3 = d3.quantile(ratings, 0.75);
            const iqr = q3 - q1;
            const min = Math.max(d3.min(ratings), q1 - 1.5 * iqr);
            const max = Math.min(d3.max(ratings), q3 + 1.5 * iqr);

            const genreCounts = d3.rollup(values, v => v.length, d => d.genre);
            const dominantGenre = Array.from(genreCounts.entries())
                .sort((a, b) => b[1] - a[1])[0][0];

            const representativeItem = values[0];

            return { 
                key, min, q1, median, q3, max, representativeItem, dominantGenre
            };
        });

        // Domain order: chronological for year
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

        this.xScale = d3.scaleBand().domain(domainOrder).range([0, this.width]).padding(0.4);
        this.yScale = d3.scaleLinear().domain([0, 10]).nice().range([this.height, 0]);

        const xAxis = d3.axisBottom(this.xScale);
        if (groupingAttribute === 'type') {
            xAxis.tickFormat(d => (d === 'movie' ? 'Movies' : d === 'tvSeries' ? 'TV Shows' : d));
        }
        this.xAxisGroup.transition().duration(500).call(xAxis);
        this.yAxisGroup.transition().duration(500).call(d3.axisLeft(this.yScale));

        // --- Create box groups with click handler ---
        const boxGroup = this.chartGroup.selectAll(".box-group")
            .data(stats, d => d.key)
            .join("g")
            .attr("class", "plot-element box-group")
            .attr("transform", d => `translate(${this.xScale(d.key)}, 0)`)
            .style("cursor", "pointer") // show clickable
            .on("mouseover", function() { d3.select(this).select("rect").attr("stroke-width", 3); })
            .on("mouseout", function() { d3.select(this).select("rect").attr("stroke-width", 1); })
            .on("click", (event, d) => { // <-- arrow function keeps 'this' bound correctly
                const path = [d.key]; 
                const depth = HIERARCHY_LEVELS.indexOf(groupingAttribute) + 1;
                if (this.onBoxClick) this.onBoxClick(path, depth); // call callback
            });

        // --- Draw boxplot elements ---
        boxGroup.append("line")
            .attr("x1", this.xScale.bandwidth() / 2)
            .attr("x2", this.xScale.bandwidth() / 2)
            .attr("y1", d => this.yScale(d.min))
            .attr("y2", d => this.yScale(d.max))
            .attr("stroke", "#000");

        boxGroup.append("rect")
            .attr("y", d => this.yScale(d.q3))
            .attr("width", this.xScale.bandwidth())
            .attr("height", d => this.yScale(d.q1) - this.yScale(d.q3))
            .attr("stroke", "black")
            .style("fill", d => {
                let colorData;
                if (groupingAttribute === 'genre') {
                    colorData = { genre: d.key, type: d.representativeItem.type };
                } else if (groupingAttribute === 'type') {
                    const typeData = this.data.filter(item => item.type === d.key);
                    const genreCounts = d3.rollup(typeData, v => v.length, d => d.genre);
                    const sortedGenres = Array.from(genreCounts.entries())
                        .sort((a, b) => b[1] - a[1])
                        .map(d => d[0]);
                    const dominantTopGenre = sortedGenres.find(g => this.topGenres.includes(g)) || this.topGenres[0];
                    colorData = { type: d.key, genre: dominantTopGenre };
                } else if (groupingAttribute === 'year') {
                    colorData = { type: d.representativeItem.type, genre: d.representativeItem.genre };
                } else {
                    colorData = { [groupingAttribute]: d.key, type: d.representativeItem.type, genre: d.representativeItem.genre };
                }
                return this.color(colorData);
            });

        boxGroup.append("line")
            .attr("x1", 0)
            .attr("x2", this.xScale.bandwidth())
            .attr("y1", d => this.yScale(d.median))
            .attr("y2", d => this.yScale(d.median))
            .attr("stroke", "black")
            .attr("stroke-width", 2);
    }
}
