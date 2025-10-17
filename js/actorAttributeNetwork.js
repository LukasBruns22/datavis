import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getColor, BINNING_FUNCTIONS, formatLabels, capitalize } from "./helper.js";
import { HIERARCHY_LEVELS } from "./config.js";


export class ActorAttributeNetwork {
    constructor(containerSelector, data, dispatcher, stateManager) {
        this.container = d3.select(containerSelector);
        this.svg = this.container.append("svg");
        this.chartGroup = this.svg.append("g");
        this.stateManager = stateManager
        this.data = data;
        this.dispatcher = dispatcher;
        this.margin = { top: 10, right: 0, bottom: 10, left: 0 };
        this.currentAttribute = "type";
        this.currentPath = stateManager.getCurrentPath()
        this.alpha = 0.5;
        this._createAlphaSlider();
        this.resize();
        this.update(this.data, this.currentAttribute)
    }

    resize() {
        const rect = this.container.node().getBoundingClientRect();
        this.width = rect.width - this.margin.left - this.margin.right;
        this.height = rect.height - this.margin.top - this.margin.bottom;
        this.svg.attr("viewBox", `0 0 ${rect.width} ${rect.height}`);
    }

    _createAlphaSlider() {
        const container = this.container;

        const sliderContainer = container.insert("div", "svg")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "10px")
            .style("margin-right", "100px")
            .style("margin-left", "100px")
            .style("margin-top", "20px");

        const sliderTooltip = sliderContainer.append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("padding", "5px 5px")
            .style("background", "rgba(72, 72, 72, 0.85)")
            .style("color", "white")
            .style("font-size", "8px")
            .style("pointer-events", "none")
            .style("opacity", 0)
            .style("border-radius", "8px")
            .style("max-width", "100px");

        sliderContainer.append("label")
            .text("α")
            .style("font-weight", "bold")
            .style("font-size", "15px")
            .append("title")

        const slider = sliderContainer.append("input")
            .attr("type", "range")
            .attr("min", 0)
            .attr("max", 1)
            .attr("step", 0.01)
            .attr("value", this.alpha)
            .style("flex", "1")
            .style("cursor", "pointer");

        const valueLabel = sliderContainer.append("span")
            .text(this.alpha.toFixed(2))
            .style("font-size", "12px");

        slider.on("input", (event) => {
            this.alpha = +event.target.value;
            valueLabel.text(this.alpha.toFixed(2));
            this.update(this.data, this.currentAttribute);
        });
        slider.on("mouseover", (event, d) => {
            sliderTooltip.transition().duration(1000).style("opacity", 1);

            let html = `<div style="font-size: 14px; font-weight: bold; color: #fff; padding-bottom: 6px; border-bottom: 1px solid #555;">
            Adjust the balance between an actor's average rating and number of movies when selecting top actors.
            </div>`;

            sliderTooltip.html(html)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        slider.on("mouseout", () => {
            sliderTooltip.transition().duration(150).style("opacity", 0);
        })
    }

    update(data, attribute) {
        this.currentAttribute = attribute;
        this.currentPath = this.stateManager.getCurrentPath()
        const { persons, titles } = data;
        const { nodes, links } = this._buildNetwork(persons, titles, attribute);
        this._render(nodes, links);
    }

    _buildNetwork(persons, titles, attribute) {
        const topGenres = this.stateManager.getTopGenres();
        const titleById = new Map(titles.map(t => [t.tconst, t]));
        const actorMap = new Map();
        const attributeMap = new Map();
        const links = [];

        const binCache = new Map();
        const getBinned = (attr, val) => {
            const key = `${attr}:${val}`;
            if (!binCache.has(key)) {
                binCache.set(key, BINNING_FUNCTIONS[attr]?.(val) ?? val);
            }
            return binCache.get(key);
        };

        for (const person of persons) {
            const relatedTitles = person.jobs.map(id => titleById.get(id)).filter(Boolean);
            if (relatedTitles.length === 0) continue;

            const attributeCounts = new Map();
            const ratings = [];

            for (const t of relatedTitles) {
                ratings.push(t.rating);
                if (attribute === "genre" && Array.isArray(t.genres)) {
                    for (const g of t.genres) {
                        const genre = topGenres.includes(g) ? g : "Other";
                        attributeCounts.set(genre, (attributeCounts.get(genre) || 0) + 1);
                    }
                } else {
                    const val = BINNING_FUNCTIONS[attribute] ? getBinned(attribute, t[attribute]) : t[attribute];
                    attributeCounts.set(val, (attributeCounts.get(val) || 0) + 1);
                }
            }

            const avgRating = d3.mean(ratings);
            const actorNode = {
                id: person.primaryName,
                nodeType: "actor",
                avgRating,
                value: relatedTitles.length,
                attributes: Array.from(attributeCounts.keys())
            };
            actorMap.set(actorNode.id, actorNode);

            for (const [attr, count] of attributeCounts) {
                if (!attributeMap.has(attr)) {
                    attributeMap.set(attr, { id: attr, nodeType: "attribute", attributeType: attribute, value: 1 });
                } else {
                    attributeMap.get(attr).value += 1;
                }
                links.push({ source: actorNode.id, target: attr, strength: 1, count });
            }
        }


        const topN = attribute == "genre" ? 3 : 4;
        const selectedActors = new Set();

        const actorsArray = Array.from(actorMap.values());
        const ratingExtent = d3.extent(actorsArray, d => d.avgRating);
        const valueExtent = d3.extent(actorsArray, d => d.value);

        attributeMap.forEach((_, attr) => {
            const actorsForAttr = actorsArray
                .filter(a => a.attributes.includes(attr))
                .map(a => {
                    const normalizedRating = (a.avgRating - ratingExtent[0]) / (ratingExtent[1] - ratingExtent[0] || 1);
                    const normalizedValue = (a.value - valueExtent[0]) / (valueExtent[1] - valueExtent[0] || 1);
                    a.score = this.alpha * normalizedRating + (1 - this.alpha) * normalizedValue;
                    return a;
                })
                .sort((a, b) => d3.descending(a.score, b.score))
                .slice(0, topN);

            actorsForAttr.forEach(a => selectedActors.add(a.id));
        });

        const filteredActors = Array.from(selectedActors).map(id => actorMap.get(id));
        const filteredLinks = links.filter(l => selectedActors.has(l.source));

        const nodes = [...filteredActors, ...attributeMap.values()];
        return { nodes, links: filteredLinks };
    }

    _render(nodes, links) {
        const width = this.width;
        const height = this.height;
        this.chartGroup.selectAll("*").remove();

        const actorSizeScale = d3.scaleSqrt()
            .domain(d3.extent(nodes.filter(d => d.nodeType === "actor"), d => d.value))
            .range([5, 30]);

        const attributeSizeScale = d3.scaleSqrt()
            .domain(d3.extent(nodes.filter(d => d.nodeType === "attribute"), d => d.value))
            .range([15, 35]);

        const link = this.chartGroup.selectAll(".link")
            .data(links)
            .join("line")
            .attr("class", "link")
            .style("stroke", "#999")
            .style("stroke-opacity", 0.6)
            .style("stroke-width", d => Math.sqrt(d.strength));

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

        const node = this.chartGroup.selectAll(".node")
            .data(nodes)
            .join("circle")
            .attr("class", "node")
            .attr("r", d => d.nodeType === "attribute" ? attributeSizeScale(d.value) : actorSizeScale(d.value))
            .attr("fill", d => {
                if (d.nodeType === "attribute") {
                    return getColor(d.id, this.stateManager);
                } else if (d.nodeType === "actor") {
                    const ratingScale = this.stateManager.getRatingColorScale();
                    return ratingScale(d.avgRating);
                } else {
                    return "#999999";
                }
            })
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => {
                tooltip.transition().duration(150).style("opacity", 1);
                const path = this.stateManager.getCurrentPath();
                const formatSegment = s => s
                    ? capitalize(s)
                    : s;

                const pathString = path.length
                    ? path.map(formatSegment).join(" → ")
                    : "All Media";
                const pathMarkup = path.length
                    ? `<div style="font-size: 12px; color: #bbb; margin-bottom: 8px;">
               <span style="font-weight: 500;">Path:</span> ${pathString}
           </div>`
                    : "";

                let html = `<div style="font-size: 14px; font-weight: bold; color: #fff; padding-bottom: 6px; border-bottom: 1px solid #555;">
                ${capitalize(formatLabels(d.id))}
            </div><br/>`;
                html += pathMarkup


                if (d.nodeType === "actor") {
                    html += `<br/>Average Rating: ${d.avgRating.toFixed(1)}<br/>`;

                    const connected = links
                        .filter(l => l.source.id === d.id || l.source === d.id)
                        .map(l => ({ attr: l.target.id || l.target, count: l.count || 1 }));

                    const counts = d3.rollups(
                        connected,
                        v => d3.sum(v, x => x.count),
                        v => v.attr
                    );

                    const totalTitles = d3.sum(counts, d => d[1]);

                    html += `<br/><strong>${capitalize(formatLabels(this.currentAttribute))}s:</strong><br/>`;

                    counts.forEach(([attr, count]) => {
                        html += `${capitalize(formatLabels(attr))} (${count})<br/>`;
                    });
                    html += `<div style="margin-top: 6px;"><strong>Total Titles:</strong> ${totalTitles}</div>`;
                    html += `<div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #555; font-style: italic; color: #999; font-size: 14px;">Click to highlight connections</div>`
                }
                // attribute tooltip
                else if (d.nodeType === "attribute") {
                    const connectedActors = links
                        .filter(l => l.target.id === d.id || l.target === d.id)
                        .map(l => ({ actor: l.source.id || l.source, count: l.count || 1 }));

                    const counts = d3.rollups(
                        connectedActors,
                        v => d3.sum(v, x => x.count),
                        v => v.actor
                    );

                    const totalTitles = d3.sum(counts, d => d[1]);

                    html += `<br/><strong>Actors:</strong><br/>`;
                    counts
                        .sort((a, b) => d3.descending(a[1], b[1]))
                        .forEach(([actor, count]) => {
                            html += `${actor} (${count})<br/>`;
                        });
                    html += `<div style="margin-top: 6px;"><strong>Total Titles:</strong> ${totalTitles}</div>`;
                    html += `<div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #555; font-style: italic; color: #999; font-size: 14px;">Click to drill down</div>`
                }

                tooltip.html(html)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mousemove", (event) => {
                tooltip
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseout", () => {
                tooltip.transition().duration(150).style("opacity", 0);
            })
            .on("click", (event, d) => {
                tooltip.transition().duration(100).style("opacity", 0); // hide tooltip
                this._onClick(d);
            })
            .call(
                d3.drag()
                    .on("start", (event, d) => {
                        if (!event.active) simulation.alphaTarget(0.3).restart();
                        d.fx = d.x;
                        d.fy = d.y;
                    })
                    .on("drag", (event, d) => {
                        d.fx = event.x;
                        d.fy = event.y;
                    })
                    .on("end", (event, d) => {
                        if (!event.active) simulation.alphaTarget(0);
                        d.fx = null;
                        d.fy = null;
                    })
            )

        const labels = this.chartGroup.selectAll(".node-label")
            .data(nodes)
            .join("text")
            .attr("class", "node-label")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-size", d => d.nodeType === "attribute" ? "12px" : "10px")
            .style("pointer-events", "none")
            .text(d => {
                if (d.nodeType === "actor") {
                    const parts = d.id.split(" ");
                    return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(-1)[0]}` : d.id;
                } else if (d.nodeType === "attribute") {
                    return capitalize(formatLabels(d.id));
                }
            })
            .each(function (d) {
                if (d.nodeType === "actor") {
                    const r = actorSizeScale(d.value);
                    const textWidth = this.getBBox().width;
                    if (textWidth > r * 2.5) d3.select(this).text("");
                }
            });

        const legendHeight = 100

        const ticked = () => {
            node.each(d => {
                d.x = Math.max(40, Math.min(width, d.x));
                d.y = Math.max(40, Math.min(height - legendHeight, d.y));
            });

            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);

            labels
                .attr("x", d => d.x)
                .attr("y", d => d.y);
        };

        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links)
                .id(d => d.id)
                .distance(120)
                .strength(0.1))
            .force("charge", d3.forceManyBody().strength(-500))
            //.force("collision", d3.forceCollide().radius(d => d.nodeType === "attribute" ? 30 : 10))
            //.force("x", d3.forceX().x(() => Math.random() * width).strength(0.01))
            //.force("y", d3.forceY().y(() => Math.random() * height).strength(0.01))
            //.force("link", d3.forceLink(links).id(d => d.id).distance(100))
            //.force("charge", d3.forceManyBody().strength(-200))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("x", d3.forceX(width / 2).strength(0.1))
            .force("y", d3.forceY(height / 2).strength(0.1))
            .on("tick", ticked);

        this._renderRatingLegend();

    }

    _renderRatingLegend() {
        const ratingScale = this.stateManager.getRatingColorScale();
        const [minRating, maxRating] = [6, 10];

        const n = 8;
        const bins = d3.range(minRating, maxRating + 0.001, (maxRating - minRating) / n);

        const colorStops = bins.slice(0, -1).map(r => ratingScale(r));
        this.chartGroup.selectAll(".rating-legend-group").remove();

        const legendGroup = this.chartGroup.append("g")
            .attr("class", "rating-legend-group");

        const rectWidth = 300;
        const rectHeight = 20;

        const totalWidth = n * (rectWidth / n);
        const startX = (this.width - totalWidth) / 2;
        const y = this.height - 40; // bottom position

        // Draw discrete rectangles
        colorStops.forEach((color, i) => {
            legendGroup.append("rect")
                .attr("x", startX + i * (rectWidth / n))
                .attr("y", y)
                .attr("width", rectWidth / n)
                .attr("height", rectHeight)
                .attr("fill", color)
                .attr("stroke", "#ccc");
        });

        // Add text labels under rectangles
        bins.slice(0, -1).forEach((b, i) => {
            legendGroup.append("text")
                .attr("x", startX + i * (rectWidth / n) + (rectWidth / n) / 2)
                .attr("y", y + rectHeight + 14)
                .attr("text-anchor", "middle")
                .style("font-size", "11px")
                .style("fill", "#333")
                .text(`${b.toFixed(1)}`);
        });

        // Add title
        legendGroup.append("text")
            .attr("x", this.width / 2)
            .attr("y", y - 8)
            .attr("text-anchor", "middle")
            .style("font-size", "13px")
            .style("font-weight", "600")
            .style("fill", "#222")
            .text("Average Rating");
    }

    _renderActorSizeLegend() {
        const legendGroup = this.chartGroup.append("g")
            .attr("class", "actor-size-legend")
            .attr("transform", `translate(${this.width - 150}, ${this.height - 150})`);

        const exampleCounts = [1, 5, 20]; // adjust as needed
        exampleCounts.forEach((count, i) => {
            const r = this.actorSizeScale(count);
            legendGroup.append("circle")
                .attr("cx", 0)
                .attr("cy", -r * 2 * i)
                .attr("r", r)
                .attr("fill", "none")
                .attr("stroke", "#555");

            legendGroup.append("text")
                .attr("x", 35)
                .attr("y", -r * 2 * i)
                .attr("alignment-baseline", "middle")
                .style("font-size", "11px")
                .text(`${count} titles`);
        });

        legendGroup.append("text")
            .attr("x", 0)
            .attr("y", -exampleCounts.length * 20 - 10)
            .text("Actor filmography size")
            .style("font-weight", "600")
            .style("font-size", "12px");
    }

    _onClick(d) {
        if (d.nodeType == "attribute") {
            const newPath = [...this.currentPath, d.id];
            if (newPath.length <= HIERARCHY_LEVELS.length) {
                this.currentPath = newPath;
                if (this.dispatcher) {
                    this.dispatcher.emit('pathChange', {
                        path: newPath,
                        depth: newPath.length,
                    });
                }
            }
        }
        else if (d.nodeType === "actor") {
            this._highlightActorConnections(d);
        }
    }

    _highlightActorConnections(actorNode) {
        const isAlreadyHighlighted = this.highlightedActor === actorNode.id;

        if (isAlreadyHighlighted) {
            this.chartGroup.selectAll(".node")
                .transition().duration(200)
                .style("opacity", 1);

            this.chartGroup.selectAll(".link")
                .transition().duration(200)
                .style("opacity", 0.8)
                .style("stroke-width", 1.5);

            this.chartGroup.selectAll(".node-label")
                .transition().duration(200)
                .style("opacity", 1)

            this.highlightedActor = null;
            return;
        }

        this.highlightedActor = actorNode.id;

        const connectedAttributes = new Set(actorNode.attributes);

        // highlight nodes
        this.chartGroup.selectAll(".node")
            .transition().duration(200)
            .style("opacity", d =>
                d.id === actorNode.id || connectedAttributes.has(d.id) ? 1 : 0.1
            );

        this.chartGroup.selectAll(".node-label")
            .transition().duration(200)
            .style("opacity", d =>
                d.id === actorNode.id || connectedAttributes.has(d.id) ? 1 : 0.1
            );

        // highlight links
        this.chartGroup.selectAll(".link")
            .transition().duration(200)
            .style("opacity", l =>
                l.source.id === actorNode.id || l.target.id === actorNode.id ? 1 : 0.1
            )
            .style("stroke-width", l =>
                l.source.id === actorNode.id || l.target.id === actorNode.id ? 3 : 1.5
            );
    }
}