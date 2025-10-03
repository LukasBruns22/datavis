class SunburstChart {
    constructor(selector, data, dispatcher, colorFunction) {
        this.selector = selector;
        this.data = data;
        this.dispatcher = dispatcher;
        this.color = colorFunction;
    }

    draw() {
        // small helper to map certain internal names to display names
        function formatName(name) {
            if (typeof name !== 'string') return name;
            if (name === 'movie') return 'Movies';
            if (name === 'tvSeries') return 'TV Show';
            return name;
        }

        // Clear any existing chart and tooltip
        d3.select(this.selector).select('svg').remove();
        d3.select('body').select('.tooltip').remove();

        // --- TOOLTIP CREATION ---
        const tooltip = d3.select('body').append('div')
            .attr('class', 'tooltip') 
            .style('position', 'absolute')
            .style('opacity', 0)
            .style('pointer-events', 'none')
            .style('background-color', 'rgba(0, 0, 0, 0.85)')
            .style('color', 'white')
            .style('padding', '30px 50px')
            .style('border-radius', '8px')
            .style('font-family', 'sans-serif')
            .style('font-size', '35px')
            .style('line-height', '1.5')
            .style('max-width', '450px')
            .style('transition', 'opacity 0.2s')
            .style('box-shadow', '0 4px 8px rgba(0,0,0,0.2)');

        // --- CHART SETUP ---
        const self = this;
        const data = this.data;

        const containerWidth = d3.select(this.selector).node().getBoundingClientRect().width;
        const containerHeight = d3.select(this.selector).node().getBoundingClientRect().height;
        const width = Math.min(containerWidth, containerHeight);
        const height = width;

        const hierarchy = d3.hierarchy(data)
            .sum(d => d.value || 0)
            .sort((a, b) => {
                if (!a.parent || !b.parent) return 0;
                
                const aName = a.data.name;
                const bName = b.data.name;
                
                if (aName.includes('-') && bName.includes('-') && 
                    aName.match(/^\d{4}\s*-\s*\d{4}$/) && bName.match(/^\d{4}\s*-\s*\d{4}$/)) {
                    const aYear = parseInt(aName.split('-')[0]);
                    const bYear = parseInt(bName.split('-')[0]);
                    return aYear - bYear;
                }
                
                const runtimeOrder = ["Short (< 45 min)", "Standard (45-119 min)", "Long (120-179 min)", "Epic (> 180 min)"];
                const aRuntimeIdx = runtimeOrder.indexOf(aName);
                const bRuntimeIdx = runtimeOrder.indexOf(bName);
                if (aRuntimeIdx !== -1 && bRuntimeIdx !== -1) {
                    return aRuntimeIdx - bRuntimeIdx;
                }
                
                const ratingOrder = ["Below Average (<6.0)", "Average (6.0-6.9)", "Good (7.0-7.9)", "Great (8.0-8.9)", "Excellent (9.0-10.0)"];
                const aRatingIdx = ratingOrder.indexOf(aName);
                const bRatingIdx = ratingOrder.indexOf(bName);
                if (aRatingIdx !== -1 && bRatingIdx !== -1) {
                    return aRatingIdx - bRatingIdx;
                }
                
                if (!a.children && !b.children && a.data.rating && b.data.rating) {
                    return a.data.rating - b.data.rating;
                }
                
                return 0;
            });
        
        const root = hierarchy;
        root.x0 = 0;
        root.x1 = 2 * Math.PI;

        root.eachBefore(d => {
            d.y0 = d.depth;
            d.y1 = d.depth + 1;
            if (d.children) {
                const angleRange = d.x1 - d.x0;
                const numChildren = d.children.length;
                if (numChildren > 0) {
                    const childAngleWidth = angleRange / numChildren;
                    d.children.forEach((child, i) => {
                        child.x0 = d.x0 + i * childAngleWidth;
                        child.x1 = d.x0 + (i + 1) * childAngleWidth;
                    });
                }
            }
        });
        
        root.each(d => d.current = d);
        
        this.rootNode = root;

        const outerRadius = (width / 2) * 0.98;
        const ringThickness = outerRadius * 0.6;
        const innerRadius = outerRadius - ringThickness;
    
        const arc = d3.arc()
            .startAngle(d => d.x0)
            .endAngle(d => d.x1)
            .padAngle(0)
            .innerRadius(innerRadius)
            .outerRadius(outerRadius);

        const svg = d3.select(this.selector).append("svg")
            .attr("viewBox", [-width / 2, -height / 2, width, width])
            .style("font", "10px sans-serif");
        
        // --- PATHS & MOUSE EVENTS ---
        const path = svg.append("g")
            .selectAll("path")
            .data(root.descendants().slice(1))
            .join("path")
            .attr("fill", d => this.color(d))
            .attr("fill-opacity", d => (d.depth === 1) ? (d.children ? 0.9 : 0.7) : 0)
            .attr("pointer-events", d => (d.depth === 1) ? "auto" : "none")
            .attr("d", d => arc(d.current))
            .style("cursor", d => d.children ? "pointer" : "default")
            .on("mouseover", function(event, d) {
                tooltip.transition().duration(200).style("opacity", 1);
                const ancestorNames = d.ancestors().map(a => a.data.name).reverse();
                const currentSegment = ancestorNames.pop();
                const displayAncestors = ancestorNames.map(n => formatName(n));
                const displayCurrent = formatName(currentSegment);
                const value = d.value || 0;
                const totalValue = root.value;
                const percentageOfTotal = (value / totalValue * 100).toFixed(2);
                const percentageOfParent = d.parent ? (value / d.parent.value * 100).toFixed(2) : 100.00;
                const pathString = displayAncestors.length > 0
                    ? `<div style="font-size: 28px; color: #bbb; margin-bottom: 15px;">
                           <span style="font-weight: 500;">Path:</span> ${displayAncestors.join(' → ')}
                       </div>`
                    : '';
                tooltip.html(`
                    <div style="font-size: 40px; font-weight: bold; color: #fff; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #555;">
                        ${displayCurrent}
                    </div>
                    ${pathString}
                    <div style="font-size: 32px; line-height: 1.6;">
                        <strong>Count:</strong> ${value.toLocaleString()}<br>
                        <strong>Of Total:</strong> ${percentageOfTotal}%<br>
                        ${d.parent && d.parent !== root ? `<strong>Of Parent:</strong> ${percentageOfParent}%` : ''}
                    </div>
                    ${d.children ? `<div style="margin-top: 15px; padding-top: 12px; border-top: 1px solid #555; font-style: italic; color: #999; font-size: 26px;">Click to drill down</div>` : ''}
                `);
            })
            .on("mousemove", function(event, d) {
                tooltip.style("left", (event.pageX + 15) + "px")
                       .style("top", (event.pageY + 15) + "px");
            })
            .on("mouseout", function(event, d) {
                tooltip.transition().duration(500).style("opacity", 0);
            });

        // --- LABELS ---
        const label = svg.append("g")
            .attr("pointer-events", "none") 
            .attr("text-anchor", "middle")
            .style("user-select", "none")
            .selectAll("text")
            .data(root.descendants().slice(1))
            .join("text")
            .attr("fill", "black") 
            .attr("dy", "0.35em")
            .attr("fill-opacity", d => (d.depth === 1) ? 1 : 0)
            .attr("transform", d => labelTransform(d.current))
            .style("font-size", d => d.depth > 3 ? "24px" : "35px")
            .style("font-weight", d => d.depth === 1 ? "bold" : "normal")
            .text(d => formatName(d.data.name));

        path.filter(d => d.children)
            .on("click", clicked);

        const parent = svg.append("circle")
            .datum(root)
            .attr("r", innerRadius)
            .attr("fill", "white")
            .attr("stroke", "#ccc")
            .attr("stroke-width", 2)
            .attr("pointer-events", "all")
            .style("cursor", "pointer")
            .on("click", clicked);

        const centerText = svg.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-weight", "bold")
            .style("pointer-events", "none")
            .style("font-size", "35px")
            .text("Media");

        function clicked(event, p, isProgrammatic = false) {
            const titleElement = d3.select("#sunburst-title");
            if (p && p.depth > 0) {
                const pathArray = p.ancestors()
                                   .map(d => formatName(d.data.name))
                                   .reverse()
                                   .slice(1);
                titleElement.text(`Explorer: ${pathArray.join(' → ')}`);
            } else {
                titleElement.text("Hierarchical Explorer");
            }
            
            // --- FIX STARTS HERE ---
            // Only emit an event if it's a direct user click
            if (!isProgrammatic && self.dispatcher) {
                const currentPath = p.ancestors().map(d => d.data.name).reverse().slice(1);
                self.dispatcher.emit('pathChange', {
                    path: currentPath,
                    depth: p.depth,
                    isGoBack: false
                });
            }
            // --- FIX ENDS HERE ---

            centerText.text(p && p.data && p.data.name ? formatName(p.data.name) : "Media");
            parent.datum(p.parent || root);

            root.each(d => d.target = {
                x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
                x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
                y0: Math.max(0, d.y0 - p.depth),
                y1: Math.max(0, d.y1 - p.depth)
            });

            const t = svg.transition().duration(750);
            const isVisible = d => d.target.y1 <= 2 && d.target.y0 >= 1 && d.target.x1 > d.target.x0;

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

            label.transition(t)
                .filter(function (d) {
                    return +this.getAttribute("fill-opacity") || isVisible(d);
                })
                .attr("fill-opacity", d => isVisible(d) ? 1 : 0)
                .attrTween("transform", d => () => labelTransform(d.current))
                .text(d => formatName(d.data.name)); 
        }

        function labelTransform(d) {
            const angle = (d.x0 + d.x1) / 2 * 180 / Math.PI;
            const r = (innerRadius + outerRadius) / 2;
            return `rotate(${angle - 90}) translate(${r},0) rotate(${angle < 180 ? 0 : 180})`;
        }

        this.zoomToNode = clicked;
    }

    updateColors() {
        d3.select(this.selector)
            .selectAll("path")
            .attr("fill", d => this.color(d));
    }

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

        this.zoomToNode(null, targetNode, true); 
    }

    resize() {
        this.draw();
    }
}