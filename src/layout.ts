// Canvas layout maths: pure, no DOM, so it can be unit-tested.

// Height of the HUD strip above the maze, in cells.
export const HUD_ROWS = 1
// Space kept free around the canvas, in CSS pixels.
export const PADDING = 16
// Cells never grow bigger than this, in CSS pixels, so the maze doesn't
// balloon on big screens.
export const MAX_CELL = 48
// Nor smaller than this, so a tiny window still shows something.
export const MIN_CELL = 8

export type Layout = {
    // Side of one square cell, in CSS pixels.
    cell: number
    // HUD strip height, in CSS pixels. The maze starts below it.
    hudHeight: number
    // Canvas size in CSS pixels.
    width: number
    height: number
    // Canvas backing store size in device pixels, for crisp drawing on
    // high-DPI screens.
    pixelWidth: number
    pixelHeight: number
    // Device pixels per CSS pixel.
    dpr: number
}

// Fit a cols x rows maze plus the HUD strip into the viewport (CSS pixels)
// with square, whole-pixel cells.
export function computeLayout(
    viewportWidth: number,
    viewportHeight: number,
    cols: number,
    rows: number,
    dpr = 1
): Layout {
    const fit = Math.min(
        (viewportWidth - 2 * PADDING) / cols,
        (viewportHeight - 2 * PADDING) / (rows + HUD_ROWS)
    )
    const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(fit)))
    const ratio = dpr > 0 ? dpr : 1
    const width = cell * cols
    const height = cell * (rows + HUD_ROWS)
    return {
        cell,
        hudHeight: cell * HUD_ROWS,
        width,
        height,
        pixelWidth: Math.round(width * ratio),
        pixelHeight: Math.round(height * ratio),
        dpr: ratio,
    }
}

// The band (CSS pixels) kept for the on-screen D-pad and breath button
// when they show: below the maze in portrait, and on both sides of it in
// landscape (D-pad left, breath right). css/style.css uses the same size.
export const DPAD_SPACE = 180

// The room the touch controls take from a viewport (CSS pixels), to fit
// the maze in the rest. None without the D-pad. Portrait is a viewport at
// least as tall as it is wide, as in CSS's orientation media feature.
export function controlsSpace(
    viewportWidth: number,
    viewportHeight: number,
    dpad: boolean
): { width: number; height: number } {
    if (!dpad) return { width: 0, height: 0 }
    return viewportHeight >= viewportWidth
        ? { width: 0, height: DPAD_SPACE }
        : { width: 2 * DPAD_SPACE, height: 0 }
}
