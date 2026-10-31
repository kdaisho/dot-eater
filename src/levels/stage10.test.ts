import { describe, expect, it } from "vite-plus/test"
import { bossDamage, footprint } from "../boss"
import { BREATHS } from "../breaths"
import {
    AiType,
    BOSS_BREATH_DAMAGE,
    BOSS_BREATH_EVERY,
    BOSS_BREATH_RANGE,
    BOSS_BREATH_WIND_UP,
    BOSS_HEALTH,
    BOSS_SPEED,
    Cell,
    Direction,
    DOT_ENERGY,
    TICK_RATE,
} from "../constants"
import { DIFFICULTIES, MAP_SIZE } from "../difficulty"
import { createGameState } from "../game"
import { parseLevel, parseStage } from "../level"
import { distanceMap, openNeighbours } from "../path"
import { ANIMAL_IDS } from "../roster"
import {
    bossArena,
    breathEscapes,
    cellKey,
    DODGE_RUNS,
    dodgeHits,
    safeAround,
} from "../test/bossArena"
import { EACH_MAP } from "../test/helpers"
import { STAGE_COUNT } from "../progress"
import { stages } from "./index"
import { stage5 } from "./stage5"
import { stage10 } from "./stage10"

// Stage 10, the last: index 9 in levels/index.ts.
const stage = stages[9]

it("is the tenth and last stage", () => {
    expect(stages).toHaveLength(STAGE_COUNT)
    expect(stage).toEqual(parseStage(stage10))
})

// Per map size: its size, par, doors and every enemy it lists.
const MAPS = {
    medium: {
        width: 23,
        height: 17,
        parTime: 85,
        doors: 6,
        enemies: [
            AiType.splitter,
            AiType.splitter,
            AiType.chase,
            AiType.interceptor,
        ],
    },
    large: {
        width: 29,
        height: 22,
        parTime: 100,
        doors: 8,
        enemies: [
            AiType.splitter,
            AiType.chase,
            AiType.chase,
            AiType.splitter,
            AiType.interceptor,
            AiType.interceptor,
            AiType.splitter,
            AiType.interceptor,
        ],
    },
}

it("parses at every difficulty, each its map with its enemies", () => {
    for (const difficulty of DIFFICULTIES) {
        expect(stage[difficulty]).toEqual(parseLevel(stage10, difficulty))
    }
})

describe.each(EACH_MAP)("stage 10 (%s)", (difficulty) => {
    const level = stage[difficulty]
    const map = MAPS[MAP_SIZE[difficulty]]
    const arena = bossArena(level)
    const { cells, open, dots, reach, bossCells, safe, doors } = arena
    const spawn = level.playerSpawns[0]
    const escapes = breathEscapes(level)
    // Stage 5 on the same size of map, which this one outdoes.
    const lair = bossArena(parseLevel(stage5, difficulty))

    it("is the Final boss", () => {
        expect(level.name).toBe("Final boss")
        expect(level.parTime).toBe(map.parTime)
    })

    // Harder than stage 5's defaults on every count, but its wind-up stays
    // at least 0.75 s, time to see it coming and step aside.
    it("has a tougher boss that breathes more often and farther", () => {
        const { boss } = createGameState(level)
        expect(boss!.speed).toBe(BOSS_SPEED)
        expect(boss!.health).toBe(18)
        expect(boss!.maxHealth).toBe(18)
        expect(boss!.health).toBeGreaterThan(BOSS_HEALTH)
        const { every, windUp, range, damage } = level.boss!.breath!
        expect(every).toBeLessThan(BOSS_BREATH_EVERY)
        expect(range).toBeGreaterThan(BOSS_BREATH_RANGE)
        expect(damage).toBeGreaterThan(BOSS_BREATH_DAMAGE)
        expect(windUp).toBeLessThanOrEqual(BOSS_BREATH_WIND_UP)
        expect(windUp).toBeGreaterThanOrEqual(0.75)
        expect(boss!.breath).toMatchObject({
            every: every! * TICK_RATE,
            windUp: windUp! * TICK_RATE,
            range,
            damage,
        })
    })

    it("lists Splitters among its enemies, at the default speed", () => {
        expect(level.enemies.map((e) => e.ai)).toEqual(map.enemies)
        // Easy's three include Splitters, for ammunition.
        expect(map.enemies.slice(0, 3)).toContain(AiType.splitter)
        for (const enemy of level.enemies) {
            expect(enemy.speed).toBeUndefined()
        }
        expect(level.playerSpeed).toBeUndefined()
    })

    it("regrows its dots and has its Splitters drop them", () => {
        expect(level.rules.regrowDots).toEqual({ seconds: 8 })
        expect(level.rules.splitterDrops).toBe(true)
        const game = createGameState(level)
        expect(game.regrow?.seconds).toBe(8)
        expect(game.splitterDrops).toBe(true)
    })

    it("is its map's size, with no tunnels, ice or fog", () => {
        expect(level.width).toBe(map.width)
        expect(level.height).toBe(map.height)
        const edges = [
            ...cells[0],
            ...cells[level.height - 1],
            ...cells.map((row) => row[0]),
            ...cells.map((row) => row[level.width - 1]),
        ]
        expect(edges.every((c) => c === Cell.wall)).toBe(true)
        expect(level.ice.flat().some(Boolean)).toBe(false)
        expect(level.rules.fog).toBeUndefined()
    })

    it("has walls mirrored left to right", () => {
        const walls = cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
    })

    it("has no dead ends", () => {
        const ends = open.filter((p) => openNeighbours(cells, p).length < 2)
        expect(ends).toEqual([])
    })

    // 18 health is a multiple of 6, so every character needs the same 450
    // energy (cost / 25 damage a breath: 1, 2 or 3); the dots alone cover
    // that twice over.
    it("has dots enough for every character to bring the boss down", () => {
        for (const animal of ANIMAL_IDS) {
            const { cost } = BREATHS[animal]
            const needed = Math.ceil(18 / bossDamage(cost)) * cost
            expect(needed).toBe(450)
            expect(dots.length * DOT_ENERGY).toBeGreaterThanOrEqual(needed * 2)
        }
    })

    it("gives the boss a bigger arena than stage 5's, with fewer safe cells", () => {
        expect(reach.length).toBeGreaterThan(lair.reach.length)
        expect(safe.length).toBeLessThan(lair.safe.length)
        // The corridor runs down the sides and along the bottom, joined up,
        // but not over the top: the arena's top is the map's edge.
        expect(safeAround(arena)).toEqual({
            sides: [Direction.left, Direction.down, Direction.right],
            joined: true,
        })
        // Outside it only the spawns hold a dot (every "E" and the "Q").
        const spawns = new Set(
            [...level.enemies.map((e) => e.pos), ...level.playerSpawns].map(
                cellKey
            )
        )
        const outside = dots.filter((p) => !bossCells.has(cellKey(p)))
        expect(outside.every((p) => spawns.has(cellKey(p)))).toBe(true)
        // The players start where the boss can't go.
        for (const p of level.playerSpawns) {
            expect(bossCells.has(cellKey(p))).toBe(false)
        }
    })

    it("has doors into the arena", () => {
        expect(doors).toHaveLength(map.doors)
    })

    // Its wind-up is 0.8 s (48 ticks); a player moves 4 cells a second, so
    // 2 moves take 30. Every lane is at least 3 wide, so there is always a
    // cell beside the boss's breath. Never through the boss's body.
    it("lets a player get out of any breath in two moves", () => {
        expect(Math.max(...escapes.worst.values())).toBeLessThanOrEqual(2)
        for (const door of doors) {
            expect(escapes.struck.has(cellKey(door))).toBe(true)
        }
    })

    it("starts the players out of every line the boss breathes along", () => {
        for (const p of level.playerSpawns) {
            expect(escapes.struck.has(cellKey(p))).toBe(false)
        }
    })

    it("starts the boss and the enemies far from the player", () => {
        const dist = distanceMap(cells, spawn)
        for (const { pos, ai } of level.enemies) {
            // A phantom goes straight through walls.
            const far =
                ai === AiType.phantom
                    ? Math.abs(pos.x - spawn.x) + Math.abs(pos.y - spawn.y)
                    : dist[pos.y][pos.x]
            expect(far).toBeGreaterThanOrEqual(15)
        }
        const boss = footprint(level.boss!.pos).map((c) => dist[c.y][c.x])
        expect(Math.min(...boss)).toBeGreaterThanOrEqual(15)
    })
})

// Played through the real step, as on stage 5 (KDA-286): a player standing
// on a struck cell or just setting off into one as the wind-up starts,
// with no time to react, finishes its glide and takes a shortest way out
// inside the shorter wind-up.
describe(
    "stage 10's breath, dodged as its wind-up starts",
    { timeout: 30_000 },
    () => {
        it.each(DODGE_RUNS)(
            "on the $size map as the $animal",
            ({ difficulty, animal }) => {
                const { played, hits } = dodgeHits(stage[difficulty], animal)
                expect(played).toBeGreaterThan(1000)
                expect(hits).toEqual([])
            }
        )
    }
)
