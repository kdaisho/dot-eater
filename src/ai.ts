import type { BlockMap } from "./breath"
import { AiType, AMBUSH_AHEAD, Cell } from "./constants"
import type { Character } from "./character"
import { moveStep } from "./glide"
import type { Cells } from "./level"
import {
    hasIce,
    patrolMove,
    slideDistances,
    stepFrom,
    type IceMap,
    type MoveState,
} from "./ice"
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

// Which of `targets` (the players' cells, player 1 first) `enemy` goes
// after: the nearest by maze distance from where it stands (wrap tunnels
// included), the first on ties. Distances are measured over `view`, the
// cells as enemies see them (blockedView; `cells` when nothing is blocked),
// so a player cut off by a blocking tile, or standing on one, counts as
// unreachable. An unreachable player counts as infinitely far; if none can
// be reached on `view`, distances are measured over `cells` instead, and if
// none can be reached there either it is player 1. A phantom, which drifts
// through walls, measures straight across instead (Manhattan, as
// phantomStep moves). With one player that is always player 1, without
// searching.
export function nearestTarget(
    cells: Cells,
    enemy: Character,
    targets: readonly Vec2[],
    view: Cells = cells
): number {
    if (targets.length <= 1) return 0
    if (enemy.ai === AiType.phantom) {
        return nearestBy(
            targets,
            (p) => Math.abs(p.x - enemy.pos.x) + Math.abs(p.y - enemy.pos.y)
        )
    }
    const byPath = (over: Cells) => {
        const dist = distanceMap(over, enemy.pos)
        return (p: Vec2) => dist[p.y][p.x]
    }
    const seen = byPath(view)
    if (view === cells || targets.some((p) => seen(p) < Infinity)) {
        return nearestBy(targets, seen)
    }
    return nearestBy(targets, byPath(cells))
}

// The index of the first of `targets` with the smallest `away`.
function nearestBy(targets: readonly Vec2[], away: (p: Vec2) => number) {
    let best = 0
    for (let i = 1; i < targets.length; i++) {
        if (away(targets[i]) < away(targets[best])) best = i
    }
    return best
}

// Move one enemy according to its AI. `target` is the player's position and
// `targetLast` the cell the player came from on its latest move (the same as
// `target` if it hasn't moved), which gives the player's heading. `ice` is
// where the floor is ice (none if left out): chase, ambusher and patroller
// paths allow for the slides it forces (see slideDistances in ice.ts). The
// enemy is free to move (game.ts takes slide steps itself).
//
// `blocked` marks cells enemies keep out of (tile effects such as a stink
// cloud; see enemyBlocks in breath.ts), or null for none. Every AI treats
// them as walls, phantoms included, and an enemy standing on one heads out
// by the shortest way instead of following its AI (see escapeStep). A
// target inside a blocked patch still draws enemies to the patch's edge
// nearest it (see goalView). `view` is `cells` as enemies see them
// (blockedView); a caller moving several enemies can build it once.
export function enemyMove(
    cells: Cells,
    enemy: Character,
    target: Vec2,
    random: Random,
    targetLast: Vec2 = target,
    ice: IceMap = noIce(cells),
    blocked: BlockMap | null = null,
    view: Cells = blocked === null ? cells : blockedView(cells, blocked)
) {
    const next =
        blocked === null
            ? nextPos(cells, ice, enemy, target, targetLast, random)
            : blocked[enemy.pos.y][enemy.pos.x]
              ? escapeStep(cells, enemy, blocked)
              : enemy.ai === AiType.phantom
                ? phantomStep(cells, enemy, target, blocked)
                : nextPos(
                      view,
                      ice,
                      enemy,
                      target,
                      targetLast,
                      random,
                      (goal) => goalView(cells, view, blocked, goal)
                  )

    // Nowhere to go (e.g. boxed in on every side): stay put, still
    // remembering where it came from.
    if (next === null) return

    enemy.lastPos = vec2(enemy.pos.x, enemy.pos.y)
    enemy.pos = next
}

// The cell the enemy moves to this time, or null to stay put. `cells` are
// the cells it may move through; `paths(goal)` the ones distances to `goal`
// are measured over (see goalView), the same unless cells are blocked.
function nextPos(
    cells: Cells,
    ice: IceMap,
    enemy: Character,
    target: Vec2,
    targetLast: Vec2,
    random: Random,
    paths: (goal: Vec2) => Cells = () => cells
): Vec2 | null {
    switch (enemy.ai) {
        case AiType.random: {
            const pos = candidateMoves(cells, enemy)
            if (pos.length === 0) return null
            return pos[Math.floor(random() * pos.length)]
        }
        // A Splitter, whole or a half, chases.
        case AiType.chase:
        case AiType.splitter: {
            // Collisions are on drawn positions (see collides in game.ts),
            // so a chaser can stand on the player's cell while the player's
            // sprite is still gliding in from targetLast. Every way out
            // would score the same, so it could walk away: head for
            // targetLast instead, where the sprite is coming from.
            const aim =
                samePos(target, enemy.pos) && !samePos(targetLast, enemy.pos)
                    ? targetLast
                    : target
            return chaseStep(cells, ice, enemy, aim, paths)
        }
        case AiType.ambusher: {
            // Already standing where it aims: every way out scores the same,
            // so it would just take direction order. Go for the player.
            const aim = ambushTarget(cells, target, targetLast)
            return chaseStep(
                cells,
                ice,
                enemy,
                samePos(aim, enemy.pos) ? target : aim,
                paths
            )
        }
        case AiType.patroller:
            return patrolStep(cells, ice, enemy, paths)
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
//
// Path lengths are slide-aware (slideDistances): a candidate on ice is
// scored from the slide it starts, and the target counts as reached the
// first time the path passes over it, stopped or mid-slide. So an ambusher
// aiming at a cell it can only slide past still homes in on it, and a chaser
// that would slide through the player catches it on the way. On a map with
// no ice, plain cell distances (distanceMap) give the same answer for less.
// Distances are measured over `paths(target)` (see nextPos).
function chaseStep(
    cells: Cells,
    ice: IceMap,
    enemy: Character,
    target: Vec2,
    paths: (goal: Vec2) => Cells
): Vec2 | null {
    const pos = candidateMoves(cells, enemy)
    if (pos.length === 0) return null
    if (!hasIce(ice)) {
        return nearest(pos, distanceMap(paths(target), target, enemy.pos))
    }
    const dist = slideDistances(paths(target), ice, target, enemy.pos)
    let best = pos[0]
    let bestDist = Infinity
    for (const v of pos) {
        const state = arrival(cells, ice, enemy.pos, v)
        const d = state === null ? Infinity : dist(state)
        if (d < bestDist) {
            best = v
            bestDist = d
        }
    }
    return best
}

// The first of `pos` with the smallest distance in `dist`.
function nearest(pos: readonly Vec2[], dist: number[][]): Vec2 {
    let best = pos[0]
    for (let i = 1; i < pos.length; i++) {
        if (dist[pos[i].y][pos[i].x] < dist[best.y][best.x]) best = pos[i]
    }
    return best
}

// The state an enemy free at `from` gets into by stepping to the
// neighbouring cell `to`, or null if no step from `from` lands there.
function arrival(
    cells: Cells,
    ice: IceMap,
    from: Vec2,
    to: Vec2
): MoveState | null {
    for (let heading = 0; heading < allDirections.length; heading++) {
        const next = stepFrom(cells, ice, from, heading)
        if (next !== null && samePos(next.pos, to)) return next
    }
    return null
}

// `cells` as enemies see them: blocked cells are walls.
export function blockedView(cells: Cells, blocked: BlockMap): Cells {
    return cells.map((row, y) =>
        row.map((value, x) => (blocked[y][x] ? Cell.wall : value))
    )
}

// The cells to measure distances to `goal` over: `view` (cells as enemies
// see them), but when `goal` is in a blocked patch, that patch (the blocked
// cells joined to it through blocked cells) is open again. A path may then
// end inside the patch round the goal but never cross another one, so an
// enemy, which can't step into the patch (its moves are on `view`), still
// heads for the edge nearest the goal. Without that a player standing in
// its own stink cloud would be unreachable, and every way would score the
// same.
function goalView(
    cells: Cells,
    view: Cells,
    blocked: BlockMap,
    goal: Vec2
): Cells {
    if (!blocked[goal.y][goal.x]) return view
    const open = view.map((row) => [...row])
    open[goal.y][goal.x] = cells[goal.y][goal.x]
    const queue = [goal]
    for (let head = 0; head < queue.length; head++) {
        for (const v of openNeighbours(cells, queue[head])) {
            if (!blocked[v.y][v.x] || open[v.y][v.x] !== Cell.wall) continue
            open[v.y][v.x] = cells[v.y][v.x]
            queue.push(v)
        }
    }
    return open
}

// The first step of the shortest way from a blocked cell to one that isn't,
// through blocked cells (and, for a phantom, through walls, staying on the
// map like phantomStep). Ties go to direction order. Null when every
// reachable cell is blocked, so the enemy stays put.
function escapeStep(
    cells: Cells,
    enemy: Character,
    blocked: BlockMap
): Vec2 | null {
    const phantom = enemy.ai === AiType.phantom
    const neighbours = (p: Vec2) =>
        phantom ? mapNeighbours(cells, p) : openNeighbours(cells, p)
    const seen = new Set([`${enemy.pos.x},${enemy.pos.y}`])
    const queue: { pos: Vec2; first: Vec2 }[] = []
    for (const v of neighbours(enemy.pos)) {
        seen.add(`${v.x},${v.y}`)
        queue.push({ pos: v, first: v })
    }
    for (let head = 0; head < queue.length; head++) {
        const { pos, first } = queue[head]
        if (!blocked[pos.y][pos.x]) return first
        for (const v of neighbours(pos)) {
            const k = `${v.x},${v.y}`
            if (seen.has(k)) continue
            seen.add(k)
            queue.push({ pos: v, first })
        }
    }
    return null
}

// The cells next to `pos` on the map, walls or not, without wrapping, in
// direction order.
function mapNeighbours(cells: Cells, pos: Vec2): Vec2[] {
    const result: Vec2[] = []
    for (const d of allDirections) {
        const v = vec2(pos.x + directions[d].x, pos.y + directions[d].y)
        if (v.x < 0 || v.y < 0 || v.x >= cells[0].length) continue
        if (v.y >= cells.length) continue
        result.push(v)
    }
    return result
}

// No ice anywhere on the map.
function noIce(cells: Cells): IceMap {
    return cells.map((row) => row.map(() => false))
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
// out. Paths are slide-aware, as for chase: passing over the waypoint
// mid-slide reaches it (game.ts moves the route on when that happens).
// Distances are measured over `paths(waypoint)` (see nextPos), so a
// waypoint in a blocked patch draws it to the patch's edge.
function patrolStep(
    cells: Cells,
    ice: IceMap,
    enemy: Character,
    paths: (goal: Vec2) => Cells
): Vec2 | null {
    const route = enemy.route
    if (!route || route.length === 0) {
        throw new Error("A patroller needs a route")
    }
    if (samePos(enemy.pos, route[enemy.routeIndex])) {
        enemy.routeIndex = (enemy.routeIndex + 1) % route.length
    }
    const waypoint = route[enemy.routeIndex]
    if (!hasIce(ice)) {
        // No ice: plain cell distances give the same path for less.
        const pos = openNeighbours(cells, enemy.pos)
        if (pos.length === 0) return null
        const dist = distanceMap(paths(waypoint), waypoint)
        const best = nearest(pos, dist)
        return dist[best.y][best.x] === Infinity ? null : best
    }
    const dist = slideDistances(paths(waypoint), ice, waypoint)
    return patrolMove(cells, ice, enemy.pos, dist)?.pos ?? null
}

// A phantom ignores walls: it steps to whichever neighbouring cell is
// closest to the player in a straight (Manhattan) line, ties going to
// direction order. It stays inside the map and doesn't use wrap-around
// tunnels, so it can never end up off the board. It may turn back, as the
// player can double back past it. It stays put on the player's cell. It
// never steps into a `blocked` cell (see enemyMove).
function phantomStep(
    cells: Cells,
    enemy: Character,
    target: Vec2,
    blocked: BlockMap | null = null
): Vec2 | null {
    const away = (v: Vec2) =>
        Math.abs(v.x - target.x) + Math.abs(v.y - target.y)
    let best: Vec2 | null = null
    for (const v of mapNeighbours(cells, enemy.pos)) {
        if (blocked?.[v.y][v.x]) continue
        if (best === null || away(v) < away(best)) best = v
    }
    return best !== null && away(best) < away(enemy.pos) ? best : null
}
