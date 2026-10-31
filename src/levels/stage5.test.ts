import { describe, expect, it } from "vite-plus/test"
import { bossDamage, footprint } from "../boss"
import { BREATHS } from "../breaths"
import { AiType, BOSS_HEALTH, BOSS_SPEED, Cell, DOT_ENERGY } from "../constants"
import { MAP_SIZE } from "../difficulty"
import { createGameState } from "../game"
import { parseLevel, type Level } from "../level"
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
import { allDirections } from "../vec2"
import { EACH_MAP } from "../test/helpers"
import { stages } from "./index"
import { stage5 } from "./stage5"

// Per map size: its size, par, doors and every enemy it lists.
const MAPS = {
    medium: {
        width: 21,
        height: 19,
        parTime: 60,
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
        height: 21,
        parTime: 75,
        doors: 8,
        enemies: [
            AiType.splitter,
            AiType.chase,
            AiType.ambusher,
            AiType.splitter,
            AiType.interceptor,
            AiType.interceptor,
            AiType.splitter,
            AiType.interceptor,
        ],
    },
}

describe.each(EACH_MAP)("stage 5 (%s)", (difficulty) => {
    const level = parseLevel(stage5, difficulty)
    const map = MAPS[MAP_SIZE[difficulty]]
    const arena = bossArena(level)
    const { cells, open, dots, reach, bossCells, safe, doors } = arena
    const spawn = level.playerSpawns[0]
    const escapes = breathEscapes(level)
    // The stages (numbered from 1), at the same difficulty, that `has`.
    const stagesWith = (has: (level: Level) => boolean) =>
        stages.flatMap((stage, i) => (has(stage[difficulty]) ? [i + 1] : []))

    it("is the fifth level, the Boss lair", () => {
        expect(stages[4][difficulty]).toEqual(level)
        expect(level.name).toBe("Boss lair")
        expect(level.parTime).toBe(map.parTime)
    })

    // The boss stages are this mid-game one and the final boss, stage 10.
    it("starts a game with its boss, one of the two boss stages", () => {
        const game = createGameState(level)
        expect(game.boss?.pos).toEqual(level.boss!.pos)
        expect(game.boss?.speed).toBe(BOSS_SPEED)
        expect(stagesWith((l) => l.boss !== null)).toEqual([5, 10])
    })

    // The mid-game boss: the defaults, its breath the gentle one.
    it("has a boss at the default speed and breath", () => {
        expect(stage5.boss).toEqual({})
        expect(level.boss!.speed).toBeUndefined()
        expect(level.boss!.breath).toBeUndefined()
    })

    it("lists Splitters among its enemies, at the default speed", () => {
        expect(level.enemies.map((e) => e.ai)).toEqual(map.enemies)
        // Easy's three include two Splitters.
        expect(map.enemies.slice(0, 3)).toContain(AiType.splitter)
        for (const enemy of level.enemies) {
            expect(enemy.speed).toBeUndefined()
        }
        expect(level.playerSpeed).toBeUndefined()
    })

    it("regrows its dots after 10 s, as only the boss stages do", () => {
        expect(level.rules.regrowDots).toEqual({ seconds: 10 })
        const game = createGameState(level)
        expect(game.regrow?.seconds).toBe(10)
        expect(stagesWith((l) => l.rules.regrowDots !== undefined)).toEqual([
            5, 10,
        ])
    })

    it("has its Splitters drop dots, as only the boss stages do", () => {
        expect(level.rules.splitterDrops).toBe(true)
        expect(createGameState(level).splitterDrops).toBe(true)
        expect(stagesWith((l) => l.rules.splitterDrops === true)).toEqual([
            5, 10,
        ])
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
        const walls = level.cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
    })

    it("has no dead ends", () => {
        const ends = open.filter((p) => openNeighbours(cells, p).length < 2)
        expect(ends).toEqual([])
    })

    // Every character needs 300 energy for 12 health at the energy spent /
    // 25 a hit (taps or charges alike: KDA-289); the dots alone must cover
    // that twice over, for misses (dots growing back are the backstop, not
    // the plan).
    it("has dots enough for every character to bring the boss down", () => {
        for (const animal of ANIMAL_IDS) {
            const { cost } = BREATHS[animal]
            const taps = Math.ceil(BOSS_HEALTH / bossDamage(cost) - 1e-9)
            const needed = taps * cost
            expect(needed).toBe(300)
            expect(dots.length * DOT_ENERGY).toBeGreaterThanOrEqual(needed * 2)
        }
    })

    it("gives the boss an arena to roam that holds the dots", () => {
        expect(reach.length).toBeGreaterThanOrEqual(80)
        // Outside it only the spawns hold one (every "E" and the "Q").
        const spawns = new Set(
            [...level.enemies.map((e) => e.pos), ...level.playerSpawns].map(
                cellKey
            )
        )
        const outside = dots.filter((p) => !bossCells.has(cellKey(p)))
        expect(outside.every((p) => spawns.has(cellKey(p)))).toBe(true)
    })

    it("keeps a corridor all round the arena that the boss can't enter", () => {
        expect(safe.length).toBeGreaterThanOrEqual(60)
        expect(safeAround(arena)).toEqual({
            sides: allDirections,
            joined: true,
        })
        // The players and the enemies start there.
        for (const p of [
            ...level.playerSpawns,
            ...level.enemies.map((e) => e.pos),
        ]) {
            expect(bossCells.has(cellKey(p))).toBe(false)
        }
    })

    // Single cells through the arena's wall, every one where the boss can
    // come right up to it.
    it("has doors into the arena", () => {
        expect(doors).toHaveLength(map.doors)
        for (const door of doors) {
            expect(
                [...bossCells].filter((c) => {
                    const [x, y] = c.split(",").map(Number)
                    return Math.abs(x - door.x) + Math.abs(y - door.y) === 1
                })
            ).toHaveLength(1)
        }
    })

    // The breath winds up for 0.9 s (54 ticks). A player moves 4 cells a
    // second, a move every 15 ticks, and is clear of a struck cell 0.6 of a
    // move out of it (CATCH_DISTANCE). One gliding into a struck cell as the
    // wind-up starts has its glide to finish first (a glide can't turn
    // back): 2 moves from the cell have it clear in 40 ticks, but 3 would
    // take 55 (KDA-286). Never through the boss's body.
    it("lets a player get out of any breath in two moves", () => {
        expect(Math.max(...escapes.worst.values())).toBeLessThanOrEqual(2)
    })

    it("starts the players out of every line the boss breathes along", () => {
        for (const p of level.playerSpawns) {
            expect(escapes.struck.has(cellKey(p))).toBe(false)
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

// The escape counts above, played through the real step (KDA-286): a
// player standing on a struck cell or just setting off into one as the
// wind-up starts, with no time to react, takes a shortest way out. The
// map's old 2-tall lanes had cells 3 moves out, which a player gliding in
// left a tick too late.
describe(
    "stage 5's breath, dodged as its wind-up starts",
    { timeout: 30_000 },
    () => {
        it.each(DODGE_RUNS)(
            "on the $size map as the $animal",
            ({ difficulty, animal }) => {
                const level = parseLevel(stage5, difficulty)
                const { played, hits } = dodgeHits(level, animal)
                expect(played).toBeGreaterThan(1000)
                expect(hits).toEqual([])
            }
        )
    }
)
