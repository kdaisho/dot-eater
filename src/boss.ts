import {
    BOSS_DAMAGE_PER_ENERGY,
    BOSS_DEFEAT_POINTS,
    BOSS_FLASH,
    BOSS_HEALTH,
    BOSS_SPEED,
    Cell,
} from "./constants"
import type { BlockMap } from "./breath"
import type { GameState, Player } from "./game"
import { distanceMap } from "./path"
import { allDirections, directions, samePos, vec2, type Vec2 } from "./vec2"

// The boss (stage 5, "Boss lair"): one big enemy, 2x2 cells, with health.
// Pure, no DOM.
//
// It isn't one of GameState.enemies: breath hooks (hit.enemies, defeat,
// addStatus, push) never see it, so it can't be frozen, pushed or defeated
// in one go, and it takes no enemy slot. Instead:
//
// - Breaths: any breath whose cells touch its footprint damages it once by
//   its cost times BOSS_DAMAGE_PER_ENERGY (see breathe in breath.ts, which
//   also stops lines and cones at its body). At 0 health it is defeated for
//   good: BOSS_DEFEAT_POINTS, and it is no longer drawn, moved or caught by.
// - Moving: it chases the nearest player (bossTarget) at its own speed, but only where all four
//   of its cells fit (see bossMove), so 1-wide corridors are safe from it.
//   Tile effects that block enemies block it too.
// - Catching: touching it catches the player like an enemy (see caught in
//   game.ts), anywhere on its footprint.
// - A lost life sends it back to its spawn, keeping its damage (resetBoss).
//
// Boss levels have no wrap tunnels and no level ice (parseLevel checks), so
// it never wraps or slides.

export type Boss = {
    // The top-left cell of its 2x2 footprint; the footprint is pos to
    // pos + (1, 1).
    pos: Vec2
    // pos before its latest move (as Character.lastPos), for the glide.
    lastPos: Vec2
    // Where it starts, and goes back to after a lost life.
    spawn: Vec2
    // Cells per second.
    speed: number
    // As Character.moveProgress.
    moveProgress: number
    health: number
    maxHealth: number
    // Seconds left of the white flash after a hit (0 for none).
    flash: number
    // At 0 health it is gone for good.
    defeated: boolean
}

export function createBoss(pos: Vec2, speed: number = BOSS_SPEED): Boss {
    return {
        pos: vec2(pos.x, pos.y),
        lastPos: vec2(pos.x, pos.y),
        spawn: vec2(pos.x, pos.y),
        speed,
        // As for enemies: a short grace period before its first move.
        moveProgress: 0,
        health: BOSS_HEALTH,
        maxHealth: BOSS_HEALTH,
        flash: 0,
        defeated: false,
    }
}

// The four cells of the footprint whose top-left cell is `pos`, in reading
// order.
export function footprint(pos: Vec2): Vec2[] {
    return [
        vec2(pos.x, pos.y),
        vec2(pos.x + 1, pos.y),
        vec2(pos.x, pos.y + 1),
        vec2(pos.x + 1, pos.y + 1),
    ]
}

// Whether `cell` is one of the four cells of the footprint at `pos`.
export function inFootprint(pos: Vec2, cell: Vec2): boolean {
    const dx = cell.x - pos.x
    const dy = cell.y - pos.y
    return (dx === 0 || dx === 1) && (dy === 0 || dy === 1)
}

// The damage a breath costing `cost` energy does to the boss.
export function bossDamage(cost: number): number {
    return cost * BOSS_DAMAGE_PER_ENERGY
}

// Take `damage` off the boss's health and flash it. At 0 it is defeated:
// BOSS_DEFEAT_POINTS, once, to the player whose breath did it (`by`, player
// 1 unless given). A defeated boss takes no more damage.
export function damageBoss(
    state: GameState,
    damage: number,
    by: Player = state.players[0]
) {
    const boss = state.boss
    if (!boss || boss.defeated) return
    boss.health = Math.max(0, boss.health - damage)
    boss.flash = BOSS_FLASH
    // A small tolerance, so fractional damage that adds up to the health
    // still finishes it.
    if (boss.health <= 1e-9) {
        boss.health = 0
        boss.defeated = true
        boss.flash = 0
        by.score += BOSS_DEFEAT_POINTS
    }
}

// Count the flash down by `dt` seconds.
export function tickBoss(boss: Boss, dt: number) {
    boss.flash = Math.max(0, boss.flash - dt)
}

// After a lost life: back at its spawn, at rest, waiting out the grace
// period again. Its health (and defeat) is kept.
export function resetBoss(boss: Boss) {
    boss.pos = vec2(boss.spawn.x, boss.spawn.y)
    boss.lastPos = vec2(boss.spawn.x, boss.spawn.y)
    boss.moveProgress = 0
    boss.flash = 0
}

// ---- Movement ----

const key = (p: Vec2) => `${p.x},${p.y}`

// Whether the boss may have a cell under its footprint.
export type BossFloor = (cell: Vec2) => boolean

// The floor of a level's `cells` with no tile effects about: inside the map
// and not a wall. For checking where a boss can go on a level.
export function mapFloor(cells: readonly (readonly Cell[])[]): BossFloor {
    return (c) =>
        c.y >= 0 &&
        c.x >= 0 &&
        c.y < cells.length &&
        c.x < cells[0].length &&
        cells[c.y][c.x] !== Cell.wall
}

// The boss's floor now: mapFloor, and not blocked by a tile effect (when
// `blocked` is given) and not a wall a breath has opened. An opened wall
// grows back, and the boss is too big to push out of the way, so it treats
// one as the wall it will be again.
function bossFloor(state: GameState, blocked: BlockMap | null): BossFloor {
    const onMap = mapFloor(state.cells)
    const opened = new Set(
        state.tiles.filter((t) => t.effect.opensWall).map((t) => key(t.pos))
    )
    return (c) => onMap(c) && !opened.has(key(c)) && !blocked?.[c.y][c.x]
}

// Whether the boss's whole footprint fits on `floor` with its top-left cell
// at `pos`.
export function bossFits(floor: BossFloor, pos: Vec2): boolean {
    return footprint(pos).every(floor)
}

// Breadth-first over the boss's top-left positions from `from`, through
// positions whose whole footprint is on `floor`. For each reachable position
// (in the order found, which is by distance, then direction order): its
// distance and the first step towards it (the position itself for `from`).
export function bossReach(
    from: Vec2,
    floor: BossFloor
): { pos: Vec2; dist: number; first: Vec2 }[] {
    const fits = (p: Vec2) => bossFits(floor, p)
    const found = [{ pos: from, dist: 0, first: from }]
    const seen = new Set([key(from)])
    for (let head = 0; head < found.length; head++) {
        const { pos, dist, first } = found[head]
        for (const d of allDirections.map((dir) => directions[dir])) {
            const next = vec2(pos.x + d.x, pos.y + d.y)
            if (seen.has(key(next)) || !fits(next)) continue
            seen.add(key(next))
            found.push({
                pos: next,
                dist: dist + 1,
                first: dist === 0 ? next : first,
            })
        }
    }
    return found
}

// Which of `targets` (the players' cells, player 1 first) the boss goes
// after: the one nearest its footprint by path (the player's path distance
// to the closest of its four cells), the first on ties. With one player
// that is always player 1, without searching.
export function bossTarget(state: GameState, targets: readonly Vec2[]): number {
    const boss = state.boss
    if (!boss || targets.length <= 1) return 0
    const away = targets.map((t) => {
        const dist = distanceMap(state.cells, t)
        return Math.min(...footprint(boss.pos).map((c) => dist[c.y][c.x]))
    })
    let best = 0
    for (let i = 1; i < away.length; i++) {
        if (away[i] < away[best]) best = i
    }
    return best
}

// The boss's next top-left position, or null to stay put. `target` is the
// player's cell; `blocked` the cells tile effects block (see enemyBlocks in
// breath.ts), or null for none.
//
// It heads for the reachable position whose footprint is nearest the player
// by the player's path distance (0 when the footprint covers the player's
// cell), the nearest such position to itself on ties, and the first in
// direction order after that. So it runs the player down in the open, and
// when the player is somewhere it doesn't fit (a 1-wide corridor), it waits
// at the mouth nearest the player rather than wandering off. Staying put
// wins every tie it is part of (distance 0), so it doesn't dither between
// equally good spots.
//
// Standing on a blocked cell, it leaves by the shortest way instead: to the
// nearest position clear of blocked cells, the first in direction order on
// ties. If there is none it stays put.
export function bossMove(
    state: GameState,
    target: Vec2,
    blocked: BlockMap | null
): Vec2 | null {
    const boss = state.boss
    if (!boss || boss.defeated) return null
    const floor = bossFloor(state, blocked)
    const clear = (p: Vec2) => bossFits(floor, p)
    if (blocked && !clear(boss.pos)) {
        const escape = bossReach(boss.pos, bossFloor(state, null)).find((r) =>
            clear(r.pos)
        )
        return escape ? escape.first : null
    }
    const fromPlayer = distanceMap(state.cells, target)
    const away = (p: Vec2) =>
        Math.min(...footprint(p).map((c) => fromPlayer[c.y][c.x]))
    let best: { first: Vec2; score: number } | null = null
    for (const r of bossReach(boss.pos, floor)) {
        // Found in order of distance, so a later one only wins on a
        // strictly better score.
        const score = away(r.pos)
        if (best === null || score < best.score) {
            best = { first: r.first, score }
        }
    }
    if (best === null || samePos(best.first, boss.pos)) return null
    return best.first
}

// ---- Collisions ----

// How close the segment from `p` to `q` comes to the square of cell centres
// a boss at the origin covers: (0, 0) to (1, 1). Exact: 0 if any of it is
// inside the square, else the nearest of an end of the segment to the
// square and a corner of the square to the segment (two convex shapes that
// don't meet are nearest at a corner of one of them).
export function squareDistance(p: Vec2, q: Vec2): number {
    if (clipsSquare(p, q)) return 0
    const corners = [vec2(0, 0), vec2(1, 0), vec2(0, 1), vec2(1, 1)]
    return Math.min(
        pointToSquare(p),
        pointToSquare(q),
        ...corners.map((c) => pointToSegment(c, p, q))
    )
}

// Whether any of the segment from `p` to `q` is inside the unit square
// (Liang-Barsky clipping).
function clipsSquare(p: Vec2, q: Vec2): boolean {
    const dx = q.x - p.x
    const dy = q.y - p.y
    let t0 = 0
    let t1 = 1
    // Each side as p·t <= q: left, right, top, bottom.
    const sides: [number, number][] = [
        [-dx, p.x],
        [dx, 1 - p.x],
        [-dy, p.y],
        [dy, 1 - p.y],
    ]
    for (const [a, b] of sides) {
        if (a === 0) {
            if (b < 0) return false
            continue
        }
        const t = b / a
        if (a < 0) t0 = Math.max(t0, t)
        else t1 = Math.min(t1, t)
        if (t0 > t1) return false
    }
    return true
}

function pointToSquare(p: Vec2): number {
    const dx = Math.max(-p.x, 0, p.x - 1)
    const dy = Math.max(-p.y, 0, p.y - 1)
    return Math.hypot(dx, dy)
}

function pointToSegment(c: Vec2, p: Vec2, q: Vec2): number {
    const dx = q.x - p.x
    const dy = q.y - p.y
    const d2 = dx * dx + dy * dy
    const t =
        d2 === 0
            ? 0
            : Math.min(
                  1,
                  Math.max(0, ((c.x - p.x) * dx + (c.y - p.y) * dy) / d2)
              )
    return Math.hypot(p.x + dx * t - c.x, p.y + dy * t - c.y)
}
