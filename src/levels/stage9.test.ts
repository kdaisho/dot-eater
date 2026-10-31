import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell } from "../constants"
import { DIFFICULTIES, ENEMY_COUNT, MAP_SIZE } from "../difficulty"
import { loopPos, type Cells } from "../level"
import { distanceMap, openNeighbours } from "../path"
import { vec2, type Vec2 } from "../vec2"
import { EACH_MAP } from "../test/helpers"
import { stages } from "./index"
import { stage9 } from "./stage9"

const stage = stages[8]

// The hunters' speed, a little above the default.
const HUNTER_SPEED = 2.25

describe("stage 9", () => {
    it("is the ninth level, Gauntlet, with a map for each size", () => {
        expect(stage.medium.name).toBe("Gauntlet")
        expect(stage9.large).not.toBe(stage9.medium)
    })

    // Two breathers (KDA-291) and three interceptors (KDA-292) take five
    // of Super Hard's eight places, so no difficulty has room for every
    // type: over its difficulties it has all but the wanderer.
    it("brings out every enemy type but the wanderer over its difficulties", () => {
        const all = Object.values(AiType)
        const seen = new Set(
            DIFFICULTIES.flatMap((d) => stage[d].enemies.map((e) => e.ai))
        )
        expect(seen).toEqual(new Set(all.filter((ai) => ai !== AiType.random)))
        for (const d of DIFFICULTIES) {
            const ais = new Set(stage[d].enemies.map((e) => e.ai))
            // Even Easy's three are all different.
            expect(ais.size).toBeGreaterThanOrEqual(3)
        }
    })

    it("lists as many enemies as each difficulty brings out", () => {
        for (const d of DIFFICULTIES) {
            expect(stage[d].enemies).toHaveLength(ENEMY_COUNT[d])
        }
    })
})

describe.each(EACH_MAP)("stage 9 (%s)", (difficulty) => {
    const level = stage[difficulty]
    const cells: Cells = level.cells.map((row) => [...row])
    const open: Vec2[] = []
    cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            if (cell !== Cell.wall) open.push(vec2(x, y))
        })
    )
    // How many of the 8 cells round `p` are open, wrap-aware.
    const openAround = (p: Vec2) => {
        let count = 0
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue
                const c = loopPos(cells, vec2(p.x + dx, p.y + dy))
                if (cells[c.y][c.x] !== Cell.wall) count++
            }
        }
        return count
    }

    it("is named Gauntlet, with no fog and no ice", () => {
        expect(level.name).toBe("Gauntlet")
        expect(level.rules).toEqual({})
        expect(level.ice.flat().some(Boolean)).toBe(false)
        expect(level.boss).toBeNull()
    })

    it("is the size its map calls for, with its par time", () => {
        const size = MAP_SIZE[difficulty]
        expect([level.width, level.height]).toEqual(
            size === "medium" ? [21, 17] : [29, 21]
        )
        expect(level.parTime).toBe(size === "medium" ? 100 : 180)
    })

    // The hunters: the chaser and the ambusher, and on the large map the
    // two interceptors (KDA-292) in their places.
    it("speeds up the hunters, and only them", () => {
        level.enemies.forEach(({ ai, speed }, i) => {
            const hunter =
                ai === AiType.chase ||
                ai === AiType.ambusher ||
                (ai === AiType.interceptor && i < 2)
            expect(speed).toBe(hunter ? HUNTER_SPEED : undefined)
        })
        expect(level.playerSpeed).toBeUndefined()
    })

    it("has walls mirrored left to right", () => {
        const walls = level.cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
    })

    // Left to right only: a tunnel from top to bottom would bring the
    // enemies, who start at the top, right round onto the player.
    it("has three left-right wrap tunnels and none top to bottom", () => {
        const rows = level.cells.filter((row) => row[0] !== Cell.wall)
        expect(rows).toHaveLength(3)
        expect(level.cells[0].every((c) => c === Cell.wall)).toBe(true)
    })

    it("has no dead ends", () => {
        const deadEnds = open.filter((p) => openNeighbours(cells, p).length < 2)
        expect(deadEnds).toEqual([])
    })

    // Open rooms: cells with open floor on at least 6 of the 8 cells round
    // them (room to dodge, between the pillars). Tight corridors: cells
    // with walls all round but the two ways along the corridor.
    it("mixes open rooms with tight corridors", () => {
        const roomy = open.filter((p) => openAround(p) >= 6)
        const tight = open.filter((p) => openAround(p) === 2)
        expect(roomy.length).toBeGreaterThanOrEqual(60)
        expect(tight.length).toBeGreaterThanOrEqual(20)
    })

    it("starts player 2 right of player 1, at the bottom in the middle", () => {
        const [p1, p2] = level.playerSpawns
        expect(p2).toEqual(vec2(p1.x + 1, p1.y))
        expect(p1).toEqual(vec2((level.width - 1) / 2, level.height - 2))
    })

    // Distances include the tunnels.
    it("starts the enemies far from the players", () => {
        for (const player of level.playerSpawns) {
            const dist = distanceMap(cells, player)
            for (const { pos } of level.enemies) {
                expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(14)
                // The phantom cuts through walls, so as the crow flies too.
                expect(
                    Math.hypot(pos.x - player.x, pos.y - player.y)
                ).toBeGreaterThanOrEqual(12)
            }
        }
    })
})
