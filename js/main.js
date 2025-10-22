import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { Dispatcher } from "./dispatcher.js";
import { DropdownControl } from "./dropdown.js";
import { DonutChart } from "./donutChart.js";
import { CorrelationPlot } from "./correlationPlot.js";
import { ActorAttributeNetwork } from "./actorAttributeNetwork.js";
import { RatingHeatmap } from "./ratingHeatmap.js";
import { StateManager } from "./stateManager.js";
import { DataProcessor } from "./dataProcessor.js";
import { HIERARCHY_LEVELS } from "./config.js";
import { Header } from "./header.js";
import { Sidebar } from "./sidebar.js"; // <-- IMPORT SIDEBAR
import { getCurrentAttributeLabel } from "./helper.js";

/* TODOS:
- add dropdown to header and make dropdown work with jumping to attributes (skip certain filter levels)
- render path breadcrumbs in header and make them clickable (remove breadcrumbs then from other charts)
- if space, move also doghnut color scale to header, as colors are used by all charts
- check alignments
*/


let correlationPlot, actorAttributeNetwork, donutChart, ratingHeatmap, sidebar;

// --- MODIFIED: This function is fixed ---
// It no longer divides by devicePixelRatio, which was making fonts tiny.
window.scaledFont = function (px) {
    return `${px}px`;
};

d3.json("data/02_CPI-31-Dataset.json").then(function (data) {

    const dispatcher = new Dispatcher();
    const stateManager = new StateManager();
    const dataProcessor = new DataProcessor(data, stateManager);
    stateManager.setDataProcessor(dataProcessor);
    const processor = stateManager.getDataProcessor();

    const header = new Header("#header-container", dispatcher, stateManager);
    header.render();

    // --- INITIALIZE SIDEBAR ---
    sidebar = new Sidebar("#left-sidebar", stateManager, dispatcher);
    sidebar.render(); // Render static content
    // Note: Initial legend update will happen in first 'pathChange' dispatch or manually

    const correlationData = processor.getCorrelationData();
    const donutData = processor.getDonutData();
    const actorAttributeNetworkData = processor.getActorAttributeNetworkData();
    const heatmapData = processor.getHeatmapData();

    // initialize charts
    donutChart = new DonutChart("#sunburst-container", donutData, stateManager, dispatcher);
    correlationPlot = new CorrelationPlot("#correlation-chart-svg", correlationData, stateManager, dispatcher);
    actorAttributeNetwork = new ActorAttributeNetwork("#network-graph-container", actorAttributeNetworkData, dispatcher, stateManager);
    ratingHeatmap = new RatingHeatmap("#heatmap-container", heatmapData, stateManager, dispatcher)
    const dropdown = new DropdownControl("#dropdown-container", dispatcher, stateManager);

    // central event listeners
    dispatcher.on('pathChange', (pathInfo) => {
        const currentPath = pathInfo.path;
        stateManager.setPath(currentPath, HIERARCHY_LEVELS);
        stateManager.setSelectedActor(null);
        const attributeToPlot = HIERARCHY_LEVELS[pathInfo.depth] || 'rating'

        const processor = stateManager.getDataProcessor();
        const correlationData = processor.getCorrelationData();
        const donutData = processor.getDonutData()
        const actorAttributeNetworkData = processor.getActorAttributeNetworkData();
        const heatmapData = processor.getHeatmapData();

        const attributeName = attributeToPlot.charAt(0).toUpperCase() + attributeToPlot.slice(1);
        d3.select("#network-title").text(`Actor-${attributeName} Network`);

        correlationPlot.update(correlationData, attributeToPlot);
        ratingHeatmap.update(heatmapData)
        donutChart.update(donutData);
        actorAttributeNetwork.update(actorAttributeNetworkData, attributeToPlot);
        header._renderNavigation();
        sidebar.update(); // <-- UPDATE SIDEBAR LEGEND
    });

    dispatcher.on('jumpToAttribute', (attribute) => {
        const attributeName = attribute.charAt(0).toUpperCase() + attribute.slice(1);
        d3.select("#correlation-title").text(`Rating vs ${attributeName}`);
        //correlationPlot.update(flattenedData, attribute, []);
        //sunburst.update([]);
        //actorAttributeNetwork.update(attribute);
    });

    dispatcher.on("actorSelected", (actorInfo) => {
        stateManager.setSelectedActor(actorInfo);
        const currentAttribute = getCurrentAttributeLabel(stateManager)

        const heatmapData = dataProcessor.getHeatmapData();
        ratingHeatmap.update(heatmapData);

        d3.select("#heatmap-title").text(
            actorInfo
                ? `Title Ratings per ${currentAttribute} featuring ${actorInfo.actorName}`
                : `Title Ratings per ${currentAttribute}`
        );
    });

    // initial draw
    correlationPlot.update(correlationData, 'type');
    sidebar.update(); // <-- INITIAL LEGEND DRAW
    dropdown.render();

}).catch(function (error) {
    console.error("Error loading or processing data:", error);
});