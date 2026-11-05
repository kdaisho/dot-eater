import type { PixelArt } from "./sprites"

// Pixel art for the DOM's pixel keys (the mute and touch pause buttons).

const SVG_NS = "http://www.w3.org/2000/svg"

// The art as an SVG of one-unit squares, one a dot, with crisp edges so
// it scales up without blur. Its size is set in CSS.
export function pixelSvg(doc: Document, art: PixelArt): SVGSVGElement {
    const width = Math.max(...art.grid.map((row) => row.length))
    const svg = doc.createElementNS(SVG_NS, "svg")
    svg.setAttribute("viewBox", `0 0 ${width} ${art.grid.length}`)
    svg.setAttribute("shape-rendering", "crispEdges")
    svg.setAttribute("aria-hidden", "true")
    art.grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            const fill = art.palette[row[x]]
            if (!fill) continue
            const dot = doc.createElementNS(SVG_NS, "rect")
            dot.setAttribute("x", String(x))
            dot.setAttribute("y", String(y))
            dot.setAttribute("width", "1")
            dot.setAttribute("height", "1")
            dot.setAttribute("fill", fill)
            svg.append(dot)
        }
    })
    return svg
}
