export class TooltipManager {
    constructor(container = d3.select("body")) {
        this.tooltip = container
            .append("div")
            .attr("class", "dashboard-tooltip")
            .style("position", "absolute")
            .style("padding", "15px 15px")
            .style("background", "rgba(0, 0, 0, 0.85)")
            .style("color", "white")
            .style("font-size", "15px")
            .style("pointer-events", "none")
            .style("opacity", 0)
            .style("border-radius", "8px")
            .style("max-width", "400px")
            .style("z-index", 9999);
    }

    show({ header, content, footer }, event) {
        // Set HTML first to calculate width, but keep it hidden
        const html = `
            ${header ? `<div style="
                font-size: 14px; 
                font-weight: bold; 
                color: #fff; 
                margin-bottom: 10px; 
                padding-bottom: 10px; 
                border-bottom: 1px solid #555;">
                ${header}
            </div>` : ""}
            
            <div style="color: #ddd; font-size: 14px;">
                ${content}
            </div>
            
            ${footer ? `<div style="
                margin-top: 10px; 
                padding-top: 10px; 
                border-top: 1px solid #555; 
                color: #aaa; 
                font-size: 13px;">
                ${footer}
            </div>` : ""}
        `;

        this.tooltip.html(html);

        // Get dimensions
        const tooltipWidth = this.tooltip.node().offsetWidth;
        const windowWidth = window.innerWidth;

        // Calculate 'left' position
        let left = event.pageX + 15;
        
        // Check if it goes off-screen to the right
        if (left + tooltipWidth > windowWidth) {
            // Flip it to the left side of the cursor
            left = event.pageX - 15 - tooltipWidth; 
        }

        // Now apply styles and show
        this.tooltip.transition().duration(200).style("opacity", 1);
        this.tooltip
            .style("left", `${left}px`)
            .style("top", `${event.pageY - 10}px`);
    }

    move(event) {
        // Get dimensions
        const tooltipWidth = this.tooltip.node().offsetWidth;
        const windowWidth = window.innerWidth;

        // Calculate 'left' position
        let left = event.pageX + 15;

        // Check if it goes off-screen to the right
        if (left + tooltipWidth > windowWidth) {
            // Flip it to the left side of the cursor
            left = event.pageX - 15 - tooltipWidth;
        }

        this.tooltip
            .style("left", `${left}px`)
            .style("top", `${event.pageY - 10}px`);
    }

    hide() {
        this.tooltip.transition().duration(150).style("opacity", 0);
    }
}