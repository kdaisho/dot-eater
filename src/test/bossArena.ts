import { bossReach, footprint, mapFloor } from "../boss"
import { bossBreathCells } from "../bossBreath"
import { Cell, type Direction } from "../constants"
import { createGameState } from "../game"
import type { Cells, Level } from "../level"
import { openNeighbours } from "../path"
import { allDirections, directions, vec2, type Vec2 } from "../vec2"

// Shape checks for boss stage tests: where the boss can go on a level's map
// and where its breath can reach, with no tile effects about.

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
    const seen = new Set([cellKey(from)])
    let ring = [from]
    for (let moves = 0; ring.length > 0; moves++) {
        if (ring.some((p) => !hit.has(cellKey(p)))) return moves
        const next: Vec2[] = []
        for (const p of ring) {
            for (const q of openNeighbours(cells, p)) {
                const k = cellKey(q)
                if (seen.has(k) || body.has(k)) continue
                seen.add(k)
                next.push(q)
            }
        }
        ring = next
    }
    return Infinity
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
