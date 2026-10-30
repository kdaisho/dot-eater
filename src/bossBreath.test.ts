import { describe, expect, it } from "vite-plus/test"
import { createBoss, damageBoss } from "./boss"
import {
    atRest,
    BOSS_BREATH,
    bossBreathCells,
    bossBreathTarget,
    bossLooks,
    bossWarning,
    createBossBreath,
    inLine,
} from "./bossBreath"
import { inPlay, type TileEffect } from "./breath"
import {
    BOSS_BREATH_DAMAGE,
    BOSS_BREATH_EVERY,
    BOSS_BREATH_RANGE,
    BOSS_BREATH_WIND_UP,
    Cell,
    MAX_HEALTH,
    PLAYER_RESPAWN_DELAY,
    TICK_RATE,
} from "./constants"
import type { GameEvent, GameEventType } from "./events"
import {
    bringBack,
    createGameState,
    drawnPos,
    HURT_INVULNERABLE_TICKS,
    IDLE,
    step,
    takeOut,
    type GameState,
    type Mode,
    type Outcome,
} from "./game"
import { parseLevel, type BossBreathData } from "./level"
import { stage5 } from "./levels/stage5"
import {
    fixedRandom,
    makeEnemy,
    makeState,
    textMap,
    type MapLiteral,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"
import { CATCH_DOTS } from "./versus"

// The boss's breath (bossBreath.ts): where it reaches, who is in line,
// its cadence through step(), and what it does to the players it strikes.

const TICK = 1 / TICK_RATE
// The default tuning, in ticks.
const EVERY = BOSS_BREATH_EVERY * TICK_RATE
const WIND_UP = Math.round(BOSS_BREATH_WIND_UP * TICK_RATE)

const right = vec2(1, 0)
const left = vec2(-1, 0)
const up = vec2(0, -1)
const down = vec2(0, 1)

// A 10x5 room. The dot in the wall pocket (bottom row) is never eaten, so
// the game isn't won by clearing the dots.
const room = textMap([
    "############",
    "#          #",
    "#          #",
    "#          #",
    "#          #",
    "#          #",
    "############",
    "#.##########",
]).map

// A game on `map` with players on `players` (full health unless `health`
// says otherwise) and a boss on `boss` that doesn't move (unless `speed`
// says so) and is ready to breathe (unless `ready` is false, leaving it its
// grace period), tuned by `breath`.
function game(
    players: Vec2 | readonly Vec2[],
    boss: Vec2,
    {
        map = room,
        mode = "solo",
        health = MAX_HEALTH,
        ready = true,
        speed,
        breath,
    }: {
        map?: MapLiteral
        mode?: Mode
        health?: number
        ready?: boolean
        speed?: number
        breath?: BossBreathData
    } = {}
): GameState {
    const b = createBoss(boss, speed ?? 0.001, breath)
    if (speed !== undefined) b.moveProgress = 1
    if (ready) b.breath.cooldown = 0
    const starts = "x" in players ? [players] : players
    return makeState(map, starts, [], { boss: b, health, mode })
}

// One tick with every player idle.
function tick(state: GameState): Outcome | null {
    return step(
        state,
        TICK,
        state.players.map(() => IDLE),
        fixedRandom(0)
    )
}

// The events of `type` in the latest tick.
function eventsOf<T extends GameEventType>(
    state: GameState,
    type: T
): Extract<GameEvent, { type: T }>[] {
    return state.events.filter(
        (e): e is Extract<GameEvent, { type: T }> => e.type === type
    )
}

// Tick until an event of `type` happens; returns how many ticks that took.
// Fails after `max` ticks.
function ticksUntil(
    state: GameState,
    type: GameEventType,
    max = EVERY * 3
): number {
    for (let i = 1; i <= max; i++) {
        tick(state)
        if (eventsOf(state, type).length > 0) return i
    }
    throw new Error(`No ${type} within ${max} ticks`)
}

// Tick `n` times, failing on any event of `type`.
function ticksWithout(state: GameState, type: GameEventType, n: number) {
    for (let i = 0; i < n; i++) {
        tick(state)
        expect(eventsOf(state, type), `tick ${i + 1}`).toEqual([])
    }
}

// Tick to the one before the breath of a wind-up starting now (the boss is
// ready and a player in line), so the next tick breathes.
function windUpToTheBrink(state: GameState) {
    expect(ticksUntil(state, "bossWindUp", 1)).toBe(1)
    for (let i = 0; i < WIND_UP - 1; i++) tick(state)
    expect(state.boss!.breath.windingUp).toBe(1)
}

// Put player `i` on `cell` at rest.
function place(state: GameState, cell: Vec2, i = 0) {
    const c = state.players[i].character
    c.pos = vec2(cell.x, cell.y)
    c.lastPos = vec2(cell.x, cell.y)
    c.moveProgress = 1
}

const opensWall: TileEffect = { name: "test.open", opensWall: true }
const blocks: TileEffect = { name: "test.block", blocksEnemies: true }

// Open the wall at `cell` as the Boar's breath does.
function openWall(state: GameState, cell: Vec2) {
    expect(state.cells[cell.y][cell.x]).toBe(Cell.wall)
    state.cells[cell.y][cell.x] = Cell.none
    state.tiles.push({ pos: cell, effect: opensWall, left: 100 })
}

// `room` with a wall at (5, 2).
const pillar = textMap([
    "############",
    "#          #",
    "#    #     #",
    "#          #",
    "#          #",
    "#          #",
    "############",
    "#.##########",
]).map

describe("createBossBreath", () => {
    it("takes the defaults, waiting out its first `every` (the grace)", () => {
        expect(createBossBreath()).toEqual({
            every: EVERY,
            windUp: WIND_UP,
            range: BOSS_BREATH_RANGE,
            damage: BOSS_BREATH_DAMAGE,
            cooldown: EVERY,
            windingUp: 0,
            facing: down,
        })
    })

    it("winds up for 0.9 s by default, long enough to step out of a door", () => {
        // PM call: two moves out of a stage 5 door, and time to react.
        expect(createBossBreath().windUp).toBe(0.9 * TICK_RATE)
    })

    it("takes the level's tuning, seconds counted in ticks", () => {
        expect(
            createBossBreath({ every: 2, windUp: 0.5, range: 3, damage: 50 })
        ).toMatchObject({
            every: 2 * TICK_RATE,
            windUp: 0.5 * TICK_RATE,
            range: 3,
            damage: 50,
            cooldown: 2 * TICK_RATE,
        })
        expect(createBossBreath({ range: 9 })).toMatchObject({
            every: EVERY,
            windUp: WIND_UP,
            range: 9,
            damage: BOSS_BREATH_DAMAGE,
        })
    })

    it("is built from the level's boss settings", () => {
        const level = parseLevel({
            name: "lair",
            parTime: 60,
            map: ["#######", "#P.B..#", "#.....#", "#######"],
            enemies: [],
            boss: { breath: { every: 3, damage: 60 } },
        })
        expect(createGameState(level).boss!.breath).toMatchObject({
            every: 3 * TICK_RATE,
            cooldown: 3 * TICK_RATE,
            damage: 60,
            range: BOSS_BREATH_RANGE,
        })
    })

    it("gives stage 5's boss the gentle defaults", () => {
        const state = createGameState(parseLevel(stage5))
        expect(state.boss!.breath).toEqual(createBossBreath())
    })
})

describe("bossBreathCells", () => {
    it("is two cells wide and `range` long, nearest first", () => {
        const state = game(vec2(9, 4), vec2(1, 1))
        expect(bossBreathCells(state, vec2(1, 1), right, 6)).toEqual([
            vec2(3, 1),
            vec2(3, 2),
            vec2(4, 1),
            vec2(4, 2),
            vec2(5, 1),
            vec2(5, 2),
            vec2(6, 1),
            vec2(6, 2),
            vec2(7, 1),
            vec2(7, 2),
            vec2(8, 1),
            vec2(8, 2),
        ])
    })

    it("goes the footprint's width across each facing", () => {
        // The footprint is (5, 2) to (6, 3), in the middle of the room.
        const state = game(vec2(1, 5), vec2(5, 2))
        const at = vec2(5, 2)
        expect(bossBreathCells(state, at, right, 6)).toEqual([
            vec2(7, 2),
            vec2(7, 3),
            vec2(8, 2),
            vec2(8, 3),
            vec2(9, 2),
            vec2(9, 3),
            vec2(10, 2),
            vec2(10, 3),
        ])
        expect(bossBreathCells(state, at, left, 2)).toEqual([
            vec2(4, 2),
            vec2(4, 3),
            vec2(3, 2),
            vec2(3, 3),
        ])
        expect(bossBreathCells(state, at, up, 6)).toEqual([
            vec2(5, 1),
            vec2(6, 1),
        ])
        expect(bossBreathCells(state, at, down, 6)).toEqual([
            vec2(5, 4),
            vec2(6, 4),
            vec2(5, 5),
            vec2(6, 5),
        ])
    })

    it("stops each lane at its own first wall", () => {
        const state = game(vec2(9, 4), vec2(1, 1), { map: pillar })
        expect(bossBreathCells(state, vec2(1, 1), right, 6)).toEqual([
            vec2(3, 1),
            vec2(3, 2),
            vec2(4, 1),
            vec2(4, 2),
            vec2(5, 1),
            vec2(6, 1),
            vec2(7, 1),
            vec2(8, 1),
        ])
    })

    it("stops at a Boar-opened wall, as at the wall it will be again", () => {
        const state = game(vec2(9, 4), vec2(1, 1), { map: pillar })
        openWall(state, vec2(5, 2))
        expect(bossBreathCells(state, vec2(1, 1), right, 3)).toEqual([
            vec2(3, 1),
            vec2(3, 2),
            vec2(4, 1),
            vec2(4, 2),
            vec2(5, 1),
        ])
    })

    it("isn't stopped by a tile that blocks enemies", () => {
        const state = game(vec2(9, 4), vec2(1, 1))
        state.tiles.push({ pos: vec2(4, 1), effect: blocks, left: 5 })
        expect(bossBreathCells(state, vec2(1, 1), right, 3)).toEqual([
            vec2(3, 1),
            vec2(3, 2),
            vec2(4, 1),
            vec2(4, 2),
            vec2(5, 1),
            vec2(5, 2),
        ])
    })
})

describe("inLine", () => {
    // The boss's footprint is (5, 2) to (6, 3) unless a test says otherwise.
    function lineFrom(cell: Vec2, state = game(vec2(1, 5), vec2(5, 2))) {
        return inLine(state, state.boss!, cell)
    }

    it("is in line sharing a row or a column, with the way and distance", () => {
        expect(lineFrom(vec2(8, 3))).toEqual({ facing: right, distance: 2 })
        expect(lineFrom(vec2(2, 2))).toEqual({ facing: left, distance: 3 })
        expect(lineFrom(vec2(6, 1))).toEqual({ facing: up, distance: 1 })
        expect(lineFrom(vec2(5, 5))).toEqual({ facing: down, distance: 2 })
    })

    it("isn't in line off its rows and columns, or on its footprint", () => {
        for (const cell of [
            vec2(4, 1),
            vec2(7, 4),
            vec2(1, 5),
            vec2(5, 2),
            vec2(6, 3),
        ]) {
            expect(lineFrom(cell), `${cell.x},${cell.y}`).toBeNull()
        }
    })

    it("reaches `range` cells from the footprint's edge, not one more", () => {
        const state = game(vec2(1, 5), vec2(1, 1))
        expect(lineFrom(vec2(8, 1), state)).toEqual({
            facing: right,
            distance: BOSS_BREATH_RANGE,
        })
        expect(lineFrom(vec2(9, 2), state)).toBeNull()
        const short = game(vec2(1, 5), vec2(1, 1), { breath: { range: 3 } })
        expect(lineFrom(vec2(5, 1), short)).not.toBeNull()
        expect(lineFrom(vec2(6, 1), short)).toBeNull()
    })

    it("is blocked by a wall between, lane by lane", () => {
        const state = game(vec2(1, 5), vec2(1, 1), { map: pillar })
        expect(lineFrom(vec2(7, 2), state)).toBeNull()
        expect(lineFrom(vec2(4, 2), state)).not.toBeNull()
        expect(lineFrom(vec2(7, 1), state)).not.toBeNull()
    })

    it("is blocked by a Boar-opened wall, and can't see into one", () => {
        const state = game(vec2(1, 5), vec2(1, 1), { map: pillar })
        openWall(state, vec2(5, 2))
        expect(lineFrom(vec2(7, 2), state)).toBeNull()
        expect(lineFrom(vec2(5, 2), state)).toBeNull()
    })

    it("is blocked by a tile that blocks enemies between, not on the player", () => {
        const state = game(vec2(1, 5), vec2(1, 1))
        state.tiles.push({ pos: vec2(4, 1), effect: blocks, left: 5 })
        expect(lineFrom(vec2(6, 1), state)).toBeNull()
        expect(lineFrom(vec2(4, 1), state)).toEqual({
            facing: right,
            distance: 2,
        })
        expect(lineFrom(vec2(6, 2), state)).not.toBeNull()
    })
})

describe("bossBreathTarget", () => {
    it("targets the nearest player in line", () => {
        const state = game([vec2(10, 2), vec2(3, 3)], vec2(5, 2), {
            mode: "coop",
        })
        expect(bossBreathTarget(state)).toEqual({ player: 1, facing: left })
    })

    it("targets player 1 on a tie", () => {
        const state = game([vec2(3, 3), vec2(8, 2)], vec2(5, 2), {
            mode: "coop",
        })
        expect(bossBreathTarget(state)).toEqual({ player: 0, facing: left })
        const swapped = game([vec2(8, 2), vec2(3, 3)], vec2(5, 2), {
            mode: "coop",
        })
        expect(bossBreathTarget(swapped)).toEqual({ player: 0, facing: right })
    })

    it("ignores a player out of play, and has none with nobody in line", () => {
        const state = game([vec2(3, 3), vec2(8, 2)], vec2(5, 2), {
            mode: "versus",
        })
        takeOut(state.players[0], PLAYER_RESPAWN_DELAY)
        expect(bossBreathTarget(state)).toEqual({ player: 1, facing: right })
        place(state, vec2(8, 5), 1)
        expect(bossBreathTarget(state)).toBeNull()
    })

    it("has none for a defeated boss", () => {
        const state = game(vec2(8, 2), vec2(5, 2))
        state.boss!.defeated = true
        expect(bossBreathTarget(state)).toBeNull()
    })
})

describe("the boss's breath cadence", () => {
    it("waits out the grace period, then winds up and breathes", () => {
        const state = game(vec2(6, 1), vec2(1, 1), { ready: false })
        ticksWithout(state, "bossWindUp", EVERY - 1)
        tick(state)
        expect(eventsOf(state, "bossWindUp")).toEqual([
            { type: "bossWindUp", at: vec2(1, 1), facing: right },
        ])
        ticksWithout(state, "bossBreathed", WIND_UP - 1)
        tick(state)
        expect(eventsOf(state, "bossBreathed")).toEqual([
            {
                type: "bossBreathed",
                at: vec2(1, 1),
                facing: right,
                cells: bossBreathCells(state, vec2(1, 1), right, 6),
            },
        ])
    })

    it("waits `every` after a breath before the next wind-up", () => {
        const state = game(vec2(6, 1), vec2(1, 1))
        ticksUntil(state, "bossBreathed")
        // The player was knocked on to (7, 1), still in line.
        expect(state.players[0].character.pos).toEqual(vec2(7, 1))
        expect(ticksUntil(state, "bossWindUp")).toBe(EVERY)
        expect(ticksUntil(state, "bossBreathed")).toBe(WIND_UP)
        expect(state.players[0].health).toBe(
            MAX_HEALTH - 2 * BOSS_BREATH_DAMAGE
        )
    })

    it("takes its cadence from its tuning", () => {
        const state = game(vec2(6, 1), vec2(1, 1), {
            ready: false,
            breath: { every: 1.5, windUp: 0.25 },
        })
        expect(ticksUntil(state, "bossWindUp")).toBe(1.5 * TICK_RATE)
        expect(ticksUntil(state, "bossBreathed")).toBe(0.25 * TICK_RATE)
        expect(ticksUntil(state, "bossWindUp")).toBe(1.5 * TICK_RATE)
    })

    it("doesn't breathe with nobody in line, but stays ready for one", () => {
        const state = game(vec2(8, 4), vec2(1, 1))
        ticksWithout(state, "bossWindUp", EVERY * 2)
        place(state, vec2(8, 2))
        tick(state)
        expect(eventsOf(state, "bossWindUp")).toEqual([
            { type: "bossWindUp", at: vec2(1, 1), facing: right },
        ])
    })

    it("faces the player it targets", () => {
        const state = game([vec2(5, 5), vec2(9, 3)], vec2(5, 2), {
            mode: "coop",
        })
        tick(state)
        expect(eventsOf(state, "bossWindUp")[0].facing).toEqual(down)
        expect(state.boss!.breath.facing).toEqual(down)
    })

    it("holds still while it winds up, then moves again", () => {
        const state = game(vec2(8, 1), vec2(1, 1), { speed: 1.5 })
        tick(state)
        expect(eventsOf(state, "bossWindUp")).toHaveLength(1)
        for (let i = 0; i < WIND_UP; i++) {
            expect(state.boss!.pos).toEqual(vec2(1, 1))
            tick(state)
        }
        // It breathes, and is free to move on that tick.
        expect(eventsOf(state, "bossBreathed")).toHaveLength(1)
        expect(state.boss!.pos).toEqual(vec2(2, 1))
    })

    // Regression (PR #74 review): it wound up mid-glide, from the cell it
    // was heading for, so with a short wind-up it breathed from a cell it
    // wasn't drawn on yet.
    it("waits for its glide to end, so it breathes from where it is drawn", () => {
        const state = game(vec2(8, 1), vec2(2, 1), {
            speed: 1.5,
            breath: { windUp: 0.25 },
        })
        const boss = state.boss!
        const cols = state.cells[0].length
        const rows = state.cells.length
        // Just setting off from (1, 1) to (2, 1): 0.9 cells to go at 1.5
        // cells/s is 36 ticks.
        boss.lastPos = vec2(1, 1)
        boss.moveProgress = 0.1
        expect(atRest(boss)).toBe(false)
        expect(ticksUntil(state, "bossWindUp")).toBe(36)
        expect(atRest(boss)).toBe(true)
        expect(drawnPos(boss, cols, rows)).toEqual(vec2(2, 1))
        expect(ticksUntil(state, "bossBreathed")).toBe(0.25 * TICK_RATE)
        expect(eventsOf(state, "bossBreathed")[0].at).toEqual(vec2(2, 1))
    })

    it("is at rest on its cell once its glide is done, or with none to do", () => {
        const boss = createBoss(vec2(3, 1))
        // At its spawn, before its first move: nothing to glide.
        expect(boss.moveProgress).toBe(0)
        expect(atRest(boss)).toBe(true)
        boss.lastPos = vec2(2, 1)
        expect(atRest(boss)).toBe(false)
        boss.moveProgress = 1
        expect(atRest(boss)).toBe(true)
    })

    it("breathes whoever is in line by then: a player can step aside", () => {
        const state = game(vec2(6, 1), vec2(1, 1))
        windUpToTheBrink(state)
        place(state, vec2(6, 4))
        tick(state)
        expect(eventsOf(state, "bossBreathed")).toHaveLength(1)
        expect(eventsOf(state, "hurt")).toEqual([])
        expect(state.players[0].health).toBe(MAX_HEALTH)
        // And waits `every` again.
        expect(state.boss!.breath.cooldown).toBe(EVERY)
    })

    it("never breathes once defeated", () => {
        const state = game(vec2(6, 1), vec2(1, 1))
        state.boss!.defeated = true
        ticksWithout(state, "bossWindUp", EVERY * 2)
        expect(state.players[0].health).toBe(MAX_HEALTH)
    })

    it("doesn't breathe when defeated during its wind-up", () => {
        const state = game(vec2(6, 1), vec2(1, 1))
        tick(state)
        expect(eventsOf(state, "bossWindUp")).toHaveLength(1)
        damageBoss(state, state.boss!.maxHealth)
        expect(state.boss!.defeated).toBe(true)
        ticksWithout(state, "bossBreathed", WIND_UP * 2)
        expect(bossWarning(state)).toBeNull()
        expect(bossLooks(state)).toEqual([])
    })

    it("doesn't wind up with nobody in play, but its cooldown runs", () => {
        const state = game([vec2(6, 1), vec2(6, 4)], vec2(1, 1), {
            mode: "versus",
            ready: false,
        })
        for (const p of state.players) takeOut(p, 100)
        ticksWithout(state, "bossWindUp", EVERY)
        expect(state.boss!.breath.cooldown).toBe(0)
        // Player 1 is back on its spawn, in line: at once.
        bringBack(state, state.players[0])
        tick(state)
        expect(eventsOf(state, "bossWindUp")).toHaveLength(1)
    })

    it("calls off a wind-up once nobody is in play", () => {
        const state = game([vec2(6, 1), vec2(6, 4)], vec2(1, 1), {
            mode: "versus",
        })
        tick(state)
        expect(eventsOf(state, "bossWindUp")).toHaveLength(1)
        for (const p of state.players) takeOut(p, 100)
        ticksWithout(state, "bossBreathed", WIND_UP * 2)
        expect(state.boss!.breath.windingUp).toBe(0)
        expect(state.boss!.breath.cooldown).toBe(0)
    })
})

describe("the boss's breath striking", () => {
    it("hurts a player on a struck cell through hurtPlayer", () => {
        const state = game(vec2(6, 2), vec2(1, 1))
        windUpToTheBrink(state)
        expect(tick(state)).toBeNull()
        const player = state.players[0]
        expect(player.health).toBe(MAX_HEALTH - BOSS_BREATH_DAMAGE)
        // Knocked away from the boss, and invulnerable for a while.
        expect(player.character.pos).toEqual(vec2(7, 2))
        expect(player.invulnerableFor).toBe(HURT_INVULNERABLE_TICKS)
        // The breath first, then the hurt it did.
        expect(
            state.events
                .filter((e) => e.type === "bossBreathed" || e.type === "hurt")
                .map((e) => e.type)
        ).toEqual(["bossBreathed", "hurt"])
        expect(eventsOf(state, "hurt")).toEqual([
            {
                type: "hurt",
                player: 0,
                at: vec2(6, 2),
                damage: BOSS_BREATH_DAMAGE,
            },
        ])
    })

    it("does the level's damage", () => {
        const state = game(vec2(6, 2), vec2(1, 1), { breath: { damage: 55 } })
        ticksUntil(state, "bossBreathed")
        expect(state.players[0].health).toBe(MAX_HEALTH - 55)
    })

    it("leaves an invulnerable player alone", () => {
        const state = game(vec2(6, 2), vec2(1, 1))
        windUpToTheBrink(state)
        state.players[0].invulnerableFor = 10
        tick(state)
        expect(eventsOf(state, "bossBreathed")).toHaveLength(1)
        expect(eventsOf(state, "hurt")).toEqual([])
        expect(state.players[0].health).toBe(MAX_HEALTH)
    })

    it("hurts a player drawn within catching distance of a struck cell", () => {
        // Gliding down out of the lane, from (6, 2) to (6, 3).
        const glidingOut = (progress: number) => {
            const state = game(vec2(6, 2), vec2(1, 1))
            windUpToTheBrink(state)
            const c = state.players[0].character
            c.lastPos = vec2(6, 2)
            c.pos = vec2(6, 3)
            c.moveProgress = progress
            tick(state)
            expect(eventsOf(state, "bossBreathed")).toHaveLength(1)
            return state.players[0].health
        }
        // The tick's glide takes it on by 4/60 of a cell first.
        expect(glidingOut(0.3)).toBe(MAX_HEALTH - BOSS_BREATH_DAMAGE)
        expect(glidingOut(0.6)).toBe(MAX_HEALTH)
    })

    it("hurts both players it strikes, player 1 first", () => {
        const state = game([vec2(8, 1), vec2(4, 2)], vec2(1, 1), {
            mode: "coop",
        })
        ticksUntil(state, "bossBreathed")
        expect(eventsOf(state, "hurt").map((e) => e.player)).toEqual([0, 1])
        for (const p of state.players) {
            expect(p.health).toBe(MAX_HEALTH - BOSS_BREATH_DAMAGE)
        }
    })

    it("never affects enemies", () => {
        const enemy = makeEnemy(4, 1)
        enemy.speed = 0.001
        enemy.moveProgress = 0
        const b = createBoss(vec2(1, 1), 0.001)
        b.breath.cooldown = 0
        const state = makeState(room, vec2(6, 2), [enemy], {
            boss: b,
            health: MAX_HEALTH,
        })
        ticksUntil(state, "bossBreathed")
        expect(eventsOf(state, "bossBreathed")[0].cells).toContainEqual(
            vec2(4, 1)
        )
        expect(inPlay(enemy)).toBe(true)
        expect(enemy.pos).toEqual(vec2(4, 1))
        expect(enemy.statuses).toEqual([])
        expect(eventsOf(state, "enemyDefeated")).toEqual([])
    })

    it("shows itself on its cells for a moment", () => {
        const state = game(vec2(6, 1), vec2(1, 1))
        ticksUntil(state, "bossBreathed")
        const cells = eventsOf(state, "bossBreathed")[0].cells
        expect(state.tiles.map((t) => t.pos)).toEqual(cells)
        expect(state.tiles.every((t) => t.effect === BOSS_BREATH.blast)).toBe(
            true
        )
        for (let i = 0; i < BOSS_BREATH.shown * TICK_RATE; i++) tick(state)
        expect(state.tiles).toEqual([])
    })

    it("knocks a solo player out of its last health: the game is lost", () => {
        const state = game(vec2(6, 2), vec2(1, 1), {
            health: BOSS_BREATH_DAMAGE,
        })
        windUpToTheBrink(state)
        expect(tick(state)).toBe("dead")
        expect(eventsOf(state, "playerCaught")).toHaveLength(1)
    })

    it("knocks a versus player out by the versus rules", () => {
        const state = game([vec2(6, 2), vec2(8, 4)], vec2(1, 1), {
            mode: "versus",
            health: BOSS_BREATH_DAMAGE,
        })
        const player = state.players[0]
        player.dots = 12
        windUpToTheBrink(state)
        expect(tick(state)).toBeNull()
        expect(eventsOf(state, "playerCaught")).toEqual([
            {
                type: "playerCaught",
                player: 0,
                at: vec2(6, 2),
                outForGood: false,
            },
        ])
        expect(player.out).toBe(true)
        expect(player.respawnIn).toBe(PLAYER_RESPAWN_DELAY)
        expect(player.dots).toBe(12 - CATCH_DOTS)
        expect(state.players[1].out).toBe(false)
    })
})

describe("the boss's breath looks", () => {
    it("tints the cells it will strike while it winds up", () => {
        const state = game(vec2(6, 2), vec2(1, 1))
        expect(bossWarning(state)).toBeNull()
        tick(state)
        expect(bossWarning(state)).toEqual({
            cells: bossBreathCells(state, vec2(1, 1), right, 6),
            color: BOSS_BREATH.warning,
        })
        // Always what it would strike now: a wall in the way cuts a lane.
        state.cells[1][5] = Cell.wall
        expect(bossWarning(state)!.cells).toEqual(
            bossBreathCells(state, vec2(1, 1), right, 6)
        )
        expect(bossWarning(state)!.cells).not.toContainEqual(vec2(5, 1))
        for (let i = 0; i < WIND_UP; i++) tick(state)
        expect(eventsOf(state, "bossBreathed")).toHaveLength(1)
        expect(bossWarning(state)).toBeNull()
    })

    it("glows while it winds up, stronger towards the breath", () => {
        const state = game(vec2(6, 2), vec2(1, 1))
        expect(bossLooks(state)).toEqual([])
        const alphas: number[] = []
        for (let i = 0; i <= WIND_UP; i++) {
            tick(state)
            const looks = bossLooks(state)
            if (looks.length === 0) break
            expect(looks).toHaveLength(1)
            const match = /rgba\(234, 88, 12, ([\d.]+)\)/.exec(looks[0].color!)
            alphas.push(Number(match![1]))
        }
        expect(alphas).toHaveLength(WIND_UP)
        expect(alphas[0]).toBeCloseTo(BOSS_BREATH.glowFrom, 1)
        for (let i = 1; i < alphas.length; i++) {
            expect(alphas[i]).toBeGreaterThan(alphas[i - 1])
        }
        expect(alphas.at(-1)!).toBeLessThanOrEqual(BOSS_BREATH.glowTo)
        expect(eventsOf(state, "bossBreathed")).toHaveLength(1)
    })
})
