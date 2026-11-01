// Canvas layout maths: pure, no DOM, so it can be unit-tested.

// Height of the HUD strip above the maze, in cells.
export const HUD_ROWS = 1
// Space kept free around the canvas, in CSS pixels.
export const PADDING = 16
// Cells never grow bigger than this, in CSS pixels, so the maze doesn't
// balloon on big screens.
export const MAX_CELL = 48
// A maze that fits whole with cells at least this big is drawn whole, so
// today's stages stay whole on narrow phones and short windows. A
// placeholder (KDA-266), to tune on a real phone.
export const MIN_FIT_CELL_PX = 16
// A maze that would need smaller cells than MIN_FIT_CELL_PX to fit whole is
// drawn with cells this big instead, part of it on screen, and the view
// follows the player (camera.ts). Bigger than MIN_FIT_CELL_PX, so a maze
// that has to scroll anyway is comfortable to play. A placeholder
// (KDA-266), to tune on a real phone.
export const MIN_CELL_PX = 20

export type Layout = {
    // Side of one square cell, in CSS pixels.
    cell: number
    // HUD strip height, in CSS pixels. The maze starts below it.
    hudHeight: number
    // Canvas size in CSS pixels: the whole maze plus the HUD strip, or as
    // much as the viewport has room for when the maze doesn't fit whole.
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
// with square, whole-pixel cells. When that would make the cells smaller
// than MIN_FIT_CELL_PX, they are MIN_CELL_PX and the canvas takes the viewport
// (at least a cell of maze below the HUD) along each axis the maze doesn't
// fit; the renderer shows the part of the maze the view picks.
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
    const whole = Math.min(MAX_CELL, Math.floor(fit))
    const cell = whole >= MIN_FIT_CELL_PX ? whole : MIN_CELL_PX
    const ratio = dpr > 0 ? dpr : 1
    const width = Math.min(
        cell * cols,
        Math.max(cell, Math.floor(viewportWidth - 2 * PADDING))
    )
    const height = Math.min(
        cell * (rows + HUD_ROWS),
        Math.max(
            cell * (HUD_ROWS + 1),
            Math.floor(viewportHeight - 2 * PADDING)
        )
    )
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

// The band (CSS pixels) kept for the punch and breath buttons on a touch
// screen without the D-pad: below the maze in portrait (the buttons side by
// side on the right), right of it in landscape (one above the other). Just
// a button (72 px) and a margin each side, so the maze stays as big as it
// can. css/style.css uses the same sizes.
export const BUTTONS_SPACE = 104

// The band (CSS pixels) kept with the on-screen D-pad on: below the maze in
// portrait, and on both sides of it in landscape (D-pad left, punch and
// breath right). css/style.css uses the same size.
export const DPAD_SPACE = 180

// Which touch controls take room: none (no touch screen), the punch and
// breath buttons, or those and the D-pad.
export type ControlsShown = "none" | "buttons" | "dpad"

// The room the touch controls take from a viewport (CSS pixels), to fit
// the maze in the rest. Kept on menus too, so the maze doesn't jump when
// play starts. Portrait is a viewport at least as tall as it is wide, as in
// CSS's orientation media feature.
export function controlsSpace(
    viewportWidth: number,
    viewportHeight: number,
    shown: ControlsShown
): { width: number; height: number } {
    const portrait = viewportHeight >= viewportWidth
    switch (shown) {
        case "none":
            return { width: 0, height: 0 }
        case "buttons":
            return portrait
                ? { width: 0, height: BUTTONS_SPACE }
                : { width: BUTTONS_SPACE, height: 0 }
        case "dpad":
            return portrait
                ? { width: 0, height: DPAD_SPACE }
                : { width: 2 * DPAD_SPACE, height: 0 }
    }
}
