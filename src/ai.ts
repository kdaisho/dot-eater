import type { BlockMap } from "./breath"
import { AiType, AMBUSH_AHEAD, Cell, SPREAD_SLACK } from "./constants"
import type { Character } from "./character"
import { moveStep } from "./glide"
import type { Cells } from "./level"
import {
    FREE,
    hasIce,
    patrolMove,
    slideDistances,
    stepFrom,
    type IceMap,
    type MoveState,
    type SlideDistance,
} from "./ice"
import { distanceMap, openNeighbours, type DistanceMap } from "./path"
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
// phantomStep moves). AIs that don't aim at a player (random, patroller)
// get player 1, as does every enemy with one player, without searching.
//
// `paths` are the distances from each target (see targetPaths); a caller
// aiming several enemies at the same targets can share them.
export function nearestTarget(
    cells: Cells,
    enemy: Character,
    targets: readonly Vec2[],
    view: Cells = cells,
    paths: TargetPaths = targetPaths(cells, targets, view)
): number {
    if (targets.length <= 1) return 0
    if (enemy.ai === AiType.random || enemy.ai === AiType.patroller) return 0
    if (enemy.ai === AiType.phantom) {
        return nearestBy(
            targets,
            (p) => Math.abs(p.x - enemy.pos.x) + Math.abs(p.y - enemy.pos.y)
        )
    }
    // Moves are symmetric, so a target's distance to the enemy is the
    // enemy's to it. (An enemy on a blocked cell is a wall of `view`, so it
    // measures over `cells`; it heads out of the patch whoever it targets.)
    const { x, y } = enemy.pos
    const seen = (i: number) => paths.view(i)[y][x]
    const indices = targets.map((_, i) => i)
    if (view !== cells && indices.every((i) => seen(i) === Infinity)) {
        return nearestBy(indices, (i) => paths.cells(i)[y][x])
    }
    return nearestBy(indices, seen)
}

// Path distances from each of `targets`, over `view` and over `cells` (see
// nearestTarget), each searched the first time it is asked for and then
// kept. A target on a wall of `view` (a blocked cell) reaches nothing there.
export type TargetPaths = {
    view: (i: number) => DistanceMap
    cells: (i: number) => DistanceMap
}

export function targetPaths(
    cells: Cells,
    targets: readonly Vec2[],
    view: Cells = cells
): TargetPaths {
    const from = (over: Cells) => {
        const maps: DistanceMap[] = []
        return (i: number) => {
            const t = targets[i]
            maps[i] ??=
                over[t.y][t.x] === Cell.wall
                    ? over.map((row) => row.map(() => Infinity))
                    : distanceMap(over, t)
            return maps[i]
        }
    }
    const overView = from(view)
    return { view: overView, cells: view === cells ? overView : from(cells) }
}

// The index of the first of `targets` with the smallest `away`.
function nearestBy<T>(targets: readonly T[], away: (t: T) => number) {
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
// `shared` keeps the distances chasers and ambushers aim by (see
// chaseStep); a caller moving several enemies in one tick can share it
// between them. `crowd` is the other enemies in play (the enemy itself may
// be among them), where they are now, so a chaser, ambusher or Splitter
// keeps from stacking on one of its kind (see spreadChoice). Returns whether
// it held its move for that; the caller counts how long (heldFor).
export function enemyMove(
    cells: Cells,
    enemy: Character,
    target: Vec2,
    random: Random,
    targetLast: Vec2 = target,
    ice: IceMap = noIce(cells),
    blocked: BlockMap | null = null,
    view: Cells = blocked === null ? cells : blockedView(cells, blocked),
    shared: ChaseDistances = new Map(),
    crowd: readonly Character[] = []
): boolean {
    const next =
        blocked === null
            ? nextPos(
                  cells,
                  ice,
                  enemy,
                  target,
                  targetLast,
                  random,
                  shared,
                  crowd
              )
            : blocked[enemy.pos.y][enemy.pos.x]
              ? escapeStep(cells, enemy, blocked)
              : enemy.ai === AiType.phantom
                ? phantomStep(cells, enemy, target, crowd, blocked)
                : nextPos(
                      view,
                      ice,
                      enemy,
                      target,
                      targetLast,
                      random,
                      shared,
                      crowd,
                      (goal) => goalView(cells, view, blocked, goal)
                  )

    // Nowhere to go (boxed in on every side), or holding a move so as not
    // to stack (see spreadChoice): stay put, still remembering where it
    // came from.
    if (next === null || next === HOLD) return next === HOLD

    enemy.lastPos = vec2(enemy.pos.x, enemy.pos.y)
    enemy.pos = next
    return false
}

// What a chaser, ambusher or Splitter chooses in place of a cell when it
// holds its move so as not to stack (see spreadChoice).
const HOLD = "hold"

// The cell the enemy moves to this time, or null to stay put (HOLD when
// that is to keep from stacking). `cells` are
// the cells it may move through; `paths(goal)` the ones distances to `goal`
// are measured over (see goalView), the same unless cells are blocked.
function nextPos(
    cells: Cells,
    ice: IceMap,
    enemy: Character,
    target: Vec2,
    targetLast: Vec2,
    random: Random,
    shared: ChaseDistances,
    crowd: readonly Character[],
    paths: (goal: Vec2) => Cells = () => cells
): Vec2 | typeof HOLD | null {
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
            return chaseStep(cells, ice, enemy, aim, paths, shared, crowd)
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
                paths,
                shared,
                crowd
            )
        }
        case AiType.patroller:
            return patrolStep(cells, ice, enemy, paths)
        case AiType.phantom:
            return phantomStep(cells, enemy, target, crowd)
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
//
// Blocking its own cell takes a search per enemy, so it first scores the
// candidates on the target's distances with nothing blocked, which every
// enemy heading for the same cell shares (`shared`). They give the same
// answer whenever the best candidate is no farther from the target than
// the enemy is: any path back through the enemy's cell is longer than
// that, so blocking it changes no candidate that could win, and moves none
// that can't win ahead of it. Only when every candidate is farther (the
// shortest way is back the way it came) does it search with its own cell
// blocked.
//
// Then it keeps from stacking on one of its kind in `crowd` (see
// spreadChoice). The shared distances give the best candidate exactly, as
// above, but not the others, so when the best would stack it searches with
// its own cell blocked after all and chooses on that. The choice (or the
// hold) is then always the one that search alone would give.
function chaseStep(
    cells: Cells,
    ice: IceMap,
    enemy: Character,
    target: Vec2,
    paths: (goal: Vec2) => Cells,
    shared: ChaseDistances,
    crowd: readonly Character[]
): Vec2 | typeof HOLD | null {
    const pos = candidateMoves(cells, enemy)
    if (pos.length === 0) return null
    const icy = hasIce(ice)
    // Where each candidate leaves it: on ice, in the slide it starts.
    const states = pos.map((v) =>
        icy ? arrival(cells, ice, enemy.pos, v) : { pos: v, heading: FREE }
    )
    const open = sharedDistance(shared, ice, target, paths)
    const best = nearestState(states, open)
    const stacks = (v: Vec2) => stacksOn(crowd, enemy, v)
    if (
        best.dist <= open({ pos: enemy.pos, heading: FREE }) &&
        !stacks(pos[best.index])
    ) {
        return pos[best.index]
    }
    const own = icy
        ? slideDistances(paths(target), ice, target, enemy.pos)
        : cellDistance(distanceMap(paths(target), target, enemy.pos))
    const scored = pos.map((v, i) => {
        const state = states[i]
        return { v, d: state === null ? Infinity : own(state) }
    })
    return spreadChoice(scored, stacks, mayHold(enemy))
}

// Two enemies of one kind (AI type) that stand on the same cell, having
// come from the same cell, move as one from then on: chasers, ambushers and
// phantoms choose without chance and never block each other, so the player
// would see one sprite where there are two. So they keep from stacking: an
// enemy takes the first of the `scored` candidates (in direction order)
// with the smallest distance `d`, unless moving there `stacks`. Then it takes the next-best that doesn't, by the
// same order, if that is at most SPREAD_SLACK longer. If none is (a
// corridor has no other way, and a much longer one would let the player
// go), it holds this move (HOLD) and chooses again on the next tick, which
// it moves on as soon as the one ahead has moved on: it follows a cell
// behind instead of stacking. Enemies move in slot order (but one behind
// a twin goes after it, see turnOrder), so of two that arrive together the
// first goes the best way and the second the next-best or a cell behind.
//
// A hold lasts one move's time at most (`hold` false once it has, see
// mayHold): then it takes the best way and may stack for a moment. A twin
// ahead that stays put (frozen, say) would otherwise keep it waiting, and
// twins filling a loop of cells, each waiting on the next, would never
// move again.
function spreadChoice(
    scored: readonly { v: Vec2; d: number }[],
    stacks: (v: Vec2) => boolean,
    hold: boolean
): Vec2 | typeof HOLD {
    const ranked = scored
        .map((c, i) => ({ ...c, i }))
        // Infinity - Infinity is NaN, which falls through to the order.
        .sort((a, b) => a.d - b.d || a.i - b.i)
    const [best] = ranked
    if (!stacks(best.v)) return best.v
    const other = ranked.find(
        (c) => c !== best && c.d <= best.d + SPREAD_SLACK && !stacks(c.v)
    )
    return other?.v ?? (hold ? HOLD : best.v)
}

// Whether `enemy` moving to `to` stacks on another enemy of its kind in
// `crowd`: one on that cell (standing there or gliding in) that came from
// the cell `enemy` is leaving, whether it moved earlier this tick or not.
// One still to take its turn this tick counts where it is, so it had
// better not be about to leave that cell: turnOrder gives it its turn
// first (but on a loop of waits).
// Only chasers, ambushers, Splitters and phantoms keep from stacking:
// random enemies part by chance and patrollers keep to their routes.
export function stacksOn(
    crowd: readonly Character[],
    enemy: Character,
    to: Vec2
): boolean {
    return (
        SPREADS.has(enemy.ai) &&
        crowd.some(
            (other) =>
                other !== enemy &&
                other.ai === enemy.ai &&
                samePos(other.pos, to) &&
                samePos(other.lastPos, enemy.pos)
        )
    )
}

const SPREADS: ReadonlySet<AiType> = new Set([
    AiType.chase,
    AiType.ambusher,
    AiType.splitter,
    AiType.phantom,
])

// The order the `ready` enemies (indexes into `enemies`, in slot order)
// take their turns in this tick: slot order, except that one goes after
// any of its twins still to go that came from the cell it stands on
// (KDA-287). Such a twin is the only kind stacksOn could count against it
// before that twin has had its turn, and it may yet move on: then the one
// behind would have stepped aside, or held, for nothing, when it could
// follow straight. Going after it, it sees where that twin ended up: moved
// on, or still there (it held, was boxed in, or is a phantom on the
// player's cell), when stacksOn counts it as before.
//
// Any order keeps twins apart as well: of two that would end a tick
// stacked, at least one moved, and the later of them to move saw the other
// already where it ended the tick (moved before, or staying put all tick)
// and kept off (unless its hold had run out, see mayHold). So the order
// only decides which of two counts the other,
// and this one keeps a twin's turn from coming before the turn of the twin
// it may follow, which is the one way a twin counts one that leaves. If
// every enemy still to go waits on another, some wait on each other round
// a loop (twins going round a loop of cells, or two that just passed each
// other): the first in slot order on that loop goes, not one merely
// waiting on it. Enemies only move on their own turns, so the order is the
// same worked out from where they stand at the start of the tick. No
// randomness: random enemies, the only ones that draw on it, never wait.
export function turnOrder(
    enemies: readonly Character[],
    ready: readonly number[]
): number[] {
    const left = [...ready]
    const order: number[] = []
    // The first twin still to go that `i` waits on, if any.
    const ahead = (i: number) =>
        left.find((j) => j !== i && follows(enemies[i], enemies[j]))
    while (left.length > 0) {
        let next = left.find((i) => ahead(i) === undefined)
        if (next === undefined) {
            // Every one waits on another, so going from one to the one it
            // waits on comes round to one seen before: that is on a loop.
            const seen: number[] = []
            let i = left[0]
            while (!seen.includes(i)) {
                seen.push(i)
                i = ahead(i) ?? i
            }
            const loop = seen.slice(seen.indexOf(i))
            next = Math.min(...loop)
        }
        left.splice(left.indexOf(next), 1)
        order.push(next)
    }
    return order
}

// Whether `enemy` is behind `ahead`, a twin that came from its cell (see
// turnOrder).
function follows(enemy: Character, ahead: Character): boolean {
    return (
        SPREADS.has(enemy.ai) &&
        ahead.ai === enemy.ai &&
        samePos(ahead.lastPos, enemy.pos) &&
        !samePos(ahead.pos, enemy.pos)
    )
}

// Whether `enemy` may hold its move to keep from stacking (see
// spreadChoice): not once it has held for a whole move's time in a row
// (heldFor, which the caller counts).
export function mayHold(enemy: Character): boolean {
    return enemy.heldFor * enemy.speed < 1 - 1e-9
}

// Distances to targets with nothing blocked, by target cell, for chaseStep.
// One set serves one tick of enemy moves (see enemyMove): the cells, ice
// and blocked cells must stay as they are while it is in use.
export type ChaseDistances = Map<string, SlideDistance>

// The distances to `target` from `shared`, searched and kept there if they
// aren't yet.
function sharedDistance(
    shared: ChaseDistances,
    ice: IceMap,
    target: Vec2,
    paths: (goal: Vec2) => Cells
): SlideDistance {
    const key = `${target.x},${target.y}`
    let dist = shared.get(key)
    if (dist === undefined) {
        dist = hasIce(ice)
            ? slideDistances(paths(target), ice, target)
            : cellDistance(distanceMap(paths(target), target))
        shared.set(key, dist)
    }
    return dist
}

// A distance map read as a SlideDistance, for a map without ice (every
// state is free).
function cellDistance(map: DistanceMap): SlideDistance {
    return (state) => map[state.pos.y][state.pos.x]
}

// The index of the first of `states` with the smallest distance in `dist`
// (a missing state is Infinity), and that distance.
function nearestState(
    states: readonly (MoveState | null)[],
    dist: SlideDistance
): { index: number; dist: number } {
    let index = 0
    let best = Infinity
    states.forEach((state, i) => {
        const d = state === null ? Infinity : dist(state)
        if (d < best) {
            index = i
            best = d
        }
    })
    return { index, dist: best }
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
//
// It keeps from stacking on another phantom like a chaser does (see
// spreadChoice), on straight-line distances: every other step is 2
// farther than the best or as near, so the next-best may take it a cell
// away from the player for a move. Holds can't wait on each other round a
// loop while phantoms go after the players (each waits on a cell nearer
// the player nearest it), but they can when each heads for its own spawn;
// the hold limit (mayHold) breaks that.
function phantomStep(
    cells: Cells,
    enemy: Character,
    target: Vec2,
    crowd: readonly Character[],
    blocked: BlockMap | null = null
): Vec2 | typeof HOLD | null {
    const away = (v: Vec2) =>
        Math.abs(v.x - target.x) + Math.abs(v.y - target.y)
    const scored = mapNeighbours(cells, enemy.pos)
        .filter((v) => !blocked?.[v.y][v.x])
        .map((v) => ({ v, d: away(v) }))
    const best = scored.reduce<{ v: Vec2; d: number } | null>(
        (a, c) => (a === null || c.d < a.d ? c : a),
        null
    )
    if (best === null || best.d >= away(enemy.pos)) return null
    return spreadChoice(
        scored,
        (v) => stacksOn(crowd, enemy, v),
        mayHold(enemy)
    )
}
