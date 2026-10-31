import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell } from "../constants"
import { DIFFICULTIES, MAP_SIZE } from "../difficulty"
import { parseLevel, type Cells } from "../level"
import { distanceMap, openNeighbours } from "../path"
import { vec2 } from "../vec2"
import { EACH_MAP } from "../test/helpers"
import { stages } from "./index"
import { stage4 } from "./stage4"

// The sizes of the two maps (see LevelData).
const SIZES = { medium: [21, 17], large: [29, 21] } as const

describe.each(EACH_MAP)("stage 4 (%s)", (difficulty) => {
    const level = parseLevel(stage4, difficulty)
    const size = MAP_SIZE[difficulty]
    const cells: Cells = level.cells.map((row) => [...row])

    it("is the fourth level", () => {
        expect(stages[3][difficulty]).toEqual(level)
    })

    it("parses, is named Fog and has fog", () => {
        expect(level.name).toBe("Fog")
        expect(level.rules.fog?.radius).toBeGreaterThanOrEqual(3)
        expect(level.rules.fog?.radius).toBeLessThanOrEqual(4)
    })

    it(`is ${SIZES[size].join("x")}`, () => {
        expect([level.width, level.height]).toEqual(SIZES[size])
    })

    // Every difficulty on this map brings out the phantom, first, with at
    // least a breather (KDA-291) and a chaser, or on the large map
    // interceptors (KDA-292); only Super Hard gets a second phantom.
    it("brings out the phantom at every difficulty, alongside normal enemies", () => {
        expect(level.enemies).toHaveLength(size === "medium" ? 4 : 8)
        for (const d of DIFFICULTIES.filter((d) => MAP_SIZE[d] === size)) {
            const ais = parseLevel(stage4, d).enemies.map((e) => e.ai)
            expect(ais[0]).toBe(AiType.phantom)
            expect(ais).toContain(
                size === "medium" ? AiType.chase : AiType.interceptor
            )
            expect(ais).toContain(AiType.breather)
            expect(ais.filter((ai) => ai === AiType.phantom)).toHaveLength(
                d === "superHard" ? 2 : 1
            )
        }
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

    it("starts the enemies far from the players", () => {
        for (const spawn of level.playerSpawns) {
            const dist = distanceMap(cells, spawn)
            for (const { pos, ai } of level.enemies) {
                expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(15)
                // The phantom cuts through walls, so it must be far as the
                // crow flies too, and well out of the fog's light.
                if (ai === AiType.phantom) {
                    expect(
                        Math.hypot(pos.x - spawn.x, pos.y - spawn.y)
                    ).toBeGreaterThanOrEqual(15)
                }
            }
        }
    })

    // The two phantoms come from opposite sides of the map.
    it("starts the phantoms on opposite sides", () => {
        const phantoms = level.enemies.filter((e) => e.ai === AiType.phantom)
        const midX = (level.width - 1) / 2
        const sides = new Set(phantoms.map(({ pos }) => pos.x < midX))
        expect(sides.size).toBe(phantoms.length)
    })
})
