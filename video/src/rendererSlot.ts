import { createRenderer, type Renderer } from "../../src/render"

// The renderer a clip draws with, kept between renders of the clip (one
// per canvas), and made again when the canvas or the resolution changes:
// the resolution is the renderer's pixel ratio, fixed when it is made.
export type RendererSlot = {
    current: {
        renderer: Renderer
        canvas: HTMLCanvasElement
        resolution: number
    } | null
}

// The slot's renderer for `canvas` at `resolution`, made (with `create`)
// if it has none for them yet. A huge window, so the cells come out at
// MAX_CELL, and the resolution as its pixel ratio.
export function rendererFor(
    slot: RendererSlot,
    canvas: HTMLCanvasElement,
    resolution: number,
    create: typeof createRenderer = createRenderer
): Renderer {
    const kept = slot.current
    if (kept && kept.canvas === canvas && kept.resolution === resolution) {
        return kept.renderer
    }
    const renderer = create(canvas, {
        view: {
            innerWidth: 1e5,
            innerHeight: 1e5,
            devicePixelRatio: resolution,
        },
    })
    slot.current = { renderer, canvas, resolution }
    return renderer
}
