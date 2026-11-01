// The bot that plays the demo run (see record-demo.ts): it heads for the
// nearest dot along paths that keep a cell away from the enemies, runs from
// them when cornered, and breathes fire at an enemy in front of it. Pure:
// it decides from the game state alone.
import { energyHud } from "../../src/breath.ts"
import { Cell, TICK_MS } from "../../src/constants.ts"
import {
    startLevel,
    update,
    type Screen,
    type TickInput,
} from "../../src/flow.ts"
import type { GameState } from "../../src/game.ts"
import type { DirectionAction } from "../../src/input.ts"
import { stages as levels } from "../../src/levels/index.ts"
import { openNeighbours } from "../../src/path.ts"
import { emptyProgress } from "../../src/progress.ts"
import {
    createRecorder,
    seededRandom,
    shouldRecord,
    type Recording,
} from "../../src/replay.ts"
import { vec2, type Vec2 } from "../../src/vec2.ts"

const DIRECTIONS: Record<DirectionAction, Vec2> = {
    up: vec2(0, -1),
    down: vec2(0, 1),
    left: vec2(-1, 0),
    right: vec2(1, 0),
}

const key = (p: Vec2) => `${p.x},${p.y}`

// The direction (as an action) of the one-cell step from `a` to `b`,
// wrapping around tunnels.
export function directionTo(a: Vec2, b: Vec2): DirectionAction {
    // A step of more than one cell is one across a tunnel, the other way.
    const across = (d: number) => (Math.abs(d) > 1 ? -Math.sign(d) : d)
    const dx = across(b.x - a.x)
    const dy = across(b.y - a.y)
    if (dx > 0) return "right"
    if (dx < 0) return "left"
    return dy > 0 ? "down" : "up"
}

// Cells the bot keeps off: every enemy in play's cell and its neighbours.
function dangerOf(game: GameState): Set<string> {
    const danger = new Set<string>()
    for (const enemy of game.enemies) {
        if (enemy.respawnIn > 0) continue
        danger.add(key(enemy.pos))
        for (const n of openNeighbours(game.cells, enemy.pos))
            danger.add(key(n))
    }
    return danger
}

// Breadth-first search from `from`, avoiding `avoid`, for the nearest cell
// `goal` accepts. The first step towards it, or null.
export function firstStepTo(
    game: GameState,
    from: Vec2,
    avoid: Set<string>,
    goal: (p: Vec2) => boolean
): Vec2 | null {
    const cameFrom = new Map<string, Vec2 | null>([[key(from), null]])
    const queue: Vec2[] = [from]
    for (let head = 0; head < queue.length; head++) {
        const pos = queue[head]
        if (head > 0 && goal(pos)) {
            let step = pos
            for (;;) {
                const prev = cameFrom.get(key(step))
                if (!prev || key(prev) === key(from)) return step
                step = prev
            }
        }
        for (const n of openNeighbours(game.cells, pos)) {
            if (cameFrom.has(key(n)) || avoid.has(key(n))) continue
            cameFrom.set(key(n), pos)
            queue.push(n)
        }
    }
    return null
}

// When no dot is safely reachable: the neighbour farthest from the nearest
// enemy.
function fleeStep(game: GameState, from: Vec2): Vec2 | null {
    let best: Vec2 | null = null
    let bestScore = -Infinity
    for (const n of openNeighbours(game.cells, from)) {
        const score = Math.min(
            ...game.enemies
                .filter((e) => e.respawnIn === 0)
                .map((e) => Math.abs(e.pos.x - n.x) + Math.abs(e.pos.y - n.y))
        )
        if (score > bestScore) {
            bestScore = score
            best = n
        }
    }
    return best
}

// Whether an enemy in play is within the fire's reach straight ahead.
function enemyAhead(game: GameState): boolean {
    const player = game.players[0]
    const { facing } = player.breather
    let p = player.character.pos
    for (let i = 0; i < 4; i++) {
        p = vec2(p.x + facing.x, p.y + facing.y)
        if (game.cells[p.y]?.[p.x] === undefined) return false
        if (game.cells[p.y][p.x] === Cell.wall) return false
        const q = p
        if (
            game.enemies.some((e) => e.respawnIn === 0 && key(e.pos) === key(q))
        )
            return true
    }
    return false
}

export function decide(game: GameState): {
    dir: DirectionAction | null
    breath: boolean
} {
    const me = game.players[0].character.pos
    const isDot = (p: Vec2) => game.cells[p.y][p.x] === Cell.dot
    const step =
        firstStepTo(game, me, dangerOf(game), isDot) ??
        firstStepTo(game, me, new Set(), isDot) ??
        fleeStep(game, me)
    const breath = energyHud(game).ready && enemyAhead(game)
    return { dir: step ? directionTo(me, step) : null, breath }
}

export function inputOf(
    dir: DirectionAction | null,
    pressed: boolean,
    breath: boolean
): TickInput {
    return {
        wasPressed: (action, player = 0) =>
            player === 0 &&
            ((pressed && action === dir) || (breath && action === "breath")),
        move: (player = 0) => ({
            held: player === 0 && dir ? [DIRECTIONS[dir]] : [],
            pressed:
                player === 0 && dir && pressed ? DIRECTIONS[dir] : vec2(0, 0),
            breath: player === 0 && breath,
        }),
    }
}

export const SEED = 20261028
const LEVEL = 0
// Stop after this many ticks even if the run hasn't ended (2 minutes).
const MAX_TICKS = 60 * 120

// The demo run: the bot playing stage 1 as the dragon from SEED, recorded.
// Seeded throughout, so it is the same run every time.
export function playDemo(): Recording {
    const start = startLevel(levels, LEVEL, ["dragon"], "solo")
    if (start.kind !== "playing") throw new Error("Not playing")
    const deps = {
        levels,
        progress: emptyProgress(),
        dt: TICK_MS / 1000,
        random: seededRandom(SEED),
    }
    const recorder = createRecorder(start, SEED)
    let screen: Screen = start
    let held: DirectionAction | null = null
    let ticks = 0
    while (
        (screen.kind === "playing" || screen.kind === "ending") &&
        ticks < MAX_TICKS
    ) {
        let input: TickInput
        if (screen.kind === "playing") {
            const { dir, breath } = decide(screen.game)
            input = inputOf(dir, dir !== held, breath)
            held = dir
        } else {
            input = inputOf(null, false, false)
        }
        const next = update(screen, input, deps)
        if (shouldRecord(screen, next)) recorder.add(input)
        screen = next
        ticks++
    }
    return recorder.finish(screen)
}
