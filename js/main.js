import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { Dispatcher } from "./dispatcher.js";
import { DropdownControl } from "./dropdown.js";
import { DonutChart } from "./donutChart.js";
import { CorrelationPlot } from "./correlationPlot.js";
import { ActorAttributeNetwork } from "./actorAttributeNetwork.js";
import { StateManager } from "./stateManager.js";
import { DataProcessor } from "./dataProcessor.js";
import { HIERARCHY_LEVELS } from "./config.js";


// global variables for charts
let correlationPlot, actorAttributeNetwork, donutChart;

window.scaledFont = function(px) {
  const scale = window.devicePixelRatio || 1;
  return `${px / scale}px`;
};

d3.json("data/02_CPI-31-Dataset.json").then(function(data) {

    const dispatcher = new Dispatcher();
    const stateManager = new StateManager();
    const dataProcessor = new DataProcessor(data.titles, stateManager);
    stateManager.setDataProcessor(dataProcessor);
    const processor = stateManager.getDataProcessor();

    const correlationData = processor.getCorrelationData();
    const donutData = processor.getDonutData();


    // initialize charts
    donutChart = new DonutChart("#sunburst-container", donutData, stateManager, dispatcher);
    correlationPlot = new CorrelationPlot("#correlation-chart-svg", correlationData, stateManager, dispatcher);
    // actorAttributeNetwork = new ActorAttributeNetwork("#network-graph-container", { persons: data.persons, titles: filteredTitles }, dispatcher, stateManager);
    const dropdown = new DropdownControl("#dropdown-container", dispatcher, stateManager);

    // --- Central Event Listeners ---
    dispatcher.on('pathChange', (pathInfo) => {
        const currentPath = pathInfo.path;
        stateManager.setPath(currentPath, HIERARCHY_LEVELS);
        const attributeToPlot = HIERARCHY_LEVELS[pathInfo.depth] || 'rating'

        const processor = stateManager.getDataProcessor();
        const correlationData = processor.getCorrelationData();
        const donutData = processor.getDonutData()

        const attributeName = attributeToPlot.charAt(0).toUpperCase() + attributeToPlot.slice(1);
        d3.select("#correlation-title").text(`IMDb Rating vs ${attributeName}`);
        d3.select("#network-title").text(`Actor-${attributeName} Network`);

        correlationPlot.update(correlationData, attributeToPlot);
        donutChart.update(donutData);
        //actorAttributeNetwork.update(attributeToPlot);
    });

    dispatcher.on('jumpToAttribute', (attribute) => {
        const attributeName = attribute.charAt(0).toUpperCase() + attribute.slice(1);
        d3.select("#correlation-title").text(`Correlation: IMDb Rating vs ${attributeName}`);
        correlationPlot.update(flattenedData, attribute, []);
        sunburst.update([]);
        //actorAttributeNetwork.update(attribute);
    });

    // initial draw
    correlationPlot.update(correlationData, 'type');
    //actorAttributeNetwork.update('type');
    dropdown.render();

}).catch(function (error) {
    console.error("Error loading or processing data:", error);
});