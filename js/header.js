import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { capitalize, formatLabels } from "./helper.js";

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
        this.uniformButtonHeight = 28; 
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
            .text("IMDb Data Explorer: Trends in Film & TV")
            .attr("id", "dashboard-title")
            .style("margin", 0)
            .style("font-size", "20px")
            .style("font-weight", "bold")
            .style("flex-shrink", "0");

        // Create a group to hold the label and the nav
        const pathGroup = headerDiv.append("div")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "0.5rem")
            .style("flex", "0 1 auto") // CHANGED: don't grow
            .style("max-width", "fit-content"); // CHANGED: fit content

        // "Path:" label
        pathGroup.append("span")
            .text("Path:")
            .style("font-size", "20px")
            .style("font-weight", "bold")
            .style("color", "#fff")
            .style("flex-shrink", "0");

        // This is the navigation container
        this.navigationContainer = pathGroup.append("div")
            .attr("class", "breadcrumb-container")
            .style("vertical-align", "middle")
            .style("margin-left", "0") 
            .style("flex", "0 0 auto") // CHANGED: don't grow or shrink
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

        // 1. Create "Home" button (always in the same position)
        const homeWidth = createButton("Type", xPos, yPos, () => {
            this.dispatcher.emit('pathChange', { path: [], depth: 0 });
        }, currentPath.length === 0); 
        xPos += homeWidth + buttonSpacing;

        // 2. Create buttons for the path
        currentPath.forEach((levelValue, i) => {
            addArrow();
        
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