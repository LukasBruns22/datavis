d3.json("data/02_CPI-31-Dataset.json").then(function(flatData) {
    
    // --- 1. DATA FLATTENING & PREP ---
    const flattenedData = [];
    flatData.titles.forEach(movie => {
        if (movie.genres && movie.genres.length > 0 && movie.runtimeMinutes && movie.averageRating) {
            movie.genres.forEach(genre => {
                flattenedData.push({
                    genre: genre, year: movie.startYear, runtime: movie.runtimeMinutes,
                    rating: movie.averageRating, title: movie.originalTitle
                });
            });
        }
    });

    // --- 2. HIERARCHICAL TRANSFORMATION ---
    function buildHierarchy(data, level = 0) {
        const levels = ["genre", "year", "runtime", "rating"];
        if (level >= levels.length) {
            return data.sort((a, b) => b.rating - a.rating).slice(0, 7)
                .map(d => ({ name: d.title, rating: d.rating, value: 1 }));
        }
        const currentLevel = levels[level];
        if (currentLevel === "runtime" || currentLevel === "rating") {
            const scale = d3.scaleQuantile().domain(data.map(d => d[currentLevel])).range(["Q1", "Q2", "Q3", "Q4"]);
            const grouped = d3.group(data, d => scale(d[currentLevel]));
            return Array.from(grouped, ([key, values]) => {
                const extent = scale.invertExtent(key);
                const name = `${d3.format(".1f")(extent[0])} - ${d3.format(".1f")(extent[1])}`;
                return { name: name, children: buildHierarchy(values, level + 1) };
            });
        } else {
            const grouped = d3.group(data, d => d[currentLevel]);
            return Array.from(grouped, ([key, values]) => ({ name: key, children: buildHierarchy(values, level + 1) }));
        }
    }
    const hierarchicalData = { name: "Movies", children: buildHierarchy(flattenedData) };
    
    // --- 3. DRAW THE CHART ---
    drawSunburst(hierarchicalData);

}).catch(function(error) { console.error("Error in script:", error); });


// --- FINAL DRAWING FUNCTION WITH CORRECTED INTERACTIVITY ---
function drawSunburst(data) {
    const width = 500;
    const height = width;
    const radius = width / 10; 

    const color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, data.children.length + 1));
    const hierarchy = d3.hierarchy(data).sum(d => d.value).sort((a, b) => b.value - a.value);
    const root = d3.partition().size([2 * Math.PI, hierarchy.height + 1])(hierarchy);
    root.each(d => d.current = d);

    const arc = d3.arc()
        .startAngle(d => d.x0).endAngle(d => d.x1)
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005)).padRadius(radius * 1.5)
        .innerRadius(d => d.y0 * radius)
        .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

    const svg = d3.select("#sunburst-container").append("svg")
        .attr("viewBox", [-width / 2, -height / 2, width, width])
        .style("font", "10px sans-serif");

    const path = svg.append("g")
      .selectAll("path")
      .data(root.descendants().slice(1))
      .join("path")
        .attr("fill", d => {
            if (!d.children) {
                let genreNode = d;
                while (genreNode.depth > 1) genreNode = genreNode.parent;
                const genreColor = color(genreNode.data.name);
                const ratingExtent = d3.extent(d.parent.children, s => s.data.rating);
                const leafColorScale = d3.scaleLinear().domain(ratingExtent).range(["#fff", genreColor]).interpolate(d3.interpolateHcl);
                return leafColorScale(d.data.rating);
            }
            let ancestor = d;
            while (ancestor.depth > 1) ancestor = ancestor.parent;
            return color(ancestor.data.name);
        })
        .attr("fill-opacity", d => arcVisible(d.current) ? (d.children ? 0.9 : 0.7) : 0)
        .attr("pointer-events", d => arcVisible(d.current) ? "auto" : "none")
        .attr("d", d => arc(d.current));

    path.filter(d => d.children).style("cursor", "pointer").on("click", clicked);
    path.append("title").text(d => `${d.ancestors().map(a => a.data.name).reverse().join(" -> ")}`);
    
    const label = svg.append("g").attr("pointer-events", "none").attr("text-anchor", "middle").style("user-select", "none")
      .selectAll("text").data(root.descendants().slice(1)).join("text")
        .attr("dy", "0.35em").attr("fill-opacity", d => +labelVisible(d.current))
        .attr("transform", d => labelTransform(d.current)).text(d => d.data.name);

    const parent = svg.append("circle").datum(root).attr("r", radius).attr("fill", "none").attr("pointer-events", "all").on("click", clicked);

    // --- ALL INTERACTIVITY FUNCTIONS BELOW ARE NEW AND CORRECTED ---

    function clicked(event, p) {
      parent.datum(p.parent || root);

      root.each(d => d.target = {
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - p.depth),
        y1: Math.max(0, d.y1 - p.depth)
      });

      const t = svg.transition().duration(750);

      path.transition(t)
          .tween("data", d => {
            const i = d3.interpolate(d.current, d.target);
            return t => d.current = i(t);
          })
        .filter(function(d) {
          return +this.getAttribute("fill-opacity") || arcVisible(d.target);
        })
          .attr("fill-opacity", d => arcVisible(d.target) ? (d.children ? 0.9 : 0.7) : 0)
          .attr("pointer-events", d => arcVisible(d.target) ? "auto" : "none")
          .attrTween("d", d => () => arc(d.current));

      label.filter(function(d) {
        return +this.getAttribute("fill-opacity") || labelVisible(d.target);
      }).transition(t)
          .attr("fill-opacity", d => +labelVisible(d.target))
          .attrTween("transform", d => () => labelTransform(d.current));
    }
    
    function arcVisible(d) {
    // Only show the first ring of children (where depth y0 is 1 and y1 is 2)
    return d.y1 <= 2 && d.y0 >= 1 && d.x1 > d.x0;
    }

    function labelVisible(d) {
    // The label visibility can stay the same, as it already targets the first ring
    return d.y1 <= 2 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
    }

    function labelTransform(d) {
      const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
      const y = (d.y0 + d.y1) / 2 * radius;
      return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
    }
}