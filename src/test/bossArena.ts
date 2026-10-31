import { bossReach, footprint, mapFloor } from "../boss"
import { bossBreathCells } from "../bossBreath"
import { Cell, TICK_RATE, type Direction } from "../constants"
import { MAP_SIZE, type Difficulty, type MapSize } from "../difficulty"
import { createGameState, step } from "../game"
import type { Cells, Level } from "../level"
import { openNeighbours } from "../path"
import { AnimalId } from "../roster"
import { allDirections, directions, samePos, vec2, type Vec2 } from "../vec2"
import { EACH_MAP } from "./helpers"

// Shape checks for boss stage tests: where the boss can go on a level's map
// and where its breath can reach, with no tile effects about, and its
// breath played out through the real step against a player in its way
// (dodgeHits).

export const cellKey = (p: Vec2) => `${p.x},${p.y}`

export type BossArena = {
    cells: Cells
    open: Vec2[]
    dots: Vec2[]
    // Every top-left position the boss can get to from its spawn, through
    // positions where it fits (as bossMove moves it).
    reach: Vec2[]
    // The cells its footprint can ever cover, as cellKey.
    bossCells: ReadonlySet<string>
    // Open cells it can never cover: the ground its touch never reaches.
    safe: Vec2[]
    // Safe cells next to one it can cover: the ways into its arena.
    doors: Vec2[]
}

export function bossArena(level: Level): BossArena {
    const cells: Cells = level.cells.map((row) => [...row])
    const open: Vec2[] = []
    cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            if (cell !== Cell.wall) open.push(vec2(x, y))
        })
    )
    const dots = open.filter(({ x, y }) => cells[y][x] === Cell.dot)
    const reach = bossReach(level.boss!.pos, mapFloor(cells)).map((r) => r.pos)
    const bossCells = new Set(reach.flatMap((p) => footprint(p).map(cellKey)))
    const safe = open.filter((p) => !bossCells.has(cellKey(p)))
    const doors = safe.filter((p) =>
        openNeighbours(cells, p).some((q) => bossCells.has(cellKey(q)))
    )
    return { cells, open, dots, reach, bossCells, safe, doors }
}

// How the safe cells lie round the boss's arena: the ways (`sides`, in
// Direction order) in which they go all the way past it, that is, from
// every cell it can cover, going straight that way meets a safe cell; and
// whether they are all joined up. All four sides, joined: a corridor all
// round it.
export function safeAround(arena: BossArena): {
    sides: Direction[]
    joined: boolean
} {
    const { cells, safe, bossCells } = arena
    const safeKeys = new Set(safe.map(cellKey))
    const sides = allDirections.filter((dir) => {
        const d = directions[dir]
        return [...bossCells].every((key) => {
            let [x, y] = key.split(",").map(Number)
            for (;;) {
                x += d.x
                y += d.y
                if (cells[y]?.[x] === undefined) return false
                if (safeKeys.has(`${x},${y}`)) return true
            }
        })
    })
    const queue = safe.slice(0, 1)
    const seen = new Set(queue.map(cellKey))
    for (let head = 0; head < queue.length; head++) {
        for (const q of openNeighbours(cells, queue[head])) {
            const k = cellKey(q)
            if (seen.has(k) || !safeKeys.has(k)) continue
            seen.add(k)
            queue.push(q)
        }
    }
    return { sides, joined: seen.size === safe.length }
}

// The fewest moves from `from` to a cell `hit` doesn't hold, over open
// cells and never through `body` (the boss's footprint, whose touch hurts
// harder than its breath), or Infinity if there is none.
export function escapeMoves(
    cells: Cells,
    body: ReadonlySet<string>,
    hit: ReadonlySet<string>,
    from: Vec2
): number {
    const path = escapePath(cells, body, hit, from)
    return path ? path.length - 1 : Infinity
}

// A shortest way out, as escapeMoves counts it: the cells from `from` to
// the first one `hit` doesn't hold, both included (just `from` if it is
// out already), or null if there is none.
export function escapePath(
    cells: Cells,
    body: ReadonlySet<string>,
    hit: ReadonlySet<string>,
    from: Vec2
): Vec2[] | null {
    const cameFrom = new Map<string, Vec2 | null>([[cellKey(from), null]])
    const queue = [from]
    for (let head = 0; head < queue.length; head++) {
        const p = queue[head]
        if (!hit.has(cellKey(p))) {
            const path = [p]
            for (let q = cameFrom.get(cellKey(p)); q;) {
                path.unshift(q)
                q = cameFrom.get(cellKey(q))
            }
            return path
        }
        for (const q of openNeighbours(cells, p)) {
            const k = cellKey(q)
            if (cameFrom.has(k) || body.has(k)) continue
            cameFrom.set(k, p)
            queue.push(q)
        }
    }
    return null
}

// Every breath the boss can breathe on `level`: from each position it can
// reach, along each way, with the level's breath range. For each cell it
// strikes, the fewest moves a player there needs to stand out of it (see
// escapeMoves), by cellKey.
export function breathEscapes(level: Level): {
    // The most moves any struck cell needs, over every breath.
    worst: Map<string, number>
    // Every cell some breath strikes.
    struck: ReadonlySet<string>
} {
    const { cells, reach } = bossArena(level)
    const game = createGameState(level)
    const { range } = game.boss!.breath
    const worst = new Map<string, number>()
    const struckEver = new Set<string>()
    for (const pos of reach) {
        const body = new Set(footprint(pos).map(cellKey))
        for (const dir of allDirections) {
            const struck = bossBreathCells(game, pos, directions[dir], range)
            const hit = new Set(struck.map(cellKey))
            for (const cell of struck) {
                const key = cellKey(cell)
                struckEver.add(key)
                const moves = escapeMoves(cells, body, hit, cell)
                worst.set(key, Math.max(worst.get(key) ?? 0, moves))
            }
        }
    }
    return { worst, struck: struckEver }
}

// What a boss stage's dodges are played on and as (see dodgeHits): each map
// at the difficulty with the most enemies (though there are none about;
// the hardest, so Super Hard's boss, KDA-290), as the Dragon, at 4 cells/s like every character but the Boar, and as
// the Boar, the slowest (3.5).
export const DODGE_RUNS: readonly {
    size: MapSize
    difficulty: Difficulty
    animal: AnimalId
}[] = EACH_MAP.flatMap((difficulty) =>
    [AnimalId.dragon, AnimalId.boar].map((animal) => ({
        size: MAP_SIZE[difficulty],
        difficulty,
        animal,
    }))
)

// A player the boss's breath is aimed at as its wind-up starts: the boss at
// rest with its footprint at `boss`, facing `facing`, and the player on
// `cell`, a cell the breath strikes, either standing there (`from` null)
// or just setting off into it from `from`, a neighbour (moveProgress 0, so
// drawn on `from`). `path` is its shortest way out from `cell` (see
// escapePath), which a player gliding in has to take from there: a glide
// can't turn back.
export type BreathDodge = {
    boss: Vec2
    facing: Direction
    cell: Vec2
    from: Vec2 | null
    path: readonly Vec2[]
}

// Every BreathDodge on `level`: from every position the boss can reach,
// along every way, on every cell that breath strikes, the player standing
// there or setting off into it from each open neighbour outside the
// boss's footprint. Throws if a struck cell has no way out at all.
export function breathDodges(level: Level): BreathDodge[] {
    const { cells, reach } = bossArena(level)
    const game = createGameState(level)
    const { range } = game.boss!.breath
    const dodges: BreathDodge[] = []
    for (const boss of reach) {
        const body = new Set(footprint(boss).map(cellKey))
        for (const facing of allDirections) {
            const way = directions[facing]
            const struck = bossBreathCells(game, boss, way, range)
            const hit = new Set(struck.map(cellKey))
            for (const cell of struck) {
                const path = escapePath(cells, body, hit, cell)
                if (!path) throw new Error(`No way out of ${cellKey(cell)}`)
                dodges.push({ boss, facing, cell, from: null, path })
                for (const from of openNeighbours(cells, cell)) {
                    if (!body.has(cellKey(from))) {
                        dodges.push({ boss, facing, cell, from, path })
                    }
                }
            }
        }
    }
    return dodges
}

// Play `dodge` out through the real step, as `animal`, at `difficulty`
// (none unless given), with no enemies about: the boss winds up (its
// wind-up, from its first tick) and breathes, while the player, with no
// time to react, follows its path out from the first tick and then stands
// still. Returns whether it was hurt.
export function dodgeHit(
    level: Level,
    animal: AnimalId,
    dodge: BreathDodge,
    difficulty?: Difficulty
): boolean {
    const state = createGameState(level, animal, "solo", difficulty)
    state.enemies = []
    state.spawns.enemies = []
    const boss = state.boss!
    const { breath } = boss
    boss.pos = vec2(dodge.boss.x, dodge.boss.y)
    boss.lastPos = vec2(dodge.boss.x, dodge.boss.y)
    boss.moveProgress = 1
    const facing = directions[dodge.facing]
    breath.facing = vec2(facing.x, facing.y)
    breath.windingUp = breath.windUp
    const player = state.players[0].character
    const from = dodge.from ?? dodge.cell
    player.pos = vec2(dodge.cell.x, dodge.cell.y)
    player.lastPos = vec2(from.x, from.y)
    player.moveProgress = dodge.from ? 0 : 1
    const { path } = dodge
    for (let tick = 0; tick < breath.windUp; tick++) {
        const next = path[path.findIndex((p) => samePos(p, player.pos)) + 1]
        const held = next
            ? [vec2(next.x - player.pos.x, next.y - player.pos.y)]
            : []
        step(state, 1 / TICK_RATE, { held, pressed: vec2(0, 0) }, () => 0)
        if (state.events.some((e) => e.type === "hurt")) return true
    }
    if (!state.events.some((e) => e.type === "bossBreathed")) {
        throw new Error("The boss didn't breathe at the end of its wind-up")
    }
    return false
}

// Every this many dodges with a one-move way out is played (see
// dodgeHits).
const ONE_MOVE_SAMPLE = 16

const FACINGS = ["up", "left", "down", "right"] as const

// The dodges on `level` the breath hits, played out as `animal` at
// `difficulty` (see dodgeHit), each as a line to read, and how many were
// played: every one with two moves or more to go from its cell, where the
// wind-up is tight, and every ONE_MOVE_SAMPLE-th of the rest, to keep it
// quick.
export function dodgeHits(
    level: Level,
    animal: AnimalId,
    difficulty?: Difficulty
): { played: number; hits: string[] } {
    const played = breathDodges(level).filter(
        (dodge, i) => dodge.path.length > 2 || i % ONE_MOVE_SAMPLE === 0
    )
    const hits = played
        .filter((dodge) => dodgeHit(level, animal, dodge, difficulty))
        .map(({ boss, facing, cell, from }) => {
            const on = from
                ? `into ${cellKey(cell)} from ${cellKey(from)}`
                : `on ${cellKey(cell)}`
            return `${on}, the boss at ${cellKey(boss)} facing ${FACINGS[facing]}`
        })
    return { played: played.length, hits }
}
