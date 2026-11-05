import {
    knockoutDots,
    knockoutFlash,
    knockoutRings,
    type Knockout,
} from "./knockoutView"
import type { Dots } from "./sprites"

// Drawing a player's knockout (KDA-329, see knockoutView.ts) for render.ts,
// from its moment `t` alone, so a frame is the same however often it is
// drawn. Its dots and rings are in the sprite's own dots: a sprite `size`
// pixels across is `max(w, h)` dots of `dots` across, so the rings are as
// fine as the sprite at any cell size.
//
// render.ts calls drawKnockoutBody (the sprite greying, crumbling and its
// pile, under the characters), drawKnockoutRings (over them, under the fog's
// darkness) and, once for all of them, drawKnockoutFlash (over the whole
// maze, after the darkness).

// One knockout as render.ts hands it over: the knockout, its moment, the
// sprite's dots (its panic face, outlined, as spritePixels gives them) and
// where its middle is drawn, in maze pixels.
export type KnockoutSpot = {
    knockout: Knockout
    t: number
    dots: Dots
    x: number
    y: number
    // The sprite's box and a cell, in pixels.
    size: number
    cell: number
}

// One dot's size, in pixels.
function dotSize(spot: KnockoutSpot): number {
    const h = spot.dots.length
    const w = spot.dots[0]?.length ?? 0
    return spot.size / Math.max(1, w, h)
}

// The sprite greying and jittering, then crumbling into its pile, which
// stays (see knockoutDots). `still` (reduced motion) drops the jitter.
// Each dot is snapped to whole device pixels, as the sprites are.
export function drawKnockoutBody(
    ctx: CanvasRenderingContext2D,
    spot: KnockoutSpot,
    dpr: number,
    still: boolean
) {
    const { dots, knockout, t } = spot
    const h = dots.length
    const w = dots[0]?.length ?? 0
    const px = dotSize(spot)
    const left = spot.x - (w * px) / 2
    const top = spot.y - (h * px) / 2
    const snap = (v: number) => Math.round(v * dpr) / dpr
    for (const dot of knockoutDots(dots, t, knockout.seed, still)) {
        const x0 = snap(left + dot.x * px)
        const y0 = snap(top + dot.y * px)
        const x1 = snap(left + (dot.x + 1) * px)
        const y1 = snap(top + (dot.y + 1) * px)
        ctx.fillStyle = dot.color
        ctx.fillRect(
            x0,
            y0,
            Math.max(x1 - x0, 1 / dpr),
            Math.max(y1 - y0, 1 / dpr)
        )
    }
}

// The rings spreading from the animal's middle, a dot thick: each a
// midpoint circle of the sprite's dots.
export function drawKnockoutRings(
    ctx: CanvasRenderingContext2D,
    spot: KnockoutSpot,
    dpr: number
) {
    const rings = knockoutRings(spot.t)
    if (rings.length === 0) return
    const px = dotSize(spot)
    const snap = (v: number) => Math.round(v * dpr) / dpr
    const side = Math.max(snap(px), 1 / dpr)
    ctx.save()
    for (const ring of rings) {
        ctx.globalAlpha = ring.alpha
        ctx.fillStyle = ring.color
        const r = Math.max(1, Math.round((ring.radius * spot.cell) / px))
        for (const [a, b] of circlePoints(r)) {
            ctx.fillRect(
                snap(spot.x + (a - 0.5) * px),
                snap(spot.y + (b - 0.5) * px),
                side,
                side
            )
        }
    }
    ctx.restore()
}

// The white flash over the maze, `width` by `height` pixels, at its
// strongest of the knockouts' (`times`). None with reduced motion.
export function drawKnockoutFlash(
    ctx: CanvasRenderingContext2D,
    times: readonly number[],
    width: number,
    height: number,
    reducedMotion: boolean
) {
    if (reducedMotion) return
    const a = Math.max(0, ...times.map(knockoutFlash))
    if (a <= 0) return
    ctx.save()
    ctx.globalAlpha = a
    ctx.fillStyle = "#fcfcfc"
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
}

// The points of a midpoint circle of radius `r`, in whole units from its
// middle (a few may repeat where the octants meet).
export function circlePoints(r: number): [number, number][] {
    const points: [number, number][] = []
    let x = r
    let y = 0
    let err = 1 - r
    while (x >= y) {
        points.push(
            [x, y],
            [y, x],
            [-y, x],
            [-x, y],
            [-x, -y],
            [-y, -x],
            [y, -x],
            [x, -y]
        )
        y++
        if (err < 0) err += 2 * y + 1
        else {
            x--
            err += 2 * (y - x) + 1
        }
    }
    return points
}
