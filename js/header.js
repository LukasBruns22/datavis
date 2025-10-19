import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { TooltipManager } from "./tooltipManager.js";
import { RATING_BINS } from "./config.js";

export class Header {
    /**
     * @param {string} selector - The container for the header.
     * @param {Dispatcher} dispatcher - Event emitter for interactions.
     * @param {StateManager} stateManager - Access current path and other state.
     */
    constructor(selector, dispatcher, stateManager) {
        this.container = d3.select(selector);
        this.dispatcher = dispatcher;
        this.stateManager = stateManager;
        this.tooltip = this.tooltip = new TooltipManager(d3.select("body"));

        this.ratingBins = RATING_BINS
    }

    render() {
        this.container.selectAll("*").remove();

        const headerDiv = this.container.append("div")
            .style("background-color", "#2c3e50")
            .style("color", "white")
            .style("padding", "0.5rem 1rem")
            .style("display", "flex")
            .style("flex-direction", "row")
            .style("align-items", "center")
            .style("justify-content", "flex-start")
            .style("gap", "2rem")
            .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)");

        headerDiv.append("h1")
            .text("IMDb Data Explorer: Trends in Film & TV")
            .attr("id", "dashboard-title")
            .style("margin", 0)
            .style("font-size", "20px")
            .style("font-weight", "bold");

        const scaleColumn = headerDiv.append("div")
            .style("display", "flex")
            .style("flex-direction", "column")
            .style("align-items", "center");

        scaleColumn.append("div")
            .text("Rating Scale")
            .style("font-weight", "bold")
            .style("margin-bottom", "8px")
            .style("font-size", "14px");

        const scaleRow = scaleColumn.append("div")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "0.3rem");

        this.ratingBins.forEach(bin => {
            scaleRow.append("div")
                .style("width", "12px")
                .style("height", "12px")
                .style("background-color", bin.color)
                .style("border-radius", "50%")
                .on("mouseover", (event) => {
                    this.tooltip.show({
                        header: bin.label,
                        content: `${bin.domain[0]} - ${bin.domain[1]}`,
                        footer: null
                    }, event);
                })
                .on("mousemove", (event) => this.tooltip.move(event))
                .on("mouseout", () => this.tooltip.hide());

            scaleRow.append("div")
                .text(bin.label)
                .style("font-size", "10px")
                .style("font-weight", "bold")
                .style("margin-right", "4px")
                .on("mouseover", (event) => {
                    this.tooltip.show({
                        header: bin.label,
                        content: `${bin.domain[0]} - ${bin.domain[1]}`,
                        footer: null
                    }, event);
                })
                .on("mousemove", (event) => this.tooltip.move(event))
                .on("mouseout", () => this.tooltip.hide());
        });
    }

}