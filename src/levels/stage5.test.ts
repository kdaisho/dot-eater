import { describe, expect, it } from "vite-plus/test"
import { bossDamage, bossReach, footprint, mapFloor } from "../boss"
import { BREATHS } from "../breaths"
import { AiType, BOSS_HEALTH, BOSS_SPEED, Cell, DOT_ENERGY } from "../constants"
import { createGameState } from "../game"
import { parseLevel, type Cells } from "../level"
import { distanceMap, openNeighbours } from "../path"
import { ANIMAL_IDS } from "../roster"
import { vec2, type Vec2 } from "../vec2"
import { EACH_MAP } from "../test/helpers"
import { stages } from "./index"
import { stage5 } from "./stage5"

describe.each(EACH_MAP)("stage 5 (%s)", (difficulty) => {
    const level = parseLevel(stage5, difficulty)
    const cells: Cells = level.cells.map((row) => [...row])
    const spawn = level.playerSpawns[0]
    const open: Vec2[] = []
    cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            if (cell !== Cell.wall) open.push(vec2(x, y))
        })
    )
    const dots = open.filter(({ x, y }) => cells[y][x] === Cell.dot)
    // Every top-left position the boss can get to from its spawn, through
    // positions where it fits (as bossMove moves it, with no tile effects).
    const reachable: Vec2[] = bossReach(level.boss!.pos, mapFloor(cells)).map(
        (r) => r.pos
    )
    // Cells the boss's footprint can ever cover.
    const bossCells = new Set(
        reachable.flatMap((p) => footprint(p).map((c) => `${c.x},${c.y}`))
    )

    it("is the fifth level, the Boss lair", () => {
        expect(stages[4][difficulty]).toEqual(level)
        expect(level.name).toBe("Boss lair")
        expect(level.parTime).toBe(90)
    })

    it("starts a game with its boss, the only stage that has one", () => {
        const game = createGameState(level)
        expect(game.boss?.pos).toEqual(level.boss!.pos)
        expect(game.boss?.speed).toBe(BOSS_SPEED)
        for (const other of stages.slice(0, 4).map((s) => s[difficulty])) {
            expect(other.boss).toBeNull()
        }
    })

    it("has a boss at the default speed, a Splitter and a chaser", () => {
        expect(level.boss).not.toBeNull()
        expect(level.boss!.speed).toBeUndefined()
        expect(level.enemies.map((e) => e.ai)).toEqual([
            AiType.splitter,
            AiType.chase,
        ])
        for (const enemy of level.enemies) {
            expect(enemy.speed).toBeUndefined()
        }
        expect(level.playerSpeed).toBeUndefined()
    })

    it("regrows its dots after 10 s, and only it does", () => {
        expect(level.rules.regrowDots).toEqual({ seconds: 10 })
        const game = createGameState(level)
        expect(game.regrow?.seconds).toBe(10)
        for (const other of stages.slice(0, 4).map((s) => s[difficulty])) {
            expect(other.rules.regrowDots).toBeUndefined()
        }
    })

    it("is stage 1's size, with no tunnels, ice or fog", () => {
        expect(level.width).toBe(17)
        expect(level.height).toBe(15)
        const edges = [
            ...level.cells[0],
            ...level.cells[level.height - 1],
            ...level.cells.map((row) => row[0]),
            ...level.cells.map((row) => row[level.width - 1]),
        ]
        expect(edges.every((c) => c === Cell.wall)).toBe(true)
        expect(level.ice.flat().some(Boolean)).toBe(false)
        expect(level.rules.fog).toBeUndefined()
    })

    it("has walls mirrored left to right", () => {
        const walls = level.cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
    })

    it("has no dead ends", () => {
        const deadEnds = open.filter((p) => openNeighbours(cells, p).length < 2)
        expect(deadEnds).toEqual([])
    })

    // Every character needs 300 energy for 12 health at cost / 25 a hit;
    // the dots alone must cover that, with room to spare for misses (dots
    // growing back are the backstop, not the plan).
    it("has dots enough for every character to bring the boss down", () => {
        expect(dots.length).toBeGreaterThanOrEqual(60)
        for (const animal of ANIMAL_IDS) {
            const { cost } = BREATHS[animal]
            const needed = Math.ceil(BOSS_HEALTH / bossDamage(cost)) * cost
            expect(needed).toBe(300)
            expect(dots.length * DOT_ENERGY).toBeGreaterThanOrEqual(needed * 2)
        }
    })

    it("gives the boss an arena to roam with most of the dots", () => {
        expect(reachable.length).toBeGreaterThanOrEqual(40)
        const arenaDots = dots.filter(({ x, y }) => bossCells.has(`${x},${y}`))
        expect(arenaDots.length / dots.length).toBeGreaterThan(0.5)
    })

    it("keeps a corridor all round the arena that the boss can't enter", () => {
        const safe = open.filter(({ x, y }) => !bossCells.has(`${x},${y}`))
        expect(safe.length).toBeGreaterThanOrEqual(40)
        // The player and the enemies start there.
        for (const p of [spawn, ...level.enemies.map((e) => e.pos)]) {
            expect(bossCells.has(`${p.x},${p.y}`)).toBe(false)
        }
    })

    it("starts the boss and the enemies far from the player", () => {
        const dist = distanceMap(cells, spawn)
        for (const { pos } of level.enemies) {
            expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(15)
        }
        const boss = footprint(level.boss!.pos).map((c) => dist[c.y][c.x])
        expect(Math.min(...boss)).toBeGreaterThanOrEqual(15)
    })
})
