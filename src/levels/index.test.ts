import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell } from "../constants"
import { parseLevel, type Cells } from "../level"
import { distanceMap, openNeighbours } from "../path"
import { vec2 } from "../vec2"
import { levels } from "./index"
import { stage1 } from "./stage1"
import { stage2 } from "./stage2"

describe("levels", () => {
    it("ships at least one level", () => {
        expect(levels.length).toBeGreaterThan(0)
    })

    it.each(levels.map((level, i) => [i, level] as const))(
        "level %i has a name and a valid map",
        (_i, level) => {
            expect(level.name.trim()).not.toBe("")
            expect(level.width).toBeGreaterThan(0)
            expect(level.height).toBeGreaterThan(0)
        }
    )
})

describe("stage 1", () => {
    const level = parseLevel(stage1)
    const cells: Cells = level.cells.map((row) => [...row])

    it("is the first level", () => {
        expect(levels[0]).toEqual(level)
        expect(level.name).toBe("Classic")
    })

    it("has one random and one chase enemy at the default speed", () => {
        expect(level.enemies.map((e) => e.ai)).toEqual([
            AiType.random,
            AiType.chase,
        ])
        for (const enemy of level.enemies) {
            expect(enemy.speed).toBeUndefined()
        }
        expect(level.playerSpeed).toBeUndefined()
    })

    it("is bigger than the old 9x9 map, with odd sides", () => {
        expect(level.width).toBeGreaterThan(9)
        expect(level.height).toBeGreaterThan(9)
        expect(level.width % 2).toBe(1)
        expect(level.height % 2).toBe(1)
    })

    it("has walls mirrored left to right", () => {
        const walls = level.cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
    })

    it("has a wrap tunnel", () => {
        const tunnels = level.cells.filter(
            (row) => row[0] !== Cell.wall && row[level.width - 1] !== Cell.wall
        )
        expect(tunnels.length).toBeGreaterThan(0)
    })

    // A tutorial shouldn't corner the player: every open cell has at least
    // two ways out.
    it("has no dead ends", () => {
        const deadEnds: string[] = []
        cells.forEach((row, y) =>
            row.forEach((cell, x) => {
                if (
                    cell !== Cell.wall &&
                    openNeighbours(cells, vec2(x, y)).length < 2
                ) {
                    deadEnds.push(`(${x}, ${y})`)
                }
            })
        )
        expect(deadEnds).toEqual([])
    })

    it("starts the enemies well away from the player", () => {
        const dist = distanceMap(cells, level.playerSpawns[0])
        for (const { pos } of level.enemies) {
            expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(10)
        }
    })
})

describe("stage 2", () => {
    const level = parseLevel(stage2)
    const cells: Cells = level.cells.map((row) => [...row])

    it("is the second level", () => {
        expect(levels[1]).toEqual(level)
        expect(level.name).toBe("Wrap maze")
    })

    it("introduces the ambusher, with a chaser and a random enemy", () => {
        expect(level.enemies.map((e) => e.ai)).toEqual([
            AiType.ambusher,
            AiType.chase,
            AiType.random,
        ])
        for (const enemy of level.enemies) {
            expect(enemy.speed).toBeUndefined()
        }
        expect(level.playerSpeed).toBeUndefined()
    })

    it("fits the same screen as stage 1", () => {
        const first = parseLevel(stage1)
        expect(level.width).toBeLessThanOrEqual(first.width)
        expect(level.height).toBeLessThanOrEqual(first.height)
    })

    it("has walls mirrored left to right", () => {
        const walls = level.cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
    })

    // The stage is built around tunnels, so both directions of wrapping
    // matter: several rows wrap left-right and several columns top-bottom.
    it("has several wrap tunnels on every edge", () => {
        const { width, height } = level
        const rows = level.cells.filter(
            (row) => row[0] !== Cell.wall && row[width - 1] !== Cell.wall
        )
        const columns = level.cells[0].filter(
            (cell, x) =>
                cell !== Cell.wall && level.cells[height - 1][x] !== Cell.wall
        )
        expect(rows.length).toBeGreaterThanOrEqual(3)
        expect(columns.length).toBeGreaterThanOrEqual(3)
    })

    it("has no dead ends", () => {
        const deadEnds: string[] = []
        cells.forEach((row, y) =>
            row.forEach((cell, x) => {
                if (
                    cell !== Cell.wall &&
                    openNeighbours(cells, vec2(x, y)).length < 2
                ) {
                    deadEnds.push(`(${x}, ${y})`)
                }
            })
        )
        expect(deadEnds).toEqual([])
    })

    // Distances include the tunnels, so no enemy starts a short wrap away.
    it("starts the enemies well away from the player", () => {
        const dist = distanceMap(cells, level.playerSpawns[0])
        for (const { pos } of level.enemies) {
            expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(12)
        }
    })
})
