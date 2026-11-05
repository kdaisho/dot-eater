import type { PixelArt } from "./sprites"

// The mute button, in the top right corner on every screen: flips the
// settings' mute (the same one as on the settings screen), so sound can
// go off or on from anywhere. Unmuted unless turned off. A grey pixel key
// like the tutorial's caps, with a pixel speaker on it.

// The speaker icons (11x9), in spriteData.ts's letter-grid format: sound
// on is the speaker with two sound waves, muted the speaker (dimmed) with
// a red X.
export const MUTE_ICONS: Readonly<Record<"on" | "muted", PixelArt>> = {
    on: {
        palette: { W: "#fcfcfc" },
        grid: [
            "....W......",
            "...WW....W.",
            "..WWW..W..W",
            "WWWWW...W.W",
            "WWWWW...W.W",
            "WWWWW...W.W",
            "..WWW..W..W",
            "...WW....W.",
            "....W......",
        ],
    },
    muted: {
        palette: { W: "#bcbcbc", R: "#fc3c3c" },
        grid: [
            "....W......",
            "...WW......",
            "..WWW.R...R",
            "WWWWW..R.R.",
            "WWWWW...R..",
            "WWWWW..R.R.",
            "..WWW.R...R",
            "...WW......",
            "....W......",
        ],
    },
}

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

export type MuteButtonOptions = {
    isMuted: () => boolean
    toggle: () => void
}

export type MuteButton = {
    // Show the current mute, after it changed elsewhere (settings).
    update(): void
}

export function createMuteButton(
    doc: Document,
    options: MuteButtonOptions
): MuteButton {
    const button = doc.createElement("button")
    button.type = "button"
    button.id = "mute"
    const icons = {
        on: pixelSvg(doc, MUTE_ICONS.on),
        muted: pixelSvg(doc, MUTE_ICONS.muted),
    }
    function update() {
        const muted = options.isMuted()
        button.replaceChildren(muted ? icons.muted : icons.on)
        button.classList.toggle("muted", muted)
        button.setAttribute("aria-label", muted ? "Unmute" : "Mute")
        button.setAttribute("aria-pressed", String(muted))
    }
    button.addEventListener("click", (event) => {
        // Only the button: not also a tap on the screen under it (the
        // opening's "push any button").
        event.stopPropagation()
        options.toggle()
        update()
        // Keys go back to the game, so Space or Enter doesn't press the
        // button again.
        button.blur()
    })
    // Space or Enter on the focused button (from Tab) only presses it,
    // not the game's confirm too.
    button.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation()
    })
    update()
    doc.body.append(button)
    return { update }
}
