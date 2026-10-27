import { describe, expect, it } from "vite-plus/test"
import { inFootprint } from "./boss"
import type { BreathDef, BreathHit } from "./breath"
import { BREATHS } from "./breaths"
import { BURNING } from "./breaths/dragon"
import {
    BOSS_DEFEAT_POINTS,
    BOSS_HEALTH,
    BOSS_SPEED,
    BOSS_TRICKLE,
    CATCH_DISTANCE,
    Cell,
    PLAYER_SPEED,
    TICK_RATE,
} from "./constants"
import {
    createGameState,
    drawnPos,
    step,
    type GameState,
    type MoveInput,
} from "./game"
import { parseLevel } from "./level"
import { ANIMAL_IDS } from "./roster"
import {
    drawn,
    fixedRandom,
    makeBoss,
    makeEnemy,
    makeState,
    OLD_LEVEL,
    testBreath,
    textMap,
    ticksUntilCaught,
    type MapLiteral,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// The boss (boss.ts) end to end through step(): breaths, moving, catching,
// lost lives and winning.

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)

type Press = { held?: Vec2; pressed?: Vec2; breath?: boolean }

function tick(state: GameState, { held, pressed, breath }: Press = {}) {
    const move: MoveInput = {
        held: held ? [held] : [],
        pressed: pressed ?? none,
        breath: breath ?? false,
    }
    return step(state, TICK, move, fixedRandom(0))
}

// An 8x4 arena. The dot in the wall pocket (bottom row) is never eaten, so
// the game isn't won by clearing the dots.
const arena = textMap([
    "##########",
    "#        #",
    "#        #",
    "#        #",
    "#        #",
    "##########",
    "#.########",
]).map

// The arena with no dots anywhere.
const bare = textMap([
    "##########",
    "#        #",
    "#        #",
    "#        #",
    "#        #",
    "##########",
]).map

// A game on `map` with the player at `player` (facing right) breathing
// `breath` with a full meter, and a boss at `boss` that won't move for a
// while unless `ready`.
function bossGame(
    player: Vec2,
    boss: Vec2,
    {
        breath = BREATHS.dragon,
        map = arena,
        lives = 1,
        ready = false,
        speed,
    }: {
        breath?: BreathDef
        map?: MapLiteral
        lives?: number
        ready?: boolean
        speed?: number
    } = {}
): GameState {
    const state = makeState(map, player, [], {
        breath,
        lives,
        boss: makeBoss(boss.x, boss.y, speed),
    })
    state.breather.energy = breath.maxEnergy
    if (!ready) state.boss!.moveProgress = 0
    return state
}

// How far the player's drawn position is from the square the boss's cell
// centres span, as collisions measure it.
function gap(state: GameState): number {
    const cols = state.cells[0].length
    const rows = state.cells.length
    const p = drawn(state, state.player)
    const b = drawnPos(state.boss!, cols, rows)
    const dx = Math.max(b.x - p.x, 0, p.x - (b.x + 1))
    const dy = Math.max(b.y - p.y, 0, p.y - (b.y + 1))
    return Math.hypot(dx, dy)
}

describe("createGameState", () => {
    const lair = parseLevel({
        name: "lair",
        parTime: 60,
        map: ["#######", "#P.B..#", "#.....#", "#######"],
        enemies: [],
        boss: { speed: 2 },
    })

    it("builds the level's boss, waiting out the grace period", () => {
        const game = createGameState(lair)
        expect(game.boss).toMatchObject({
            pos: vec2(3, 1),
            spawn: vec2(3, 1),
            speed: 2,
            health: BOSS_HEALTH,
            moveProgress: 0,
            defeated: false,
        })
        expect(game.enemies).toEqual([])
    })

    it("has no boss on a level without one", () => {
        expect(createGameState(OLD_LEVEL).boss).toBeNull()
    })
})

describe("breathing at the boss", () => {
    // Every real breath, from (1, 2) facing right, with the boss's
    // footprint (2-3, 1-2) right in front.
    const damage = { owl: 1, dragon: 2, penguin: 2, skunk: 2, boar: 3 }

    it.each(ANIMAL_IDS)("damages it by cost / 25: %s", (animal) => {
        const breath = BREATHS[animal]
        const state = bossGame(vec2(1, 2), vec2(2, 1), { breath })
        expect(tick(state, { breath: true })).toBeNull()
        const boss = state.boss!
        expect(boss.health).toBe(BOSS_HEALTH - damage[animal])
        expect(boss.flash).toBeGreaterThan(0)
        // Paid for, like any breath that fires.
        expect(state.breather.energy).toBe(breath.maxEnergy - breath.cost)
        expect(state.breather.cooldown).toBeCloseTo(breath.cooldown)
        // Not pushed (the Owl) or moved otherwise.
        expect(boss.pos).toEqual(vec2(2, 1))
    })

    it("lets the Boar's breath hit it with no wall to break", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1), { breath: BREATHS.boar })
        tick(state, { breath: true })
        expect(state.boss!.health).toBe(BOSS_HEALTH - 3)
        expect(state.tiles).toEqual([])
        // With the boss elsewhere, the same breath refuses for free.
        const missed = bossGame(vec2(1, 2), vec2(5, 1), {
            breath: BREATHS.boar,
        })
        tick(missed, { breath: true })
        expect(missed.boss!.health).toBe(BOSS_HEALTH)
        expect(missed.breather.energy).toBe(BREATHS.boar.maxEnergy)
    })

    it("damages it once however many of its cells a breath covers", () => {
        // The Skunk's 3x3 cloud covers two of its cells, (2, 1) and (2, 2).
        const state = bossGame(vec2(1, 2), vec2(2, 1), {
            breath: BREATHS.skunk,
        })
        tick(state, { breath: true })
        expect(state.boss!.health).toBe(BOSS_HEALTH - 2)
    })

    it("hits it from the player's own cell", () => {
        // The player overlapping its footprint, facing the wall: the line
        // has nowhere to go, but the boss is on the origin.
        const state = bossGame(vec2(8, 2), vec2(7, 1), {
            breath: BREATHS.owl,
            lives: 3,
        })
        tick(state, { breath: true })
        expect(state.boss!.health).toBe(BOSS_HEALTH - 1)
    })

    it("stops a line at its body", () => {
        const hits: BreathHit[] = []
        const breath = testBreath({
            shape: { kind: "line", range: 8 },
            fire(hit) {
                hits.push(hit)
            },
        })
        const beyond = makeEnemy(6, 2)
        const state = makeState(arena, { x: 1, y: 2 }, [beyond], {
            breath,
            boss: makeBoss(3, 1),
        })
        state.boss!.moveProgress = 0
        state.breather.energy = 100
        tick(state, { breath: true })
        expect(hits[0].cells).toEqual([vec2(2, 2), vec2(3, 2)])
        expect(hits[0].enemies).toEqual([])
        expect(state.boss!.health).toBeCloseTo(BOSS_HEALTH - 10 / 25)
    })

    it("can't freeze it: it moves on after the Penguin's breath", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1), {
            breath: BREATHS.penguin,
            ready: true,
        })
        tick(state, { breath: true })
        expect(state.boss!.health).toBe(BOSS_HEALTH - 2)
        // No ice under it, as under any character.
        expect(state.ice[2][2]).toBe(false)
        // It came straight on for the player and caught it.
        expect(ticksUntilCaught(state)).toBeLessThan(TICK_RATE)
    })

    it("defeats it at 0 health: +500, gone for good, harmless", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1), { ready: true })
        state.boss!.health = 2
        expect(tick(state, { breath: true })).toBeNull()
        const boss = state.boss!
        expect(boss.defeated).toBe(true)
        expect(boss.health).toBe(0)
        expect(state.score).toBe(BOSS_DEFEAT_POINTS)
        // It doesn't move, and touching where it was doesn't catch.
        state.player.pos = vec2(2, 2)
        state.player.lastPos = vec2(1, 2)
        for (let i = 0; i < TICK_RATE * 2; i++) {
            expect(tick(state)).toBeNull()
        }
        expect(boss.pos).toEqual(vec2(2, 1))
        expect(state.lives).toBe(1)
        // A breath no longer hits it.
        state.breather.cooldown = 0
        state.breather.energy = 100
        tick(state, { breath: true })
        expect(state.score).toBe(BOSS_DEFEAT_POINTS)
    })

    it("flashes for a moment after a hit", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1))
        tick(state, { breath: true })
        expect(state.boss!.flash).toBeGreaterThan(0)
        for (let i = 0; i < TICK_RATE / 5; i++) tick(state)
        expect(state.boss!.flash).toBe(0)
    })
})

describe("the boss moving", () => {
    // A 4x4 arena with a 1-wide corridor off it along row 2.
    const lair = textMap([
        "##########",
        "#    #####",
        "#        #",
        "#    #####",
        "#    #####",
        "##########",
        "#.########",
    ]).map

    it("moves at its speed", () => {
        const state = bossGame(vec2(1, 1), vec2(7, 1), { ready: true })
        for (let i = 0; i < TICK_RATE * 2; i++) tick(state)
        // Along the top: ready at once, then 1.5 cells/s, so 1 + 2 moves
        // in 2 s.
        expect(state.boss!.pos).toEqual(vec2(4, 1))
    })

    it("doesn't follow the player into a 1-wide corridor", () => {
        const state = bossGame(vec2(5, 2), vec2(1, 3), {
            map: lair,
            ready: true,
        })
        for (let i = 0; i < TICK_RATE * 5; i++) {
            expect(tick(state)).toBeNull()
        }
        // It waits at the corridor's mouth, a cell from the player.
        expect(state.boss!.pos.x).toBe(3)
        expect(gap(state)).toBeCloseTo(1)
    })

    it("keeps out of burning cells, leaving the way it came in", () => {
        // The Dragon's fire stops at its body and burns (2, 2), under it.
        const state = bossGame(vec2(1, 2), vec2(2, 1), {
            ready: true,
            lives: 3,
        })
        tick(state, { breath: true })
        expect(state.tiles.map((t) => t.effect)).toEqual([BURNING])
        const burning = vec2(2, 2)
        // Out at once (it was ready), and kept out while it burns.
        expect(state.boss!.pos).toEqual(vec2(3, 1))
        while (state.tiles.length > 0) {
            expect(tick(state)).toBeNull()
            expect(inFootprint(state.boss!.pos, burning)).toBe(false)
        }
        expect(state.lives).toBe(3)
    })
})

describe("the boss catching", () => {
    it("catches the player as its footprint touches it", () => {
        const state = bossGame(vec2(1, 1), vec2(5, 1), { ready: true })
        ticksUntilCaught(state, none, TICK_RATE * 5)
        expect(state.lives).toBe(0)
        // Within CATCH_DISTANCE of the square of its cell centres, but by
        // less than a tick's glide (1.5 / 60 cells).
        expect(gap(state)).toBeLessThanOrEqual(CATCH_DISTANCE + 1e-9)
        expect(gap(state)).toBeGreaterThan(CATCH_DISTANCE - 0.026)
    })

    it("catches the player head on where the sprites meet", () => {
        const state = bossGame(vec2(1, 2), vec2(6, 1), { ready: true })
        state.player.moveProgress = 1
        ticksUntilCaught(state, east, TICK_RATE * 5)
        const closing = (BOSS_SPEED + PLAYER_SPEED) / TICK_RATE
        expect(gap(state)).toBeLessThanOrEqual(CATCH_DISTANCE + 1e-9)
        expect(gap(state)).toBeGreaterThan(CATCH_DISTANCE - closing)
    })

    it("catches the player walking into it", () => {
        const state = bossGame(vec2(1, 2), vec2(3, 1), { speed: 0.01 })
        state.player.moveProgress = 1
        ticksUntilCaught(state, east)
        expect(state.boss!.pos).toEqual(vec2(3, 1))
        expect(gap(state)).toBeLessThanOrEqual(CATCH_DISTANCE + 1e-9)
        expect(gap(state)).toBeGreaterThan(
            CATCH_DISTANCE - PLAYER_SPEED / TICK_RATE
        )
    })

    it.each([
        ["right below it", vec2(3, 3)],
        ["right beside it", vec2(5, 2)],
        ["right beside it on the left", vec2(2, 1)],
        ["diagonally off its corner", vec2(5, 3)],
        ["diagonally off its other corner", vec2(2, 3)],
    ])("doesn't catch a player %s", (_where, player) => {
        // A boss at (3, 1) to (4, 2), too slow to move in time.
        const state = bossGame(player, vec2(3, 1), { speed: 0.01 })
        for (let i = 0; i < TICK_RATE; i++) expect(tick(state)).toBeNull()
    })

    it("doesn't catch a player walking past along its side", () => {
        const state = bossGame(vec2(1, 3), vec2(3, 1), { speed: 0.01 })
        state.player.moveProgress = 1
        for (let i = 0; i < TICK_RATE * 2; i++) {
            expect(tick(state, { held: east })).toBeNull()
        }
        expect(state.player.pos).toEqual(vec2(8, 3))
    })

    it("goes back to its spawn after a lost life, keeping its damage", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1), { lives: 3 })
        tick(state, { breath: true })
        expect(state.boss!.health).toBe(BOSS_HEALTH - 2)
        state.boss!.pos = vec2(5, 2)
        state.boss!.lastPos = vec2(5, 2)
        state.player.pos = vec2(6, 3)
        state.player.lastPos = vec2(6, 3)
        expect(tick(state)).toBeNull()
        expect(state.lives).toBe(2)
        expect(state.boss!.pos).toEqual(vec2(2, 1))
        expect(state.boss!.moveProgress).toBe(0)
        expect(state.boss!.health).toBe(BOSS_HEALTH - 2)
    })
})

describe("winning a boss level", () => {
    // The arena with a single dot at (8, 4).
    const oneDot = textMap([
        "##########",
        "#        #",
        "#        #",
        "#        #",
        "#       .#",
        "##########",
    ]).map

    it("needs the boss defeated after the last dot", () => {
        const state = bossGame(vec2(7, 4), vec2(2, 1), {
            map: oneDot,
            breath: BREATHS.owl,
        })
        state.player.moveProgress = 1
        // The last dot: no win yet, with the boss still about.
        expect(tick(state, { held: east })).toBeNull()
        expect(state.cells[4][8]).toBe(Cell.none)
        expect(tick(state)).toBeNull()
        // Its last hit wins, even if it catches the player on that tick.
        state.boss!.health = 1
        state.player.pos = vec2(3, 2)
        state.player.lastPos = vec2(3, 2)
        state.breather.cooldown = 0
        expect(tick(state, { breath: true })).toBe("won")
        expect(state.lives).toBe(1)
        expect(state.boss!.defeated).toBe(true)
    })

    it("needs the last dot eaten after the boss is defeated", () => {
        const state = bossGame(vec2(1, 2), vec2(2, 1), {
            map: oneDot,
            breath: BREATHS.owl,
        })
        state.boss!.health = 1
        expect(tick(state, { breath: true })).toBeNull()
        expect(state.boss!.defeated).toBe(true)
        state.player.pos = vec2(7, 4)
        state.player.lastPos = vec2(7, 4)
        state.player.moveProgress = 1
        expect(tick(state, { held: east })).toBe("won")
    })

    it("would be caught on that tick without the last hit", () => {
        const state = bossGame(vec2(3, 2), vec2(2, 1), { map: bare })
        expect(tick(state)).toBe("dead")
    })
})

describe("energy on a boss level", () => {
    it("refills by itself once the dots are gone, up to the meter", () => {
        const state = bossGame(vec2(1, 4), vec2(7, 1), {
            map: bare,
            speed: 0.01,
        })
        state.breather.energy = 0
        for (let i = 0; i < TICK_RATE; i++) tick(state)
        expect(state.breather.energy).toBeCloseTo(BOSS_TRICKLE)
        state.breather.energy = state.breather.breath.maxEnergy - 1
        for (let i = 0; i < TICK_RATE; i++) tick(state)
        expect(state.breather.energy).toBe(state.breather.breath.maxEnergy)
    })

    it("doesn't refill while dots are left", () => {
        const state = bossGame(vec2(1, 4), vec2(7, 1), { speed: 0.01 })
        state.breather.energy = 0
        for (let i = 0; i < TICK_RATE; i++) tick(state)
        expect(state.breather.energy).toBe(0)
    })
})
