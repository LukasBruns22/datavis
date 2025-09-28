class SunburstChart {
    constructor(selector, data, onSliceClickCallback, colorFunction) {
        this.selector = selector;
        this.data = data;
        this.onSliceClick = onSliceClickCallback;
        this.color = colorFunction;
    }

    draw() {
    // Clear any existing chart
    d3.select(this.selector).select('svg').remove();

    const self = this;
    const data = this.data;

    // Get container dimensions
    const container = d3.select(this.selector).node().getBoundingClientRect();
    const width = container.width;
    const height = container.height;

    // Use half of smaller dimension as radius
    const radius = Math.min(width, height) / 2;

    // Create hierarchy
    const hierarchy = d3.hierarchy(data)
        .sum(d => d.value || 1)
        .sort((a, b) => b.value - a.value);

    // Partition layout: vertical scale = radius
    const root = d3.partition()
        .size([2 * Math.PI, radius])(hierarchy);
    root.each(d => d.current = d);

    // Arc generator
    const arc = d3.arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .innerRadius(d => d.y0)
        .outerRadius(d => d.y1 - 1)
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
        .padRadius(radius);

    // SVG
    const svg = d3.select(this.selector).append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [-width / 2, -height / 2, width, height])
        .style("font", "10px sans-serif");

    // Paths
    const path = svg.append("g")
        .selectAll("path")
        .data(root.descendants().slice(1))
        .join("path")
        .attr("fill", d => this.color(d))
        .attr("fill-opacity", d => (d.depth === 1) ? (d.children ? 0.9 : 0.7) : 0)
        .attr("pointer-events", d => (d.depth === 1) ? "auto" : "none")
        .attr("d", d => arc(d.current))
        .style("cursor", d => d.children ? "pointer" : "default");

    path.filter(d => d.children).on("click", clicked);

    path.append("title")
        .text(d => {
            const pathNames = d.ancestors().map(a => a.data.name).reverse().join(" → ");
            const value = d.value || 0;
            return `${pathNames}\nCount: ${value}`;
        });

    // Labels
    const label = svg.append("g")
        .attr("pointer-events", "none")
        .attr("text-anchor", "middle")
        .style("user-select", "none")
        .selectAll("text")
        .data(root.descendants().slice(1))
        .join("text")
        .attr("dy", "0.35em")
        .attr("fill-opacity", d => (d.depth === 1) ? 1 : 0)
        .attr("transform", d => labelTransform(d.current))
        .style("font-size", "11px")
        .style("font-weight", d => d.depth === 1 ? "bold" : "normal")
        .text(d => {
            const name = d.data.name;
            const arcLength = d.x1 - d.x0;
            const maxLength = arcLength > 0.3 ? 12 : (arcLength > 0.15 ? 8 : 6);
            return name.length > maxLength ? name.substring(0, maxLength) + "..." : name;
        });

    // Center circle
    const parent = svg.append("circle")
        .datum(root)
        .attr("r", radius / (root.height + 1)) // keep center circle proportional
        .attr("fill", "white")
        .attr("stroke", "#ccc")
        .attr("stroke-width", 2)
        .attr("pointer-events", "all")
        .style("cursor", "pointer")
        .on("click", clicked);

    // Center text
    const centerText = svg.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .style("font-weight", "bold")
        .style("pointer-events", "none")
        .text("Media");

    // Click handler
    function clicked(event, p) {
        centerText.text(p.data.name || "Media");
        parent.datum(p.parent || root);

        root.each(d => d.target = {
            x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            y0: Math.max(0, d.y0 - p.depth * (radius / root.height)),
            y1: Math.max(0, d.y1 - p.depth * (radius / root.height))
        });

        const t = svg.transition().duration(750);
        const isVisible = d => d.target.y1 <= radius && d.target.y0 >= 0 && d.target.x1 > d.target.x0;

        path.transition(t)
            .tween("data", d => {
                const i = d3.interpolate(d.current, d.target);
                return t => d.current = i(t);
            })
            .filter(function(d) {
                return +this.getAttribute("fill-opacity") || isVisible(d);
            })
            .attr("fill-opacity", d => isVisible(d) ? (d.children ? 0.9 : 0.7) : 0)
            .attr("pointer-events", d => isVisible(d) && d.children ? "auto" : "none")
            .attrTween("d", d => () => arc(d.current));

        label.transition(t)
            .filter(function(d) {
                return +this.getAttribute("fill-opacity") || isVisible(d);
            })
            .attr("fill-opacity", d => {
                if (!isVisible(d)) return 0;
                const arcLength = d.target.x1 - d.target.x0;
                return arcLength > 0.08 ? 1 : 0;
            })
            .attrTween("transform", d => () => labelTransform(d.current))
            .text(d => {
                const name = d.data.name;
                const arcLength = d.target.x1 - d.target.x0;
                const maxLength = arcLength > 0.3 ? 12 : (arcLength > 0.15 ? 8 : 6);
                return name.length > maxLength ? name.substring(0, maxLength) + "..." : name;
            });

        // Callback
        const currentPath = p.ancestors().map(d => d.data.name).reverse().slice(1);
        self.onSliceClick(currentPath, p.depth);
    }

    function labelTransform(d) {
        const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        const y = (d.y0 + d.y1) / 2;
        return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
    }
}


    // Simple helper methods
    updateColors() {
        d3.select(this.selector)
            .selectAll("path")
            .attr("fill", d => this.color(d));
    }

    resize() {
        this.draw();
    }
}