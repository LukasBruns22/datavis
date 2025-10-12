import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { HIERARCHY_LEVELS } from "./config.js";

export class DropdownControl {
    /**
     * @param {string} selector - The CSS selector for the container div.
     * @param {string[]} attributes - The array of attribute names for the options.
     * @param {Dispatcher} dispatcher - The application's dispatcher instance.
     */
    constructor(selector, dispatcher) {
        this.container = d3.select(selector);
        this.dispatcher = dispatcher;
    }

    /**
     * Renders the dropdown and sets up its event listener.
     */
    render() {
        this.container.selectAll("*").remove();

        this.container.append("label")
            .attr("for", "attribute-dropdown")
            .text("Jump to Attribute")
            .style("margin-right", "8px");

        const dropdown = this.container.append("select")
            .attr("id", "attribute-dropdown");

        dropdown.selectAll("option")
            .data(HIERARCHY_LEVELS)
            .enter()
            .append("option")
            .attr("value", d => d)
            .text(d => d.charAt(0).toUpperCase() + d.slice(1));

        // When the dropdown changes, it now emits a generic event.
        // It no longer knows or cares about the correlation plot or sunburst.
        dropdown.on("change", (event) => {
            const selectedAttribute = d3.select(event.currentTarget).property("value");
            this.dispatcher.emit('jumpToAttribute', selectedAttribute);
        });
    }
}