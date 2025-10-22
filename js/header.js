import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { capitalize, formatLabels } from "./helper.js";
import { HIERARCHY_LEVELS } from "./config.js";
import { TooltipManager } from "./tooltipManager.js";

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
        this.uniformButtonHeight = 20;
        this.tooltip = new TooltipManager(d3.select("body"));
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
            .style("gap", "1rem") // REDUCED from 2rem to 1rem
            .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)");

        headerDiv.append("h1")
            .text("IMDb Hierachical Data Explorer: Trends in Film & TV")
            .attr("id", "dashboard-title")
            .style("margin", 0)
            .style("font-size", "20px")
            .style("font-weight", "bold")
            .style("flex-shrink", "0");


        const clearButton = headerDiv.append("button")
            .text("Reset")
            .style("background-color", "#e9ecef")
            .style("color", "#333333")
            .style("border", "none")
            .style("border-radius", "4px")
            .style("padding", "6px 20px")
            .style("cursor", "pointer")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .on("click", () => {
                this.dispatcher.emit("pathChange", { path: [], depth: 0 });
            })
            .on("mouseover", (event) => {
                this.tooltip.show({
                    content: "Resets all filters and returns the dashboard to the top level (All Types)."
                }, event);
            })
            .on("mousemove", (event) => this.tooltip.move(event))
            .on("mouseout", () => this.tooltip.hide());

        const dropdownGroup = headerDiv.append("div")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "0.4rem")
            .style("flex-shrink", "0")

        dropdownGroup.append("label")
            .attr("for", "attribute-dropdown")
            .text("Jump to Attribute:")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .style("color", "#fff")
            .on("mouseover", (event) => {
                this.tooltip.show({
                    content: "Jump directly to any attribute level (e.g., Genre, Year, Runtime, Rating)."
                }, event);
            })
            .on("mousemove", (event) => this.tooltip.move(event))
            .on("mouseout", () => this.tooltip.hide());

        const dropdown = dropdownGroup.append("select")
            .attr("id", "attribute-dropdown")
            .style("padding", "4px 8px")
            .style("border-radius", "4px")
            .style("border", "none")
            .style("font-size", "13px")
            .style("cursor", "pointer");

        dropdown.selectAll("option")
            .data(HIERARCHY_LEVELS)
            .enter()
            .append("option")
            .attr("value", d => d)
            .text(d => d.charAt(0).toUpperCase() + d.slice(1));


        dropdown.on("change", (event) => {
            const selectedAttribute = d3.select(event.currentTarget).property("value");
            const hierarchy = HIERARCHY_LEVELS;
            const targetIndex = hierarchy.indexOf(selectedAttribute);

            const currentPath = this.stateManager.getCurrentPath();
            const currentDepth = currentPath.length;

            if (currentDepth === targetIndex) return;

            // case 1: Jumping backward (up the hierarchy)
            if (targetIndex < currentDepth) {
                const newPath = currentPath.slice(0, targetIndex);
                this.dispatcher.emit('pathChange', { path: newPath, depth: targetIndex });
                return;
            }

            // case 2: Jumping forward (down the hierarchy)
            const newPath = [];

            for (let i = 0; i < targetIndex; i++) {
                const level = hierarchy[i];
                const existingValue = currentPath[i];

                if (existingValue) {
                    newPath.push(existingValue);
                } else {
                    newPath.push(`All ${level.charAt(0).toUpperCase() + level.slice(1)}s`);
                }
            }

            this.dispatcher.emit('pathChange', { path: newPath, depth: targetIndex });
        });

        this.dispatcher.on("pathChange", ({ path }) => {
            const newDepth = path.length;
            dropdown.property("value", HIERARCHY_LEVELS[newDepth]);
        });

        const pathGroup = headerDiv.append("div")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "0.5rem")
            .style("flex", "0 1 auto")
            .style("max-width", "fit-content");

        pathGroup.append("span")
            .text("Hierachical Path:")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .style("color", "#fff")
            .style("flex-shrink", "0")
            .on("mouseover", (event) => {
                this.tooltip.show({
                    content: "Shows your current filter path. Click any step to go back to that level."
                }, event);
            })
            .on("mousemove", (event) => this.tooltip.move(event))
            .on("mouseout", () => this.tooltip.hide());

        this.navigationContainer = pathGroup.append("div")
            .attr("class", "breadcrumb-container")
            .style("vertical-align", "middle")
            .style("margin-left", "0")
            .style("flex", "0 0 auto")
            .style("overflow-x", "auto")
            .style("overflow-y", "hidden")
            .style("height", `${this.uniformButtonHeight + 4}px`);

        this.navigationSvg = this.navigationContainer.append("svg")
            .attr("class", "breadcrumb-navigation-svg")
            .attr("height", this.uniformButtonHeight + 4);

        this._renderNavigation();
    }

    _renderNavigation() {
        this.navigationSvg.selectAll("*").remove();
        const currentPath = this.stateManager.getCurrentPath();
        const buttonPadding = { x: 8 };
        const buttonSpacing = 4;
        const arrowSpacing = 16;

        let xPos = 0;
        const yPos = 2;

        // Helper function to create a button
        const createButton = (labelText, x, y, clickHandler, isLast = false) => {
            const group = this.navigationSvg.append("g")
                .attr("transform", `translate(${x}, ${y})`)
                .style("cursor", clickHandler ? "pointer" : "default")
                .on("click", clickHandler);

            const rect = group.append("rect")
                .attr("rx", 6).attr("ry", 6)
                .style("fill", isLast ? "#e9ecef" : "#f8f9fa")
                .style("stroke", "#dee2e6")
                .style("stroke-width", 1);

            if (!isLast && clickHandler) {
                rect.style("transition", "fill 0.2s ease-in-out");
            }

            const text = group.append("text")
                .text(labelText)
                .attr("text-anchor", "middle")
                .style("font-size", "12px")
                .style("font-weight", "600")
                .style("fill", "#333333");

            const buttonWidth = 85;
            rect.attr("width", buttonWidth)
                .attr("height", this.uniformButtonHeight);

            const availableWidth = buttonWidth - (buttonPadding.x * 2);
            let currentLabel = labelText;

            if (text.node().getBBox().width > availableWidth) {
                while (text.node().getBBox().width > availableWidth && currentLabel.length > 3) {
                    currentLabel = currentLabel.slice(0, -1);
                    text.text(currentLabel + '...');
                }
            }

            text.attr("x", buttonWidth / 2)
                .attr("y", this.uniformButtonHeight / 2)
                .style("dominant-baseline", "middle");

            if (!isLast && clickHandler) {
                group
                    .on("mouseover", () => rect.style("fill", "#e9ecef"))
                    .on("mouseout", () => rect.style("fill", "#f8f9fa"));
            }

            return buttonWidth;
        };

        // Helper to add arrow
        const addArrow = () => {
            this.navigationSvg.append("text")
                .text("→")
                .attr("x", xPos + (arrowSpacing / 2))
                .attr("y", yPos + this.uniformButtonHeight / 2)
                .style("font-size", "12px")
                .style("fill", "#fff")
                .style("dominant-baseline", "middle")
                .style("text-anchor", "middle");
            xPos += arrowSpacing;
        };


        // 2. Create buttons for the path
        currentPath.forEach((levelValue, i) => {

            if (i !== 0) {
                addArrow();
            }

            const cleanValue = levelValue.split(" (")[0];
            const label = `${capitalize(formatLabels(cleanValue))}`;

            const isLast = (i === currentPath.length - 1);

            const btnWidth = createButton(label, xPos, yPos, () => {
                let newPath;
                if (isLast) {
                    newPath = currentPath.slice(0, i);
                } else {
                    newPath = currentPath.slice(0, i + 1);
                }
                const newDepth = newPath.length;
                this.dispatcher.emit('pathChange', { path: newPath, depth: newDepth });
            }, isLast);

            xPos += btnWidth + buttonSpacing;
        });

        // Set the final width of the SVG container
        this.navigationSvg.attr("width", xPos);
    }
}