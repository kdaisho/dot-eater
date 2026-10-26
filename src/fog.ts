import { Cell } from "./constants"
import type { Vec2 } from "./vec2"

// Fog maths for the renderer: who is close enough to the player to be seen.
// Pure, no DOM. Positions are in cell units (cell centres at whole numbers),
// like glidePos returns.

// Which axes the map wraps around on: an axis wraps when it has a tunnel (an
// open cell on that edge). Without one, the far edge is a wall the player
// can't see through, so distance is measured straight across the map.
export type FogWrap = { x: boolean; y: boolean }

// parseLevel makes every tunnel open on both edges, so checking the left and
// top edges is enough.
export function fogWrap(cells: readonly (readonly Cell[])[]): FogWrap {
    return {
        x: cells.some((row) => row[0] !== Cell.wall),
        y: cells[0]?.some((cell) => cell !== Cell.wall) ?? false,
    }
}

// The shortest distance from `a` to `b` along one axis of length `size`,
// going round through the tunnel when the axis wraps and that is shorter.
function axisDistance(a: number, b: number, size: number, wraps: boolean) {
    const d = Math.abs(a - b)
    if (!wraps) return d
    const m = d % size
    return Math.min(m, size - m)
}

// Straight-line distance in cells between `a` and `b`, wrap-aware.
export function fogDistance(
    a: Vec2,
    b: Vec2,
    cols: number,
    rows: number,
    wrap: FogWrap
): number {
    return Math.hypot(
        axisDistance(a.x, b.x, cols, wrap.x),
        axisDistance(a.y, b.y, rows, wrap.y)
    )
}

// The centres of the light around the player: the player's position plus
// its copies one map-width (or height) away on each wrapping axis, so the
// light shines through a tunnel onto the opposite edge. Each centre covers
// only the band of the map nearer to it than to the other copies (see
// lightBands), so drawing the darkness per band gives the wrap-aware distance.
export function lightCentres(
    player: Vec2,
    cols: number,
    rows: number,
    wrap: FogWrap
): Vec2[] {
    const xs = wrap.x ? [-cols, 0, cols] : [0]
    const ys = wrap.y ? [-rows, 0, rows] : [0]
    const centres: Vec2[] = []
    for (const dy of ys) {
        for (const dx of xs) {
            centres.push({ x: player.x + dx, y: player.y + dy })
        }
    }
    return centres
}

// The part of the map (in cell units, edges of cells: 0..cols, 0..rows)
// closest to the light centre `c`: a band one map wide centred on it along a
// wrapping axis, the whole map along one that doesn't. Null when the band
// misses the map.
export function lightBand(
    c: Vec2,
    cols: number,
    rows: number,
    wrap: FogWrap
): { left: number; top: number; right: number; bottom: number } | null {
    // Cell centres are at x + 0.5 in edge units.
    const left = wrap.x ? Math.max(0, c.x + 0.5 - cols / 2) : 0
    const right = wrap.x ? Math.min(cols, c.x + 0.5 + cols / 2) : cols
    const top = wrap.y ? Math.max(0, c.y + 0.5 - rows / 2) : 0
    const bottom = wrap.y ? Math.min(rows, c.y + 0.5 + rows / 2) : rows
    if (right <= left || bottom <= top) return null
    return { left, top, right, bottom }
}
