import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell } from "../constants"
import { DEFAULT_ANIMAL } from "../roster"
import { createGameState } from "../game"
import { parseLevel, type Cells } from "../level"
import { slideReach } from "../ice"
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

    // 2-player games start player 2 on the "Q" each stage has beside the
    // "P", on normal floor (spawns never are ice).
    it.each(levels.map((level, i) => [i + 1, level] as const))(
        "stage %i has a player 2 spawn of its own, next to player 1's",
        (_n, level) => {
            const [p1, p2] = level.playerSpawns
            expect(level.playerSpawns).toHaveLength(2)
            expect(p2).not.toEqual(p1)
            expect(Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y)).toBe(1)
            expect(level.ice[p2.y][p2.x]).toBe(false)
        }
    )

    // Player 2's spawn holds a dot in 1-player games, so they have the
    // same dots as before 2-player games existed (these counts); with a
    // player 2 it starts empty, as player 1's does.
    const SOLO_DOTS = [129, 141, 133, 125, 145]
    const dots = (cells: readonly (readonly Cell[])[]) =>
        cells.flat().filter((c) => c === Cell.dot).length
    it.each(levels.map((level, i) => [i + 1, level] as const))(
        "stage %i keeps every dot in 1-player, the spawn's too",
        (n, level) => {
            const [p1, p2] = level.playerSpawns
            const solo = createGameState(level, DEFAULT_ANIMAL)
            expect(dots(solo.cells)).toBe(SOLO_DOTS[n - 1])
            expect(solo.cells[p2.y][p2.x]).toBe(Cell.dot)
            const duo = createGameState(level, [DEFAULT_ANIMAL, DEFAULT_ANIMAL])
            expect(dots(duo.cells)).toBe(SOLO_DOTS[n - 1] - 1)
            expect(duo.cells[p2.y][p2.x]).toBe(Cell.none)
            expect(duo.cells[p1.y][p1.x]).toBe(Cell.none)
        }
    )

    // Fairness for player 2, sliding included, as parseLevel checks for
    // every spawn: every dot can be eaten from its spawn, and no slide
    // strands it with no way back there.
    it.each(levels.map((level, i) => [i + 1, level] as const))(
        "stage %i lets player 2 eat every dot from its spawn",
        (_n, level) => {
            const reach = slideReach(
                level.cells.map((row) => [...row]),
                level.ice,
                level.playerSpawns[1]
            )
            level.cells.forEach((row, y) =>
                row.forEach((cell, x) => {
                    if (cell === Cell.dot)
                        expect(reach.visited[y][x]).toBe(true)
                })
            )
            expect(reach.stuck).toEqual([])
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
    // matter. parseLevel already checks that each tunnel's far end is open,
    // so an open cell on one edge is enough to count a tunnel.
    it("has several left-right and top-bottom tunnels", () => {
        const rows = level.cells.filter((row) => row[0] !== Cell.wall)
        const columns = level.cells[0].filter((cell) => cell !== Cell.wall)
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

    // Distances include the tunnels (which save about 7 steps here), so no
    // map edit can open a short wrap to an enemy unnoticed.
    it("starts the enemies well away from the player", () => {
        const dist = distanceMap(cells, level.playerSpawns[0])
        for (const { pos } of level.enemies) {
            expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(15)
        }
    })
})
