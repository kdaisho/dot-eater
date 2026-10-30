import { bossReach, footprint, mapFloor } from "../boss"
import { bossBreathCells } from "../bossBreath"
import { Cell } from "../constants"
import { createGameState } from "../game"
import type { Cells, Level } from "../level"
import { distanceMap, openNeighbours } from "../path"
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

// Every breath the boss can breathe on `level`: from each position it can
// reach, along each way, with the level's breath range. For each, the
// fewest moves a player on each cell it strikes needs to stand out of it
// (on open floor it doesn't strike, off the boss's footprint), by cellKey.
export function breathEscapes(level: Level): {
    // The most moves any struck cell needs, over every breath.
    worst: Map<string, number>
    // Every cell some breath strikes.
    struck: ReadonlySet<string>
} {
    const { cells, open, reach } = bossArena(level)
    const game = createGameState(level)
    const { range } = game.boss!.breath
    const worst = new Map<string, number>()
    const struckEver = new Set<string>()
    const distances = new Map<string, number[][]>()
    for (const pos of reach) {
        const body = new Set(footprint(pos).map(cellKey))
        for (const dir of allDirections) {
            const struck = bossBreathCells(game, pos, directions[dir], range)
            const hit = new Set(struck.map(cellKey))
            for (const cell of struck) {
                const key = cellKey(cell)
                struckEver.add(key)
                let dist = distances.get(key)
                if (!dist) {
                    dist = distanceMap(cells, cell)
                    distances.set(key, dist)
                }
                let fewest = Infinity
                for (const p of open) {
                    const k = cellKey(p)
                    if (hit.has(k) || body.has(k)) continue
                    fewest = Math.min(fewest, dist[p.y][p.x])
                }
                worst.set(key, Math.max(worst.get(key) ?? 0, fewest))
            }
        }
    }
    return { worst, struck: struckEver }
}
