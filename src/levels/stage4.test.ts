import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell } from "../constants"
import { parseLevel, type Cells } from "../level"
import { distanceMap, openNeighbours } from "../path"
import { vec2 } from "../vec2"
import { EACH_MAP } from "../test/helpers"
import { stages } from "./index"
import { stage4 } from "./stage4"

describe.each(EACH_MAP)("stage 4 (%s)", (difficulty) => {
    const level = parseLevel(stage4, difficulty)
    const cells: Cells = level.cells.map((row) => [...row])

    it("is the fourth level", () => {
        expect(stages[3][difficulty]).toEqual(level)
    })

    it("parses, is named Fog and has fog", () => {
        expect(level.name).toBe("Fog")
        expect(level.rules.fog?.radius).toBeGreaterThanOrEqual(3)
        expect(level.rules.fog?.radius).toBeLessThanOrEqual(4)
    })

    it("introduces the phantom alongside one or two normal enemies", () => {
        const ais = level.enemies.map((e) => e.ai)
        expect(ais.filter((ai) => ai === AiType.phantom)).toHaveLength(1)
        expect(ais.length).toBeGreaterThanOrEqual(2)
        expect(ais.length).toBeLessThanOrEqual(3)
    })

    it("is around stage 1's size", () => {
        expect(level.width).toBe(17)
        expect(level.height).toBe(15)
    })

    // The phantom ignores tunnels, so they would make it trivial to escape.
    it("has no wrap tunnels", () => {
        const edges = [
            ...level.cells[0],
            ...level.cells[level.height - 1],
            ...level.cells.map((row) => row[0]),
            ...level.cells.map((row) => row[level.width - 1]),
        ]
        expect(edges.every((c) => c === Cell.wall)).toBe(true)
    })

    it("has walls mirrored left to right", () => {
        const walls = level.cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
    })

    // In the dark, a dead end is a trap: every open cell has two ways out.
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

    it("starts the enemies far from the player", () => {
        const spawn = level.playerSpawns[0]
        const dist = distanceMap(cells, spawn)
        for (const { pos, ai } of level.enemies) {
            expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(10)
            // The phantom cuts through walls, so it must be far as the crow
            // flies too, and well out of the fog's light.
            if (ai === AiType.phantom) {
                expect(
                    Math.hypot(pos.x - spawn.x, pos.y - spawn.y)
                ).toBeGreaterThanOrEqual(10)
            }
        }
    })
})
