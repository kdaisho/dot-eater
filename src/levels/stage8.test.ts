import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell } from "../constants"
import { DIFFICULTIES, ENEMY_COUNT, MAP_SIZE } from "../difficulty"
import { canStopAt, FREE, nextStates, slideReach, type MoveState } from "../ice"
import { type Cells } from "../level"
import { distanceMap, openNeighbours } from "../path"
import { vec2, type Vec2 } from "../vec2"
import { EACH_MAP } from "../test/helpers"
import { stages } from "./index"
import { stage8 } from "./stage8"

const stage = stages[7]

// The longest a slide may be, in moves (the step onto the ice included): as
// far as the fog's light reaches, plus two.
const MAX_SLIDE = 6

describe.each(EACH_MAP)("stage 8 (%s)", (difficulty) => {
    const level = stage[difficulty]
    const cells: Cells = level.cells.map((row) => [...row])
    const spawn = level.playerSpawns[0]
    const open: Vec2[] = []
    cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            if (cell !== Cell.wall) open.push(vec2(x, y))
        })
    )
    const dots = open.filter(({ x, y }) => cells[y][x] === Cell.dot)
    const onIce = (p: Vec2) => level.ice[p.y][p.x]
    const reach = slideReach(cells, level.ice, spawn)

    // Every slide a player can set off on from where it can stand free:
    // how many moves it takes and where it ends, free again.
    const slides: { from: Vec2; to: Vec2; moves: number }[] = []
    for (const state of reach.states) {
        if (state.heading !== FREE) continue
        for (const first of nextStates(cells, level.ice, state)) {
            if (first.heading === FREE) continue
            let at: MoveState = first
            let moves = 1
            while (at.heading !== FREE) {
                at = nextStates(cells, level.ice, at)[0]
                moves++
            }
            slides.push({ from: state.pos, to: at.pos, moves })
        }
    }

    it("is the eighth level, Frozen fog, with fog and a map for each size", () => {
        expect(level.name).toBe("Frozen fog")
        expect(stage8.large).not.toBe(stage8.medium)
        expect(level.rules).toEqual({ fog: { radius: 4 } })
    })

    it("is the size its map calls for, with its par time", () => {
        const size = MAP_SIZE[difficulty]
        expect([level.width, level.height]).toEqual(
            size === "medium" ? [21, 17] : [29, 21]
        )
        expect(level.parTime).toBe(size === "medium" ? 110 : 220)
    })

    it("brings out the phantom at every difficulty on this map", () => {
        for (const d of DIFFICULTIES) {
            if (MAP_SIZE[d] !== MAP_SIZE[difficulty]) continue
            const ais = stage[d].enemies.map((e) => e.ai)
            expect(ais).toHaveLength(ENEMY_COUNT[d])
            expect(ais.filter((ai) => ai === AiType.phantom)).toHaveLength(1)
            // The first three are all different, so Easy has a mix.
            expect(new Set(ais.slice(0, 3)).size).toBe(3)
        }
    })

    it("has walls and ice mirrored left to right", () => {
        const walls = level.cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
        expect(level.ice).toEqual(level.ice.map((row) => [...row].reverse()))
    })

    it("is built around ice, with dots on it", () => {
        const ice = open.filter(onIce)
        expect(ice.length / open.length).toBeGreaterThanOrEqual(0.3)
        expect(dots.filter(onIce).length).toBeGreaterThanOrEqual(35)
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

    // In the dark, a dead end is a trap: every open cell has two ways out.
    it("has no dead ends", () => {
        const deadEnds = open.filter((p) => openNeighbours(cells, p).length < 2)
        expect(deadEnds).toEqual([])
    })

    // parseStage checks it too; this is the level's own proof.
    it("never strands a sliding player", () => {
        for (const { x, y } of dots) expect(reach.visited[y][x]).toBe(true)
        expect(reach.stuck).toEqual([])
    })

    // The theme: some slides end out of the light, so the player commits
    // to them blind. The fairness: none goes more than two cells past it.
    it("has slides into the dark, none of them far", () => {
        const radius = level.rules.fog!.radius
        expect(MAX_SLIDE).toBe(radius + 2)
        expect(Math.max(...slides.map((s) => s.moves))).toBe(MAX_SLIDE)
        expect(slides.some((s) => s.moves > radius)).toBe(true)
    })

    // Every enemy is listed at every difficulty's map, so this covers the
    // spawns left empty too.
    it("never ends a slide on or next to an enemy spawn", () => {
        for (const { to } of slides) {
            for (const { pos } of level.enemies) {
                const gap = Math.max(
                    Math.abs(pos.x - to.x),
                    Math.abs(pos.y - to.y)
                )
                expect(gap, `slide to (${to.x}, ${to.y})`).toBeGreaterThan(1)
            }
        }
    })

    // The Penguin's showcase: a sliding player can only pass over these,
    // by setting off the right way from the right place, while a Penguin,
    // which walks on ice, can stop on them and turn.
    it("has dots a slider can only pass over mid-slide", () => {
        const slideOnly = dots.filter((p) => !canStopAt(reach.states, p))
        expect(slideOnly.length).toBeGreaterThanOrEqual(20)
    })

    it("starts player 2 right of player 1, at the bottom in the middle", () => {
        const [p1, p2] = level.playerSpawns
        expect(p2).toEqual(vec2(p1.x + 1, p1.y))
        expect(p1).toEqual(vec2((level.width - 1) / 2, level.height - 2))
    })

    it("starts the enemies far from the players", () => {
        for (const player of level.playerSpawns) {
            const dist = distanceMap(cells, player)
            for (const { pos } of level.enemies) {
                expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(15)
                // The phantom cuts through walls, so as the crow flies too.
                expect(
                    Math.hypot(pos.x - player.x, pos.y - player.y)
                ).toBeGreaterThanOrEqual(12)
            }
        }
    })
})
