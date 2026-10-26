import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell } from "../constants"
import { parseLevel, type Cells } from "../level"
import { distanceMap, openNeighbours } from "../path"
import { vec2 } from "../vec2"
import { levels } from "./index"
import { stage1 } from "./stage1"

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
