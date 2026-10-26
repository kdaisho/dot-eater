import { AiType, AMBUSH_AHEAD, Cell } from "./constants"
import type { Character } from "./character"
import { moveStep } from "./glide"
import type { Cells } from "./level"
import { distanceMap, openNeighbours } from "./path"
import { allDirections, directions, samePos, vec2, type Vec2 } from "./vec2"

export type Random = () => number

// Neighbouring cells the enemy may step into: not a wall, and not where it
// just came from. In a dead end, turning back is the only way out, so the
// previous cell is allowed after all. Empty only when boxed in on every side.
export function candidateMoves(cells: Cells, enemy: Character): Vec2[] {
    const open = openNeighbours(cells, enemy.pos)
    const forward = open.filter((v) => !samePos(v, enemy.lastPos))
    return forward.length > 0 ? forward : open
}

// Move one enemy according to its AI. `target` is the player's position and
// `targetLast` the cell the player came from on its latest move (the same as
// `target` if it hasn't moved), which gives the player's heading.
export function enemyMove(
    cells: Cells,
    enemy: Character,
    target: Vec2,
    random: Random,
    targetLast: Vec2 = target
) {
    const next = nextPos(cells, enemy, target, targetLast, random)

    // Nowhere to go (e.g. boxed in on every side): stay put, still
    // remembering where it came from.
    if (next === null) return

    enemy.lastPos = vec2(enemy.pos.x, enemy.pos.y)
    enemy.pos = next
}

// The cell the enemy moves to this time, or null to stay put.
function nextPos(
    cells: Cells,
    enemy: Character,
    target: Vec2,
    targetLast: Vec2,
    random: Random
): Vec2 | null {
    switch (enemy.ai) {
        case AiType.random: {
            const pos = candidateMoves(cells, enemy)
            if (pos.length === 0) return null
            return pos[Math.floor(random() * pos.length)]
        }
        case AiType.chase:
            return chaseStep(cells, enemy, target)
        case AiType.ambusher: {
            // Already standing where it aims: every way out scores the same,
            // so it would just take direction order. Go for the player.
            const aim = ambushTarget(cells, target, targetLast)
            return chaseStep(
                cells,
                enemy,
                samePos(aim, enemy.pos) ? target : aim
            )
        }
        case AiType.patroller:
            return patrolStep(cells, enemy)
        case AiType.phantom:
            return phantomStep(cells, enemy, target)
        default: {
            // Compile-time check that every AiType is handled above.
            const unhandled: never = enemy.ai
            throw new Error(`Unknown AI type: ${String(unhandled)}`)
        }
    }
}

// Follow the shortest path (wrap-around included) to `target`, never
// reversing (see candidateMoves). The enemy's own cell is blocked, so each
// candidate is scored by its shortest path that doesn't double back through
// the enemy; otherwise every forward candidate could score "back the way it
// came" and tie. Ties go to the first candidate in direction order. If the
// target is unreachable every candidate is Infinity, so this falls back to
// the first candidate and keeps the enemy moving.
function chaseStep(cells: Cells, enemy: Character, target: Vec2): Vec2 | null {
    const pos = candidateMoves(cells, enemy)
    if (pos.length === 0) return null
    const dist = distanceMap(cells, target, enemy.pos)
    return nearest(pos, dist)
}

// The first of `pos` with the smallest distance in `dist`.
function nearest(pos: readonly Vec2[], dist: number[][]): Vec2 {
    let best = pos[0]
    for (let i = 1; i < pos.length; i++) {
        if (dist[pos[i].y][pos[i].x] < dist[best.y][best.x]) best = pos[i]
    }
    return best
}

// Where an ambusher aims: AMBUSH_AHEAD cells ahead of the player along its
// heading (its latest move, wrap-aware). If that cell is a wall or off the
// map, it walks back towards the player until it finds an open cell, and
// aims at the player itself when nothing ahead is open or the player hasn't
// moved yet (no heading, e.g. at the start or after a respawn). The cells
// ahead are counted in a straight line without wrapping, so a heading into
// a tunnel aims at the tunnel mouth rather than across the map.
export function ambushTarget(
    cells: Cells,
    player: Vec2,
    playerLast: Vec2
): Vec2 {
    const height = cells.length
    const width = cells[0].length
    const step = moveStep(playerLast, player, width, height)
    const dx = Math.sign(step.x)
    const dy = Math.sign(step.y)
    if (dx === 0 && dy === 0) return player
    for (let k = AMBUSH_AHEAD; k > 0; k--) {
        const x = player.x + dx * k
        const y = player.y + dy * k
        if (x < 0 || y < 0 || x >= width || y >= height) continue
        if (cells[y][x] !== Cell.wall) return vec2(x, y)
    }
    return player
}

// A patroller heads for its current waypoint by the shortest path; on
// reaching it, it moves on to the next one, looping back to the first after
// the last. Unlike chase it may turn back, since a route can double back on
// itself (e.g. a back-and-forth beat along a corridor). Ties go to direction
// order. It stays put if the waypoint is unreachable, which parseLevel rules
// out.
function patrolStep(cells: Cells, enemy: Character): Vec2 | null {
    const route = enemy.route
    if (!route || route.length === 0) {
        throw new Error("A patroller needs a route")
    }
    if (samePos(enemy.pos, route[enemy.routeIndex])) {
        enemy.routeIndex = (enemy.routeIndex + 1) % route.length
    }
    const waypoint = route[enemy.routeIndex]
    const pos = openNeighbours(cells, enemy.pos)
    if (pos.length === 0) return null
    const dist = distanceMap(cells, waypoint)
    const best = nearest(pos, dist)
    return dist[best.y][best.x] === Infinity ? null : best
}

// A phantom ignores walls: it steps to whichever neighbouring cell is
// closest to the player in a straight (Manhattan) line, ties going to
// direction order. It stays inside the map and doesn't use wrap-around
// tunnels, so it can never end up off the board. It may turn back, as the
// player can double back past it. It stays put on the player's cell.
function phantomStep(
    cells: Cells,
    enemy: Character,
    target: Vec2
): Vec2 | null {
    const height = cells.length
    const width = cells[0].length
    const away = (v: Vec2) =>
        Math.abs(v.x - target.x) + Math.abs(v.y - target.y)
    let best: Vec2 | null = null
    for (const d of allDirections) {
        const v = vec2(
            enemy.pos.x + directions[d].x,
            enemy.pos.y + directions[d].y
        )
        if (v.x < 0 || v.y < 0 || v.x >= width || v.y >= height) continue
        if (best === null || away(v) < away(best)) best = v
    }
    return best !== null && away(best) < away(enemy.pos) ? best : null
}
