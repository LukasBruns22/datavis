import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { getYearBin, getRuntimeBin, getColor } from "./helper.js";

export class ActorAttributeNetwork {
    constructor(containerSelector, data, dispatcher, stateManager) {
        this.container = d3.select(containerSelector);
        this.svg = this.container.append("svg");
        this.chartGroup = this.svg.append("g");
        this.stateManager = stateManager
        this.data = data;
        this.dispatcher = dispatcher;
        this.margin = { top: 10, right: 10, bottom: 10, left: 10 };
        this.currentAttribute = "type";

        this.resize();
        //this._setupDispatcher();
        //window.addEventListener("resize", () => this.resize());
    }

    resize() {
        const rect = this.container.node().getBoundingClientRect();
        this.width = rect.width - this.margin.left - this.margin.right;
        this.height = rect.height - this.margin.top - this.margin.bottom;
        this.svg.attr("viewBox", `0 0 ${rect.width} ${rect.height}`);
    }

    update(attribute = "type") {
        this.currentAttribute = attribute;
        const { persons, titles } = this.data;
        const { nodes, links } = this._buildNetwork(persons, titles, attribute);
        this._render(nodes, links);
    }

    _buildNetwork(persons, titles, attribute) {
        const actorMap = new Map();
        const attributeMap = new Map();
        const links = [];
        const topGenres = this.stateManager.getTopGenres()

        persons.forEach(person => {
            const relatedTitles = person.knownForTitles
                .map(t => titles.find(x => x.tconst === t))
                .filter(Boolean);

            if (relatedTitles.length === 0) return;

            // Collect which attributes this actor connects to
            const actorAttributes = new Set();
            relatedTitles.forEach(t => {
                if (attribute === "genre" && Array.isArray(t.genres)) {
                    t.genres.forEach(g => {
                        const genreName = topGenres.includes(g) ? g : "Other";
                        actorAttributes.add(genreName);
                    });
                } else if (attribute === "runtime") {
                    actorAttributes.add(getRuntimeBin(t.runtimeMinutes));
                } else if (attribute === "year") {
                    actorAttributes.add(getYearBin(t.startYear));
                } else if (attribute === "type") {
                    actorAttributes.add(t.titleType);
                } else {
                    actorAttributes.add(t[attribute]);
                }
            });

            const avgRating = d3.mean(relatedTitles, d => d.averageRating);
            const actorNode = {
                id: person.primaryName,
                nodeType: "actor",
                avgRating,
                value: relatedTitles.length,
                attributes: Array.from(actorAttributes)
            };
            actorMap.set(actorNode.id, actorNode);

            // Add edges
            actorAttributes.forEach(attr => {
                if (!attributeMap.has(attr)) {
                    attributeMap.set(attr,
                        {
                            id: attr,
                            nodeType: "attribute",
                            attributeType: attribute,
                            value: 1
                        });
                } else {
                    attributeMap.get(attr).value += 1;
                }
                links.push({ source: actorNode.id, target: attr, strength: 1 });
            });
        });

        const topN = 5;
        const selectedActors = new Set();

        attributeMap.forEach((_, attr) => {
            const actorsForAttr = Array.from(actorMap.values())
                .filter(a => a.attributes.includes(attr))
                .sort((a, b) => d3.descending(a.avgRating, b.avgRating))
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
        this.chartGroup.selectAll("*").remove(); // clear previous

        const actorSizeScale = d3.scaleSqrt()
            .domain(d3.extent(nodes.filter(d => d.nodeType === "actor"), d => d.value))
            .range([5, 30]);

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
            .style("padding", "6px 10px")
            .style("background", "rgba(0, 0, 0, 0.7)")
            .style("color", "#fff")
            .style("pointer-events", "none")
            .style("opacity", 0);

        const node = this.chartGroup.selectAll(".node")
            .data(nodes)
            .join("circle")
            .attr("class", "node")
            .attr("r", d => d.nodeType === "attribute" ? 20 : actorSizeScale(d.value))
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
                tooltip.html(`<strong>${d.id}</strong><br/>${d.nodeType === "actor" ? `Avg Rating: ${d.avgRating.toFixed(1)}` : ""}`)
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
            .call(d3.drag()
                .on("start", (event, d) => this._dragStarted(event, d))
                .on("drag", (event, d) => this._dragged(event, d))
                .on("end", (event, d) => this._dragEnded(event, d))
            );

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
                    const formattedName = parts.length > 1
                        ? `${parts[0][0]}. ${parts.slice(-1)[0]}`
                        : d.id;
                    return formattedName;
                } else if (d.nodeType === "attribute") {
                    return d.id;
                }
            })
            .each(function (d) {
                if (d.nodeType === "actor") {
                    const radius = Math.sqrt(d.value) * 25;
                    const textWidth = this.getBBox().width;
                    console.log(radius, textWidth)
                    if (textWidth > radius) d3.select(this).text("");
                }
            });

        const ticked = () => {
            node.each(d => {
                d.x = Math.max(40, Math.min(width - 40, d.x));
                d.y = Math.max(40, Math.min(height - 40, d.y));
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
            .force("charge", d3.forceManyBody().strength(-250))
            //.force("collision", d3.forceCollide().radius(d => d.nodeType === "attribute" ? 30 : 10))
            //.force("x", d3.forceX().x(() => Math.random() * width).strength(0.01))
            //.force("y", d3.forceY().y(() => Math.random() * height).strength(0.01))
            //.force("link", d3.forceLink(links).id(d => d.id).distance(100))
            //.force("charge", d3.forceManyBody().strength(-200))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("x", d3.forceX(width / 2).strength(0.2))
            .force("y", d3.forceY(height / 2).strength(0.1))
            .on("tick", ticked);

    }



    _dragStarted(event, d) {
        if (!event.active) d.fx = d.x, d.fy = d.y;
    }

    _dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    _dragEnded(event, d) {
        if (!event.active) {
            d.fx = null;
            d.fy = null;
        }
    }




}