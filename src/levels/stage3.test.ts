import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell } from "../constants"
import { DIFFICULTIES, MAP_SIZE } from "../difficulty"
import { canStopAt, slideReach } from "../ice"
import { parseLevel, type Cells } from "../level"
import { distanceMap, openNeighbours } from "../path"
import { vec2 } from "../vec2"
import { EACH_MAP } from "../test/helpers"
import { stages } from "./index"
import { stage3 } from "./stage3"

// The sizes of the two maps (see LevelData).
const SIZES = { medium: [21, 17], large: [29, 21] } as const

describe.each(EACH_MAP)("stage 3 (%s)", (difficulty) => {
    const level = parseLevel(stage3, difficulty)
    const size = MAP_SIZE[difficulty]
    const cells: Cells = level.cells.map((row) => [...row])
    const spawn = level.playerSpawns[0]
    const open: { x: number; y: number }[] = []
    cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            if (cell !== Cell.wall) open.push({ x, y })
        })
    )
    const dots = open.filter(({ x, y }) => cells[y][x] === Cell.dot)
    const reach = slideReach(cells, level.ice, spawn)
    const midX = (level.width - 1) / 2
    const midY = (level.height - 1) / 2

    it("is the third level", () => {
        expect(stages[2][difficulty]).toEqual(level)
        expect(level.name).toBe("Ice rink")
    })

    it(`is ${SIZES[size].join("x")}`, () => {
        expect([level.width, level.height]).toEqual(SIZES[size])
    })

    // It introduces ice, and the patrollers that walk round and across
    // the rink. Every difficulty on this map gets a patroller and a chaser
    // or, on the large map, interceptors (KDA-292) among the enemies it
    // brings out, and no phantom (stage 4's) or splitter (stage 5's).
    it("lists patrollers and plain enemies at the default speed", () => {
        expect(level.enemies).toHaveLength(size === "medium" ? 4 : 8)
        for (const d of DIFFICULTIES.filter((d) => MAP_SIZE[d] === size)) {
            const ais = parseLevel(stage3, d).enemies.map((e) => e.ai)
            expect(ais).toContain(AiType.patroller)
            expect(ais).toContain(
                size === "medium" ? AiType.chase : AiType.interceptor
            )
            expect(ais).not.toContain(AiType.phantom)
            expect(ais).not.toContain(AiType.splitter)
        }
        for (const enemy of level.enemies) {
            expect(enemy.speed).toBeUndefined()
        }
        expect(level.playerSpeed).toBeUndefined()
    })

    it("has walls and ice mirrored left to right", () => {
        const walls = level.cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
        expect(level.ice).toEqual(level.ice.map((row) => [...row].reverse()))
    })

    it("is built around ice: a big share of the floor, with dots on it", () => {
        const ice = open.filter(({ x, y }) => level.ice[y][x])
        expect(ice.length / open.length).toBeGreaterThanOrEqual(0.35)
        expect(
            dots.filter(({ x, y }) => level.ice[y][x]).length
        ).toBeGreaterThanOrEqual(size === "medium" ? 50 : 90)
    })

    // The rink: wall posts standing alone on the ice in the middle of the
    // map, to stop a slide against.
    it("has a rink in the middle with posts to stop against", () => {
        const posts: string[] = []
        cells.forEach((row, y) =>
            row.forEach((cell, x) => {
                if (cell !== Cell.wall) return
                const around = [
                    [x, y - 1],
                    [x - 1, y],
                    [x, y + 1],
                    [x + 1, y],
                ].map(([nx, ny]) => level.ice[ny]?.[nx] === true)
                if (around.every(Boolean)) posts.push(`(${x}, ${y})`)
            })
        )
        expect(posts.length).toBeGreaterThanOrEqual(size === "medium" ? 8 : 12)
        expect(level.ice[midY][midX - 1]).toBe(true)
        expect(level.ice[midY][midX + 1]).toBe(true)
        expect(level.ice[midY - 1][midX]).toBe(true)
        expect(level.ice[midY + 1][midX]).toBe(true)
    })

    // Sliding only stops at a wall or on normal floor, so these dots can
    // only be eaten mid-slide, by setting off the right way from the right
    // place (or by a Penguin, walking).
    it("has many dots that can only be passed over mid-slide", () => {
        const slideOnly = dots.filter((p) => !canStopAt(reach.states, p))
        expect(slideOnly.length).toBeGreaterThanOrEqual(
            size === "medium" ? 40 : 70
        )
    })

    // The ice lane through the tunnel: a slide goes off one edge and comes
    // back in at the other, and stops on the normal floor at the centre.
    it("has an ice lane through a wrap tunnel, stopping at the centre", () => {
        const lane = level.ice[midY]
        expect(lane.filter((ice) => !ice)).toHaveLength(1)
        expect(lane[midX]).toBe(false)
        expect(cells[midY][midX]).not.toBe(Cell.wall)
        expect(cells[midY].every((cell) => cell !== Cell.wall)).toBe(true)
    })

    // Fairness, sliding included (parseLevel checks it too; this is the
    // level's own proof). Every dot can be eaten, and from everywhere the
    // player can get to, it can always get back to standing free on its
    // spawn, so no slide is a trap: whatever is left stays reachable.
    it("lets the player eat every dot and never strands it", () => {
        for (const { x, y } of dots) expect(reach.visited[y][x]).toBe(true)
        expect(reach.stuck).toEqual([])
    })

    it("has no dead ends", () => {
        const deadEnds: string[] = []
        for (const { x, y } of open) {
            if (openNeighbours(cells, vec2(x, y)).length < 2) {
                deadEnds.push(`(${x}, ${y})`)
            }
        }
        expect(deadEnds).toEqual([])
    })

    it("starts the enemies well away from the player", () => {
        const dist = distanceMap(cells, spawn)
        for (const { pos } of level.enemies) {
            expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(12)
            expect(pos.y).toBeLessThan(midY)
        }
        expect(spawn.y).toBeGreaterThan(midY)
    })
})
