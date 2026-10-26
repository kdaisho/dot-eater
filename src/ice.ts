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

// ---- Slide-aware movement graph, for level checks ----

// Where the player is and whether it is sliding: `heading` is the index in
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
