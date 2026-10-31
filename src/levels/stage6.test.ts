import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell } from "../constants"
import {
    DIFFICULTIES,
    ENEMY_COUNT,
    MAP_SIZE,
    type MapSize,
} from "../difficulty"
import { parseLevel, type Cells } from "../level"
import { distanceMap } from "../path"
import { EACH_MAP } from "../test/helpers"
import { chokepoints, deadEnds } from "../test/maze"
import { stages } from "./index"
import { stage6 } from "./stage6"

const SIZES: Readonly<Record<MapSize, { width: number; height: number }>> = {
    medium: { width: 21, height: 17 },
    large: { width: 29, height: 21 },
}

describe("stage 6", () => {
    it("is the sixth level, Haunted halls, with a map for each size", () => {
        expect(stages[5].medium.name).toBe("Haunted halls")
        expect(stage6.large).not.toBe(stage6.medium)
        expect(stage6.medium.parTime).toBe(75)
        expect(stage6.large.parTime).toBe(110)
    })

    // Every difficulty gets phantoms and chasers from the start (a phantom
    // first); the higher ones add interceptors (KDA-292), and the large map
    // a third phantom and, at Super Hard, a second chaser.
    const MIX = {
        easy: { phantom: 2, chase: 1, interceptor: 0 },
        medium: { phantom: 2, chase: 1, interceptor: 1 },
        hard: { phantom: 3, chase: 1, interceptor: 2 },
        superHard: { phantom: 3, chase: 2, interceptor: 3 },
    }
    it.each(DIFFICULTIES)("brings out phantoms and chasers at %s", (d) => {
        const ais = parseLevel(stage6, d).enemies.map((e) => e.ai)
        expect(ais).toHaveLength(ENEMY_COUNT[d])
        expect(ais[0]).toBe(AiType.phantom)
        const count = (ai: number) => ais.filter((a) => a === ai).length
        expect({
            phantom: count(AiType.phantom),
            chase: count(AiType.chase),
            interceptor: count(AiType.interceptor),
        }).toEqual(MIX[d])
    })
})

describe.each(EACH_MAP)("stage 6 (%s)", (difficulty) => {
    const level = parseLevel(stage6, difficulty)
    const cells: Cells = level.cells.map((row) => [...row])
    const spawn = level.playerSpawns[0]

    it("is the sixth level", () => {
        expect(stages[5][difficulty]).toEqual(level)
    })

    it("is its map size's size, with no tunnels, ice, fog or boss", () => {
        expect(level.width).toBe(SIZES[MAP_SIZE[difficulty]].width)
        expect(level.height).toBe(SIZES[MAP_SIZE[difficulty]].height)
        const edges = [
            ...level.cells[0],
            ...level.cells[level.height - 1],
            ...level.cells.map((row) => row[0]),
            ...level.cells.map((row) => row[level.width - 1]),
        ]
        expect(edges.every((c) => c === Cell.wall)).toBe(true)
        expect(level.ice.flat().some(Boolean)).toBe(false)
        expect(level.rules).toEqual({})
        expect(level.boss).toBeNull()
    })

    it("has walls mirrored left to right", () => {
        const walls = level.cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
    })

    // The halls: rows open from wall to wall, at least five of them, the
    // player's among them, so a line breath (range 5) always has room.
    it("is built around long halls that run the whole width", () => {
        const halls = level.cells.filter((row) =>
            row.slice(1, -1).every((c) => c !== Cell.wall)
        )
        expect(halls.length).toBeGreaterThanOrEqual(5)
        expect(
            level.cells[spawn.y].slice(1, -1).every((c) => c !== Cell.wall)
        ).toBe(true)
    })

    // With phantoms coming through the walls, the player must never be
    // boxed in: no dead ends, and no cell an enemy could stand on to cut the
    // maze in two.
    it("has no dead ends and a way round every cell", () => {
        expect(deadEnds(cells)).toEqual([])
        expect(chokepoints(cells)).toEqual([])
    })

    it("starts the enemies far from the player, phantoms included", () => {
        const dist = distanceMap(cells, spawn)
        for (const { pos, ai } of level.enemies) {
            expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(19)
            // A phantom comes in a straight line, through the walls.
            if (ai === AiType.phantom) {
                expect(
                    Math.hypot(pos.x - spawn.x, pos.y - spawn.y)
                ).toBeGreaterThanOrEqual(12)
            }
        }
    })
})
