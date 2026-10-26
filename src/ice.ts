import { Cell } from "./constants"
import { moveStep } from "./glide"
import { loopPos } from "./level"
import { allDirections, directions, samePos, vec2, type Vec2 } from "./vec2"

// Ice floor. Pure, no DOM.
//
// Ice is a kind of floor, kept in its own grid beside the cells (true where
// the floor is ice), so a cell's dot works the same on ice as anywhere else.
// The rules:
//
// - A character that has just moved onto ice keeps going the same way: its
//   following moves are slide steps. Sliding uses the character's normal move
//   opportunities, so it slides at its normal speed.
// - While sliding, steering is ignored: the player's held and tapped
//   directions, and enemy AI.
// - The slide ends on reaching normal floor, or on ice when the next cell
//   that way is a wall. The character is then free to move any way (which
//   may start a new slide).
// - Slides go through wrap tunnels like any other move.
//
// Whether a character is sliding is worked out from where it stands and its
// latest move (lastPos -> pos), so it needs no state of its own. Spawns are
// never on ice, and a respawn resets lastPos, so nobody starts out sliding.

// Indexed [y][x], the same shape as the cells; true where the floor is ice.
export type IceMap = readonly (readonly boolean[])[]

type Grid = readonly (readonly Cell[])[]

// Whether any cell of `ice` is ice. The answer is worked out once per map
// object and remembered, which keeps this cheap enough to ask on every enemy
// move. So an ice map must never be changed once made: code that changes the
// ice during a game (temporary ice from a breath) makes a new map instead
// (see rebuildIce in breath.ts).
const iceSeen = new WeakMap<IceMap, boolean>()
export function hasIce(ice: IceMap): boolean {
    let result = iceSeen.get(ice)
    if (result === undefined) {
        result = ice.some((row) => row.includes(true))
        iceSeen.set(ice, result)
    }
    return result
}

// The step a character at `pos` that came from `lastPos` is forced to take
// because it is sliding, or null when it is free to move. Null off ice, when
// it hasn't moved, and when the next cell in its direction is a wall.
export function slideStep(
    cells: Grid,
    ice: IceMap,
    pos: Vec2,
    lastPos: Vec2
): Vec2 | null {
    if (!ice[pos.y][pos.x]) return null
    const step = moveStep(lastPos, pos, cells[0].length, cells.length)
    // Only a one-cell move has a direction to keep (moves always are one
    // cell; this guards against a character placed by hand).
    if (Math.abs(step.x) + Math.abs(step.y) !== 1) return null
    const next = loopPos(cells, vec2(pos.x + step.x, pos.y + step.y))
    return cells[next.y][next.x] === Cell.wall ? null : step
}

// ---- Slide-aware movement graph, for level checks and enemy pathing ----

// Where a character is and whether it is sliding: `heading` is the index in
// allDirections of the slide it is in, or FREE when it may choose any way.
export type MoveState = { pos: Vec2; heading: number }

export const FREE = -1

// The state of having just moved onto `pos` heading `heading`: sliding if
// that move starts or continues a slide, else free.
function arrive(cells: Grid, ice: IceMap, pos: Vec2, heading: number) {
    const d = directions[allDirections[heading]]
    const from = vec2(pos.x - d.x, pos.y - d.y)
    const sliding = slideStep(cells, ice, pos, from) !== null
    return { pos, heading: sliding ? heading : FREE }
}

// The states one move away from `state`: the one slide step if it is
// sliding, else a step each way that isn't a wall (wrap-aware).
export function nextStates(
    cells: Grid,
    ice: IceMap,
    state: MoveState
): MoveState[] {
    const headings =
        state.heading === FREE
            ? allDirections.map((_, i) => i)
            : [state.heading]
    const result: MoveState[] = []
    for (const heading of headings) {
        const d = directions[allDirections[heading]]
        const to = loopPos(cells, vec2(state.pos.x + d.x, state.pos.y + d.y))
        if (cells[to.y][to.x] === Cell.wall) continue
        result.push(arrive(cells, ice, to, heading))
    }
    return result
}

const stateKey = (s: MoveState) => `${s.pos.x},${s.pos.y},${s.heading}`

export type SlideReach = {
    // Every state the player can get into from standing free at the start.
    states: MoveState[]
    // Per cell [y][x]: whether the player can pass over it (and so eat a dot
    // there).
    visited: boolean[][]
    // Reached states from which the player can never get back to standing
    // free at the start, e.g. the far end of a one-way slide or an endless
    // slide round a tunnel. From every other reached state everything
    // reachable stays reachable.
    stuck: MoveState[]
}

// Breadth-first search of the player's slide-aware moves from standing free
// at `start`, ignoring enemies. Without ice every state is free and moves
// are symmetric, so this is plain reachability and nothing is stuck.
export function slideReach(cells: Grid, ice: IceMap, start: Vec2): SlideReach {
    const origin: MoveState = { pos: vec2(start.x, start.y), heading: FREE }
    const index = new Map<string, number>([[stateKey(origin), 0]])
    const states: MoveState[] = [origin]
    // Reverse edges: for each state, the states that move into it.
    const into: number[][] = [[]]
    for (let head = 0; head < states.length; head++) {
        for (const next of nextStates(cells, ice, states[head])) {
            const key = stateKey(next)
            let i = index.get(key)
            if (i === undefined) {
                i = states.length
                index.set(key, i)
                states.push(next)
                into.push([])
            }
            into[i].push(head)
        }
    }

    // Walk the reverse edges from the start: whatever it reaches can get
    // back to the start.
    const back = new Set<number>([0])
    const queue = [0]
    for (let head = 0; head < queue.length; head++) {
        for (const i of into[queue[head]]) {
            if (back.has(i)) continue
            back.add(i)
            queue.push(i)
        }
    }

    const visited = cells.map((row) => row.map(() => false))
    for (const s of states) visited[s.pos.y][s.pos.x] = true
    return {
        states,
        visited,
        stuck: states.filter((_, i) => !back.has(i)),
    }
}

// Whether any state at `pos` in `states` is free (the player can stop or
// turn there), as opposed to only sliding over it.
export function canStopAt(states: readonly MoveState[], pos: Vec2): boolean {
    return states.some((s) => s.heading === FREE && samePos(s.pos, pos))
}

// ---- Slide-aware distances, for enemy pathing and patrol checks ----

// The state a character free at `pos` gets into by stepping `heading` (an
// index in allDirections), or null when that way is a wall.
export function stepFrom(
    cells: Grid,
    ice: IceMap,
    pos: Vec2,
    heading: number
): MoveState | null {
    const d = directions[allDirections[heading]]
    const to = loopPos(cells, vec2(pos.x + d.x, pos.y + d.y))
    if (cells[to.y][to.x] === Cell.wall) return null
    return arrive(cells, ice, to, heading)
}

// The number of moves from a state until a character first stands on the
// target cell, whether it stops there or only slides over it; Infinity when
// it never can.
export type SlideDistance = (state: MoveState) => number

// States per cell: free, or sliding in one of the four directions.
const STATES_PER_CELL = allDirections.length + 1

// Slide-aware distances to `target`: like distanceMap in path.ts, but a move
// onto ice may force a slide, so the distance is the real number of moves
// counting the slide steps, and a cell only slid over counts as reached.
// An optional `blocked` cell is treated like a wall (unless it is the
// target): paths that would stop on it or slide over it don't count.
//
// It is one breadth-first search backwards from the target over (cell,
// free or sliding heading) states, so asking for several states is cheap.
// Without ice every state is free and this equals distanceMap exactly.
export function slideDistances(
    cells: Grid,
    ice: IceMap,
    target: Vec2,
    blocked?: Vec2
): SlideDistance {
    const height = cells.length
    const width = cells[0].length
    const index = (x: number, y: number, heading: number) =>
        (y * width + x) * STATES_PER_CELL + heading + 1
    const dist = new Float64Array(width * height * STATES_PER_CELL).fill(
        Infinity
    )
    const queue = new Int32Array(dist.length)
    let tail = 0
    const reach = (x: number, y: number, heading: number, d: number) => {
        const i = index(x, y, heading)
        if (dist[i] !== Infinity) return
        dist[i] = d
        queue[tail++] = i
    }
    // Whether a move onto (x, y) heading `heading` starts or continues a
    // slide (see slideStep).
    const slides = (x: number, y: number, heading: number) => {
        if (!ice[y][x]) return false
        const d = directions[allDirections[heading]]
        const next = loopPos(cells, vec2(x + d.x, y + d.y))
        return cells[next.y][next.x] !== Cell.wall
    }

    // Standing on the target in any state counts as reaching it.
    reach(target.x, target.y, FREE, 0)
    for (let h = 0; h < allDirections.length; h++) {
        if (slides(target.x, target.y, h)) reach(target.x, target.y, h, 0)
    }

    for (let head = 0; head < tail; head++) {
        const i = queue[head]
        const cell = Math.floor(i / STATES_PER_CELL)
        const heading = (i % STATES_PER_CELL) - 1
        const x = cell % width
        const y = Math.floor(cell / width)
        const next = dist[i] + 1
        // The moves into this state: a sliding state is entered by a move
        // its way that slides; a free one by any move that doesn't.
        for (let h = 0; h < allDirections.length; h++) {
            if (heading !== FREE && h !== heading) continue
            if (slides(x, y, h) !== (heading !== FREE)) continue
            const d = directions[allDirections[h]]
            const from = loopPos(cells, vec2(x - d.x, y - d.y))
            if (cells[from.y][from.x] === Cell.wall) continue
            if (blocked && samePos(from, blocked)) continue
            // Either free there and choosing this way, or already sliding
            // this way (which needs ice there).
            reach(from.x, from.y, FREE, next)
            if (ice[from.y][from.x]) reach(from.x, from.y, h, next)
        }
    }

    return (state) => dist[index(state.pos.x, state.pos.y, state.heading)]
}

// The state a patroller free at `pos` moves into, heading for the target of
// `dist` (see slideDistances): the step whose path there is shortest, ties
// going to direction order. Null when every way is a wall or the target
// can't be reached. Used by the patroller AI (ai.ts) and parseLevel's route
// check, so the check walks exactly the path the patroller will.
export function patrolMove(
    cells: Grid,
    ice: IceMap,
    pos: Vec2,
    dist: SlideDistance
): MoveState | null {
    let best: MoveState | null = null
    let bestDist = Infinity
    for (let heading = 0; heading < allDirections.length; heading++) {
        const next = stepFrom(cells, ice, pos, heading)
        if (next === null) continue
        const d = dist(next)
        if (d < bestDist) {
            best = next
            bestDist = d
        }
    }
    return best
}
