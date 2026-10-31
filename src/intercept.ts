import { Cell } from "./constants"
import { moveStep } from "./glide"
import type { Cells } from "./level"
import { openNeighbours, wrap } from "./path"
import { allDirections, directions, samePos, vec2, type Vec2 } from "./vec2"

// The interceptor (KDA-292, PM calls; the numbers are placeholders to tune
// at preview): a sneaky enemy that reads the player's moves. It guesses
// where the player is going (predictRoute), heads for the first cell of
// that route it can reach no later than the player (interceptAim), and
// among ways about as good comes at the player from a side the other
// enemies don't (approachSides). The moves themselves, with the spread
// rule and every other enemy rule, are interceptStep in ai.ts. Pure: no
// DOM, no randomness.

// How many cells ahead of the player its route is guessed.
export const INTERCEPT_AHEAD = 10
// Within this many moves of the player it stops guessing and chases.
export const INTERCEPT_CLOSE = 3
// How many moves longer than its best way it goes to come at the player
// from a side no other enemy is on (see interceptStep in ai.ts).
export const FLANK_SLACK = 2

// It is drawn this faint (an opacity) from SNEAK_FAR cells away from the
// nearest player, fading in to fully seen at SNEAK_NEAR (see sneakAlpha).
export const SNEAK_ALPHA = 0.35
export const SNEAK_FAR = 5
export const SNEAK_NEAR = 2

// What a breadth-first search from several cells finds: the steps to each
// cell, and which of the sources (an index) each was reached from first.
// Walls and cells nothing reaches are Infinity, and NONE in `from`.
export type Search = { dist: CellValue; from: CellValue }

// A number for each cell of a map.
export type CellValue = (v: Vec2) => number

export const NONE = -1

// Breadth-first search from every one of `sources` at once (wrap-aware, as
// distanceMap), each `start` steps away. Ties go to the earlier source,
// then to direction order, so the search is the same every time. A source
// may be on a wall (it is still `start` away); `blocked`, unless a source,
// is treated as a wall. A source listed twice counts once. Up to 8
// enemies may search a few times each in one tick, so it works on flat
// arrays (a cell is y * width + x) rather than a grid of rows.
export function searchFrom(
    cells: Cells,
    sources: readonly Vec2[],
    start = 0,
    blocked?: Vec2
): Search {
    const height = cells.length
    const width = cells[0].length
    const size = width * height
    // Steps, -1 for none yet.
    const dist = new Int32Array(size).fill(-1)
    const from = new Int32Array(size).fill(NONE)
    const queue = new Int32Array(size)
    let tail = 0
    sources.forEach((s, i) => {
        const at = s.y * width + s.x
        if (dist[at] >= 0) return
        dist[at] = start
        from[at] = i
        queue[tail++] = at
    })
    const stop = blocked ? blocked.y * width + blocked.x : -1
    for (let head = 0; head < tail; head++) {
        const at = queue[head]
        const x = at % width
        const y = (at - x) / width
        for (const d of allDirections) {
            const vx = wrap(x + directions[d].x, width)
            const vy = wrap(y + directions[d].y, height)
            const v = vy * width + vx
            if (dist[v] >= 0 || v === stop) continue
            if (cells[vy][vx] === Cell.wall) continue
            dist[v] = dist[at] + 1
            from[v] = from[at]
            queue[tail++] = v
        }
    }
    return {
        dist: (v) => {
            const d = dist[v.y * width + v.x]
            return d < 0 ? Infinity : d
        },
        from: (v) => from[v.y * width + v.x],
    }
}

// The cells the player at `player`, having come from `playerLast`, is
// guessed to move through next, nearest first, up to `ahead` of them. It
// goes on the way it is heading, round corners (the only way on but back),
// and through wrap tunnels. At a junction it takes the way leading away
// from the other enemies: the cell farthest from the nearest of them by
// `away` (their distances, see searchFrom), straight on when that is a
// tie, else the first such way in direction order. The route stops at a
// dead end, before a cell it already has (round a small loop), and is
// empty when the player has no heading (it hasn't moved). It is read on
// cells alone: a slide on ice isn't foreseen.
export function predictRoute(
    cells: Cells,
    player: Vec2,
    playerLast: Vec2,
    away: CellValue,
    ahead = INTERCEPT_AHEAD
): Vec2[] {
    const width = cells[0].length
    const height = cells.length
    const route: Vec2[] = []
    let prev = playerLast
    let at = player
    while (route.length < ahead) {
        const step = moveStep(prev, at, width, height)
        if (step.x === 0 && step.y === 0) break
        const ways = openNeighbours(cells, at).filter((v) => !samePos(v, prev))
        if (ways.length === 0) break
        const straight = vec2(
            wrap(at.x + step.x, width),
            wrap(at.y + step.y, height)
        )
        const next = ways.length === 1 ? ways[0] : branch(ways, straight, away)
        if (samePos(next, player) || route.some((v) => samePos(v, next))) {
            break
        }
        route.push(next)
        prev = at
        at = next
    }
    return route
}

// The way of `ways` (two or more, at a junction) the player is guessed to
// take: the farthest from the other enemies by `away`, straight on among
// those if it can, else the first.
function branch(ways: readonly Vec2[], straight: Vec2, away: CellValue): Vec2 {
    const far = Math.max(...ways.map(away))
    const best = ways.filter((v) => away(v) === far)
    return best.find((v) => samePos(v, straight)) ?? best[0]
}

// Where along `route` (see predictRoute) an interceptor heads: the first
// cell it can reach no later than the player, by moves (`reach`, its
// distances) over its speed against the cell's place on the route over the
// player's. If there is none, the farthest it can reach at all; null when
// it reaches none (or the route is empty), so it goes for the player.
export function interceptAim(
    route: readonly Vec2[],
    reach: CellValue,
    speed: number,
    playerSpeed: number
): Vec2 | null {
    // Times cross-multiplied, so equal times compare equal.
    const inTime = route.find(
        (v, i) => reach(v) * playerSpeed <= (i + 1) * speed
    )
    if (inTime) return inTime
    const reached = route.filter((v) => reach(v) !== Infinity)
    return reached.at(-1) ?? null
}

// From which side each cell is come at from the player at `player`: the
// index (in openNeighbours order) of the player's neighbour a shortest way
// from it enters the player's cell through, ties in direction order.
// PLAYER_SIDE on the player's cell; NONE on walls and cells that can't
// reach it.
export function approachSides(cells: Cells, player: Vec2): CellValue {
    const { from } = searchFrom(cells, openNeighbours(cells, player), 1, player)
    return (v) => (samePos(v, player) ? PLAYER_SIDE : from(v))
}

export const PLAYER_SIDE = -2

// How opaque an interceptor `distance` cells (straight, from where it is
// drawn to where the nearest player is) from the nearest player is drawn:
// SNEAK_ALPHA from SNEAK_FAR out, fully at SNEAK_NEAR or closer, and in
// between in step with the distance.
export function sneakAlpha(distance: number): number {
    if (distance >= SNEAK_FAR) return SNEAK_ALPHA
    if (distance <= SNEAK_NEAR) return 1
    const t = (distance - SNEAK_NEAR) / (SNEAK_FAR - SNEAK_NEAR)
    return 1 - t * (1 - SNEAK_ALPHA)
}
