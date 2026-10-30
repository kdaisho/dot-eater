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
import { vec2, type Vec2 } from "../vec2"
import { stages } from "./index"
import { stage7 } from "./stage7"

const SIZES: Readonly<Record<MapSize, { width: number; height: number }>> = {
    medium: { width: 21, height: 17 },
    large: { width: 29, height: 21 },
}

describe("stage 7", () => {
    it("is the seventh level, Patrol base, with a map for each size", () => {
        expect(stages[6].medium.name).toBe("Patrol base")
        expect(stage7.large).not.toBe(stage7.medium)
        expect(stage7.medium.parTime).toBe(80)
        expect(stage7.large.parTime).toBe(125)
    })

    // Patrollers lead every list, with an ambusher from the start; the
    // higher difficulties add more of both, and chasers.
    const MIX = {
        easy: { patroller: 2, ambusher: 1, chase: 0 },
        medium: { patroller: 2, ambusher: 1, chase: 1 },
        hard: { patroller: 3, ambusher: 2, chase: 1 },
        superHard: { patroller: 4, ambusher: 2, chase: 2 },
    }
    it.each(DIFFICULTIES)("brings out a guard mix at %s", (d) => {
        const ais = parseLevel(stage7, d).enemies.map((e) => e.ai)
        expect(ais).toHaveLength(ENEMY_COUNT[d])
        expect(ais[0]).toBe(AiType.patroller)
        const count = (ai: number) => ais.filter((a) => a === ai).length
        expect({
            patroller: count(AiType.patroller),
            ambusher: count(AiType.ambusher),
            chase: count(AiType.chase),
        }).toEqual(MIX[d])
    })
})

describe.each(EACH_MAP)("stage 7 (%s)", (difficulty) => {
    const level = parseLevel(stage7, difficulty)
    const cells: Cells = level.cells.map((row) => [...row])
    const { width, height } = level
    const spawn = level.playerSpawns[0]
    // The corridor round the base, just inside the border.
    const onRing = ({ x, y }: Vec2) =>
        x === 1 || y === 1 || x === width - 2 || y === height - 2
    const isWall = (x: number, y: number) => cells[y][x] === Cell.wall

    it("is the seventh level", () => {
        expect(stages[6][difficulty]).toEqual(level)
    })

    it("is its map size's size, with no tunnels, ice, fog or boss", () => {
        expect(width).toBe(SIZES[MAP_SIZE[difficulty]].width)
        expect(height).toBe(SIZES[MAP_SIZE[difficulty]].height)
        const edges = [
            ...level.cells[0],
            ...level.cells[height - 1],
            ...level.cells.map((row) => row[0]),
            ...level.cells.map((row) => row[width - 1]),
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

    // The base: an open corridor all round, bare floor (the dots are in the
    // rooms), with the player starting on it.
    it("has a bare corridor all round the base, the player's start on it", () => {
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                if (!onRing(vec2(x, y))) continue
                expect(isWall(x, y)).toBe(false)
                const spawned = level.playerSpawns.some(
                    (p) => p.x === x && p.y === y
                )
                const enemy = level.enemies.some(
                    (e) => e.pos.x === x && e.pos.y === y
                )
                if (!spawned && !enemy) expect(cells[y][x]).toBe(Cell.none)
            }
        }
        expect(onRing(spawn)).toBe(true)
    })

    // For the Boar's shortcuts: most walls inside the base are one cell
    // thick, with floor on both sides (the rest are where walls meet).
    it("has thin inner walls", () => {
        let inner = 0
        let thin = 0
        for (let y = 2; y < height - 2; y++) {
            for (let x = 2; x < width - 2; x++) {
                if (!isWall(x, y)) continue
                inner++
                const across =
                    (!isWall(x - 1, y) && !isWall(x + 1, y)) ||
                    (!isWall(x, y - 1) && !isWall(x, y + 1))
                if (across) thin++
            }
        }
        expect(thin / inner).toBeGreaterThanOrEqual(0.75)
    })

    it("has no dead ends and a way round every cell", () => {
        expect(deadEnds(cells)).toEqual([])
        expect(chokepoints(cells)).toEqual([])
    })

    // One guard walks the whole corridor; the others have long beats
    // through the rooms.
    it("sends one patroller round the corridor and the rest on long beats", () => {
        const routes = level.enemies.flatMap((e) =>
            e.ai === AiType.patroller ? [e.route!] : []
        )
        const corners = [
            vec2(1, 1),
            vec2(width - 2, 1),
            vec2(width - 2, height - 2),
            vec2(1, height - 2),
        ]
        const ring = routes.filter((route) =>
            corners.every((c) => route.some((p) => p.x === c.x && p.y === c.y))
        )
        expect(ring).toHaveLength(1)
        for (const route of routes) {
            const lap = route.reduce((sum, p, i) => {
                const next = route[(i + 1) % route.length]
                return sum + distanceMap(cells, p)[next.y][next.x]
            }, 0)
            expect(lap).toBeGreaterThanOrEqual(28)
        }
    })

    it("starts the enemies far from the player", () => {
        const dist = distanceMap(cells, spawn)
        for (const { pos } of level.enemies) {
            expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(17)
        }
    })
})
