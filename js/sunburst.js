class SunburstChart {
    constructor(selector, data, dispatcher, colorFunction) {
        this.selector = selector;
        this.data = data;
        this.dispatcher = dispatcher; // Store the dispatcher instance
        this.color = colorFunction;
    }

    draw() {
    // Clear any existing chart
    d3.select(this.selector).select('svg').remove();

    const self = this;
    const data = this.data;

    const containerWidth = d3.select(this.selector).node().getBoundingClientRect().width;
    const containerHeight = d3.select(this.selector).node().getBoundingClientRect().height;
    const width = Math.min(containerWidth, containerHeight);
    const height = width;

    const hierarchy = d3.hierarchy(data)
        .sum(d => d.value || 1)
        .sort((a, b) => b.value - a.value);

    const root = d3.partition().size([2 * Math.PI, hierarchy.height + 1])(hierarchy);
    root.each(d => d.current = d);

    // Store the root node on the class instance so `update` can access it.
    this.rootNode = root;

    const outerRadius = (width / 2) * 0.98;
    const ringThickness = outerRadius * 0.6; // 60% of radius
    const innerRadius = outerRadius - ringThickness;

    const arc = d3.arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
        .padRadius(0)
        .innerRadius(innerRadius)
        .outerRadius(outerRadius);

    const svg = d3.select(this.selector).append("svg")
        .attr("viewBox", [-width / 2, -height / 2, width, width])
        .style("font", "10px sans-serif");

    // Create paths
    const path = svg.append("g")
        .selectAll("path")
        .data(root.descendants().slice(1))
        .join("path")
        .attr("fill", d => this.color(d))
        .attr("fill-opacity", d => (d.depth === 1) ? (d.children ? 0.9 : 0.7) : 0)
        .attr("pointer-events", d => (d.depth === 1) ? "auto" : "none")
        .attr("d", d => arc(d.current))
        .style("cursor", d => d.children ? "pointer" : "default");

    path.filter(d => d.children)
        .on("click", clicked);

    path.append("title")
        .text(d => {
            const pathNames = d.ancestors().map(a => a.data.name).reverse().join(" → ");
            const value = d.value || 0;
            return `${pathNames}\nCount: ${value}`;
        });

    // Create labels - keep it simple
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
        .style("font-size", "12px")
        .style("font-weight", d => d.depth === 1 ? "bold" : "normal")
        .text(d => {
            const name = d.data.name;
            const arcLength = d.x1 - d.x0;
            // Simple truncation based on arc size
            const maxLength = arcLength > 0.3 ? 12 : (arcLength > 0.15 ? 8 : 6);
            return name.length > maxLength ? name.substring(0, maxLength) + "..." : name;
        });

    // Center circle - keep original simple logic
    const parent = svg.append("circle")
        .datum(root)
        .attr("r", innerRadius)
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
        .style("font-size", "14px")
        .text("Media");

    function clicked(event, p, isProgrammatic = false) {
        centerText.text(p.data.name || "Media");
        parent.datum(p.parent || root);

        root.each(d => d.target = {
            x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
            y0: Math.max(0, d.y0 - p.depth),
            y1: Math.max(0, d.y1 - p.depth)
        });

        const t = svg.transition().duration(750);
        const isVisible = d => d.target.y1 <= 2 && d.target.y0 >= 1 && d.target.x1 > d.target.x0;

        // Animate paths
        path.transition(t)
            .tween("data", d => {
                const i = d3.interpolate(d.current, d.target);
                return t => d.current = i(t);
            })
            .filter(function (d) {
                return +this.getAttribute("fill-opacity") || isVisible(d);
            })
            .attr("fill-opacity", d => isVisible(d) ? (d.children ? 0.9 : 0.7) : 0)
            .attr("pointer-events", d => isVisible(d) && d.children ? "auto" : "none")
            .attrTween("d", d => () => arc(d.current));

        // Animate labels - simplified
        label.transition(t)
            .filter(function (d) {
                return +this.getAttribute("fill-opacity") || isVisible(d);
            })
            .attr("fill-opacity", d => {
                if (!isVisible(d)) return 0;
                // Show label if arc is wide enough
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

        // Notify other charts of the change
        if (!isProgrammatic) {
        const currentPath = p.ancestors().map(d => d.data.name).reverse().slice(1);
        self.dispatcher.emit('pathChange', { path: currentPath, depth: p.depth });
    }
    }

    function labelTransform(d) {
        const angle = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        const r = (innerRadius + outerRadius) / 2;
        return `rotate(${angle - 90}) translate(${r},0) rotate(${angle < 180 ? 0 : 180})`;
    }

    // Store the 'clicked' function on the class instance so `update` can call it.
    this.zoomToNode = clicked;
}

    // Simple helper methods
    updateColors() {
        d3.select(this.selector)
            .selectAll("path")
            .attr("fill", d => this.color(d));
    }

    // In sunburst.js, add this method inside the SunburstChart class

// In sunburst.js, inside the SunburstChart class

update(path) {
    if (!this.rootNode || !this.zoomToNode) {
        return;
    }
    let targetNode = this.rootNode;
    path.forEach(pathSegment => {
        const foundChild = targetNode.children?.find(child => child.data.name === pathSegment);
        if (foundChild) {
            targetNode = foundChild;
        }
    });

    // Pass 'true' to signify this is a programmatic update
    this.zoomToNode(null, targetNode, true); 
}

    resize() {
        this.draw();
    }
}