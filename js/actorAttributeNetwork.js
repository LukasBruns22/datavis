import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getColor, BINNING_FUNCTIONS, formatLabels, capitalize } from "./helper.js";
import { HIERARCHY_LEVELS } from "./config.js";
import { TooltipManager } from "./tooltipManager.js"; 

export class ActorAttributeNetwork {
    constructor(containerSelector, data, dispatcher, stateManager) {
        this.container = d3.select(containerSelector);
        this.svg = this.container.append("svg");
        this.chartGroup = this.svg.append("g");
        this.stateManager = stateManager
        this.data = data;
        this.dispatcher = dispatcher;
        this.margin = { top: 10, right: 0, bottom: 20, left: 0 };
        this.currentAttribute = "type";
        this.currentPath = stateManager.getCurrentPath()
        this.alpha = 0.5;
        this.tooltip = new TooltipManager(this.container); 
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
           
            this.tooltip.show({
                header: "Alpha (α) Balance",
                content: "Adjusts the balance between an actor's average rating (high α) and number of movies (low α) when selecting top actors."
            }, event);
        })
            .on("mousemove", (event) => {
                this.tooltip.move(event); // <-- ADDED
            })
            .on("mouseout", () => {
                // --- MODIFIED to use TooltipManager ---
                this.tooltip.hide();
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
                nconst: person.nconst,
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
                const path = this.stateManager.getCurrentPath();
                const formatSegment = s => s ? capitalize(s) : s;
                const pathString = path.length ? path.map(formatSegment).join(" → ") : "All Media";
                const pathMarkup = path.length ? `<div style="font-size: 12px; color: #bbb; margin-bottom: 8px;"><span style="font-weight: 500;">Path:</span> ${pathString}</div>` : "";

                const header = capitalize(formatLabels(d.id));
                let content = pathMarkup;
                let footer = "";

                if (d.nodeType === "actor") {
                    const connected = links
                        .filter(l => l.source.id === d.id || l.source === d.id)
                        .map(l => ({ attr: l.target.id || l.target, count: l.count || 1 }));
                    const counts = d3.rollups(connected, v => d3.sum(v, x => x.count), v => v.attr);
                    const totalTitles = d3.sum(counts, d => d[1]);

                    let attributeHtml = `<strong>${capitalize(formatLabels(this.currentAttribute))}s:</strong><br/>`;
                    counts.forEach(([attr, count]) => {
                        attributeHtml += `${capitalize(formatLabels(attr))} (${count})<br/>`;
                    });

                    content += `
                        Average Rating: ${d.avgRating.toFixed(1)}<br/>
                        <br/>
                        ${attributeHtml}
                        <div style="margin-top: 6px;"><strong>Total Titles:</strong> ${totalTitles}</div>
                    `;
                    footer = "Click to highlight connections";
                }
                else if (d.nodeType === "attribute") {
                    const connectedActors = links
                        .filter(l => l.target.id === d.id || l.target === d.id)
                        .map(l => ({ actor: l.source.id || l.source, count: l.count || 1 }));
                    const counts = d3.rollups(connectedActors, v => d3.sum(v, x => x.count), v => v.actor);
                    const totalTitles = d3.sum(counts, d => d[1]);

                    let actorHtml = `<strong>Actors:</strong><br/>`;
                    counts
                        .sort((a, b) => d3.descending(a[1], b[1]))
                        .forEach(([actor, count]) => {
                            actorHtml += `${actor} (${count})<br/>`;
                        });

                    content += `
                        <br/>
                        ${actorHtml}
                        <div style="margin-top: 6px;"><strong>Total Titles:</strong> ${totalTitles}</div>
                    `;
                    footer = "Click to drill down";
                }

                this.tooltip.show({ header, content, footer }, event);
            })
            .on("mousemove", (event) => {
                this.tooltip.move(event);
            })
            .on("mouseout", () => {
                this.tooltip.hide();
            })
            .on("click", (event, d) => {
                this.tooltip.hide(); 
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

        const ticked = () => {
            node.each(d => {
                d.x = Math.max(40, Math.min(width, d.x));
                d.y = Math.max(40, Math.min(height, d.y));
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

        this.dispatcher.emit("actorSelected", {
            nconst: actorNode.nconst,
            actorName: actorNode.id
        });

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

            if (this.dispatcher) {
                this.dispatcher.emit("actorSelected", null);
            }

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