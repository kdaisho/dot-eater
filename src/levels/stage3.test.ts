import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell } from "../constants"
import { canStopAt, slideReach } from "../ice"
import { parseLevel, type Cells } from "../level"
import { distanceMap, openNeighbours } from "../path"
import { vec2 } from "../vec2"
import { EACH_MAP } from "../test/helpers"
import { stages } from "./index"
import { stage1 } from "./stage1"
import { stage3 } from "./stage3"

describe.each(EACH_MAP)("stage 3 (%s)", (difficulty) => {
    const level = parseLevel(stage3, difficulty)
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

    it("is the third level", () => {
        expect(stages[2][difficulty]).toEqual(level)
        expect(level.name).toBe("Ice rink")
    })

    // It introduces ice, not an enemy.
    it("has two or three plain enemies at the default speed", () => {
        const ais = level.enemies.map((e) => e.ai)
        expect(ais.length).toBeGreaterThanOrEqual(2)
        expect(ais.length).toBeLessThanOrEqual(3)
        expect(ais).not.toContain(AiType.ambusher)
        expect(ais).not.toContain(AiType.phantom)
        for (const enemy of level.enemies) {
            expect(enemy.speed).toBeUndefined()
        }
        expect(level.playerSpeed).toBeUndefined()
    })

    it("is stage 1's size", () => {
        const first = parseLevel(stage1, difficulty)
        expect(level.width).toBe(first.width)
        expect(level.height).toBe(first.height)
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
        ).toBeGreaterThanOrEqual(30)
    })

    // Sliding only stops at a wall or on normal floor, so these dots can
    // only be eaten mid-slide, by setting off the right way from the right
    // place.
    it("has many dots that can only be passed over mid-slide", () => {
        const slideOnly = dots.filter((p) => !canStopAt(reach.states, p))
        expect(slideOnly.length).toBeGreaterThanOrEqual(20)
    })

    // The ice lane through the tunnel: a slide goes off one edge and comes
    // back in at the other.
    it("has a wrap tunnel with ice at both ends", () => {
        const lanes = level.ice.filter((row) => row[0] && row[level.width - 1])
        expect(lanes.length).toBeGreaterThan(0)
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
            expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(10)
        }
    })
})
