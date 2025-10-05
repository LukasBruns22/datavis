class ActorAttributeNetwork {
    constructor(containerSelector, data, dispatcher, colorFunction) {
        this.container = d3.select(containerSelector);
        this.svg = this.container.append("svg");
        this.chartGroup = this.svg.append("g");
        this.data = data;
        this.dispatcher = dispatcher;
        this.color = colorFunction;
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

        // --- Build connections for each person ---
        persons.forEach(person => {
            const relatedTitles = person.knownForTitles
                .map(t => titles.find(x => x.tconst === t))
                .filter(Boolean);

            if (relatedTitles.length === 0) return;

            // Collect which attributes this actor connects to
            const actorAttributes = new Set();
            relatedTitles.forEach(t => {
                if (attribute === "genre" && Array.isArray(t.genres)) {
                    t.genres.forEach(g => actorAttributes.add(g));
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
                type: "actor",
                avgRating,
                value: relatedTitles.length,
                attributes: Array.from(actorAttributes)
            };
            actorMap.set(actorNode.id, actorNode);

            // Add edges
            actorAttributes.forEach(attr => {
                if (!attributeMap.has(attr)) {
                    attributeMap.set(attr, { id: attr, type: "attribute", value: 1 });
                } else {
                    attributeMap.get(attr).value += 1;
                }
                links.push({ source: actorNode.id, target: attr, strength: 1 });
            });
        });

        // --- Attribute-balanced sampling: pick top N actors per attribute ---
        const topN = 5;
        const selectedActors = new Set();

        attributeMap.forEach((_, attr) => {
            // All actors connected to this attribute
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
            .attr("r", d => Math.sqrt(d.value) * 2)
            .attr("fill", d => {
                if (d.type === "attribute") {
                    // If it's a genre, use the existing shared color logic
                    console.log({ genre: d.id })
                    return this.color({ genre: d.id });
                } else {
                    // For actors: derive color by their strongest associated genre (if possible)
                    const linkedGenres = this.data.titles
                        .filter(t => d.titles?.includes(t.tconst))
                        .flatMap(t => t.genres || []);
                    const mainGenre = d3.mode(linkedGenres) || null;
                    return mainGenre ? this.color({ genre: mainGenre }) : "#999999";
                }
            })
            .style("cursor", "pointer")
            //.on("mouseover", (event, d) => this._highlightNode(d, true))
            //.on("mouseout", (event, d) => this._highlightNode(d, false))
            .call(d3.drag()
                .on("start", (event, d) => this._dragStarted(event, d))
                .on("drag", (event, d) => this._dragged(event, d))
                .on("end", (event, d) => this._dragEnded(event, d))
            );

        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-200))
            .force("center", d3.forceCenter(width / 2, height / 2));

        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);
        });
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