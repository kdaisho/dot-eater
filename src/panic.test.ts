import { describe, expect, it } from "vite-plus/test"
import { breathe, type BreathShape } from "./breath"
import { BREATHS } from "./breaths"
import { MAX_HEALTH, TICK_RATE } from "./constants"
import { IDLE, step, takeOut, type GameState, type MoveInput } from "./game"
import {
    panic,
    panicImmune,
    panicked,
    PANIC_IMMUNITY_SECONDS,
    PANIC_SECONDS,
    playersStruck,
    tickPanics,
} from "./panic"
import { AnimalId } from "./roster"
import {
    fixedRandom,
    makeEnemy,
    makeState,
    testBreath,
    textMap,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// Panic (KDA-316): a co-op breath that strikes the other player panics it
// instead of hurting it. The mechanics are tested by panicking a player
// directly; "a friendly breath" sets it off as the game does.

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
const west = vec2(-1, 0)
const PANIC_TICKS = PANIC_SECONDS * TICK_RATE

const hold = (d: Vec2): MoveInput => ({ held: [d], pressed: none })
const breath: MoveInput = { held: [], pressed: none, breath: true }

// A one-row hall, cells (1, 1) to (11, 1), with a dot in a pocket below so
// the game isn't won.
const hall = textMap([
    "#############",
    "#           #",
    "#############",
    "#.###########",
]).map

// A co-op game in the hall: player 1 at (1, 1) and player 2 at `p2At`.
function coop(p2At = vec2(3, 1)): GameState {
    return makeState(hall, [vec2(1, 1), p2At], [], { mode: "coop" })
}

function run(state: GameState, moves: readonly MoveInput[], ticks: number) {
    for (let i = 0; i < ticks; i++) step(state, TICK, moves, fixedRandom(0))
}

describe("panic", () => {
    it(`lasts ${PANIC_SECONDS} s and counts down`, () => {
        const [p1] = coop().players
        panic(p1)
        expect(p1.panickedFor).toBe(PANIC_SECONDS)
        tickPanics([p1], 0.5)
        expect(p1.panickedFor).toBe(PANIC_SECONDS - 0.5)
        tickPanics([p1], PANIC_SECONDS)
        expect(p1.panickedFor).toBe(0)
        expect(panicked(p1)).toBe(false)
    })

    it("doesn't reset a panic in progress", () => {
        const [p1] = coop().players
        panic(p1)
        tickPanics([p1], 1)
        panic(p1)
        expect(p1.panickedFor).toBe(PANIC_SECONDS - 1)
    })

    it("leaves a player out of play alone and drops a buffered tap", () => {
        const [p1, p2] = coop().players
        p1.out = true
        panic(p1)
        expect(panicked(p1)).toBe(false)
        p2.bufferedStep = east
        panic(p2)
        expect(p2.bufferedStep).toEqual(none)
    })

    it(`is followed by ${PANIC_IMMUNITY_SECONDS} s of immunity`, () => {
        const [p1] = coop().players
        panic(p1)
        tickPanics([p1], PANIC_SECONDS)
        expect(panicImmune(p1)).toBe(true)
        panic(p1)
        expect(panicked(p1)).toBe(false)
        tickPanics([p1], PANIC_IMMUNITY_SECONDS)
        expect(panicImmune(p1)).toBe(false)
        panic(p1)
        expect(p1.panickedFor).toBe(PANIC_SECONDS)
    })

    it("ends, with its immunity, when the player is taken out", () => {
        const [p1, p2] = coop().players
        panic(p1)
        p2.panicImmuneFor = PANIC_IMMUNITY_SECONDS
        takeOut(p1)
        takeOut(p2)
        expect(panicked(p1)).toBe(false)
        expect(panicImmune(p2)).toBe(false)
    })
})

describe("playersStruck", () => {
    it("is every other player in play standing on a struck cell", () => {
        const state = coop()
        const [p1, p2] = state.players
        const cells = [vec2(1, 1), vec2(2, 1), vec2(3, 1)]
        expect(playersStruck(state, p1, cells)).toEqual([p2])
        expect(playersStruck(state, p1, [vec2(4, 1)])).toEqual([])
    })

    it("skips a player out of play, panicked or immune", () => {
        const state = coop()
        const [p1, p2] = state.players
        const cells = [vec2(3, 1)]
        p2.out = true
        expect(playersStruck(state, p1, cells)).toEqual([])
        p2.out = false
        p2.panickedFor = 1
        expect(playersStruck(state, p1, cells)).toEqual([])
        p2.panickedFor = 0
        p2.panicImmuneFor = 1
        expect(playersStruck(state, p1, cells)).toEqual([])
    })
})

describe("a friendly breath", () => {
    // A co-op game in the hall with player 1 at (1, 1), facing east, its
    // meter full, breathing `breath`, and player 2 at `p2At` with full
    // health.
    function friendly(breath = BREATHS[AnimalId.dragon], p2At = vec2(3, 1)) {
        const state = makeState(hall, [vec2(1, 1), p2At], [], {
            mode: "coop",
            breath,
            health: MAX_HEALTH,
        })
        const p1 = state.players[0]
        p1.breather.energy = p1.breather.breath.maxEnergy
        return state
    }
    const panics = (state: GameState) =>
        state.events.filter((e) => e.type === "playerPanicked")

    // Every shape, its fire hook doing nothing: player 2 on a cell it
    // covers panics, unhurt. A self breath covers only the player's own
    // cell, so player 2 stands on it there.
    it.each<[string, BreathShape, Vec2]>([
        ["line", { kind: "line", range: 3 }, vec2(3, 1)],
        ["cone", { kind: "cone", range: 3 }, vec2(3, 1)],
        ["area", { kind: "area", radius: 2 }, vec2(3, 1)],
        ["flood", { kind: "flood", reach: 2 }, vec2(3, 1)],
        ["spread", { kind: "spread", reach: 2 }, vec2(3, 1)],
        ["self", { kind: "self" }, vec2(1, 1)],
    ])("panics the other player on a %s's cells", (_, shape, p2At) => {
        const state = friendly(testBreath({ shape: () => shape }), p2At)
        const p2 = state.players[1]
        expect(breathe(state, state.players[0])).toBe(true)
        expect(panicked(p2)).toBe(true)
        expect(p2.panickedFor).toBe(PANIC_SECONDS)
        expect(p2.health).toBe(MAX_HEALTH)
        expect(p2.out).toBe(false)
        expect(panics(state)).toEqual([
            { type: "playerPanicked", player: 1, by: 0, at: p2At },
        ])
        // Reported after the breath.
        expect(state.events.map((e) => e.type)).toEqual([
            "breathed",
            "playerPanicked",
        ])
    })

    it("lasts 1.5 s", () => {
        expect(PANIC_SECONDS).toBe(1.5)
    })

    it("leaves a player off the breath's cells alone", () => {
        const state = friendly(testBreath(), vec2(5, 1))
        expect(breathe(state, state.players[0])).toBe(true)
        expect(panicked(state.players[1])).toBe(false)
        expect(panics(state)).toEqual([])
    })

    it("follows the Dragon's spread round a corner", () => {
        // From (1, 1) east at level 2, 3 steps: (2, 1), (3, 1), then round
        // the corner to (3, 2).
        const corner = textMap([
            "#######",
            "#   ###",
            "### ###",
            "### ###",
            "#######",
            "#.#####",
        ]).map
        const state = makeState(corner, [vec2(1, 1), vec2(3, 2)], [], {
            mode: "coop",
            breath: BREATHS[AnimalId.dragon],
            health: MAX_HEALTH,
        })
        const [p1, p2] = state.players
        p1.breather.energy = p1.breather.breath.maxEnergy
        expect(breathe(state, p1, 2)).toBe(true)
        expect(panicked(p2)).toBe(true)
        expect(p2.health).toBe(MAX_HEALTH)
    })

    it("counts as fired when it panics, even if its hook refused", () => {
        const state = friendly(testBreath({ fire: () => false }))
        const p1 = state.players[0]
        expect(breathe(state, p1)).toBe(true)
        expect(panicked(state.players[1])).toBe(true)
        expect(p1.breather.energy).toBe(p1.breather.breath.maxEnergy - 10)
        expect(p1.breather.cooldown).toBe(1)
    })

    it("can't panic a player again while it is immune", () => {
        const state = friendly(testBreath({ cooldown: 0 }))
        const [p1, p2] = state.players
        breathe(state, p1)
        tickPanics(state.players, PANIC_SECONDS)
        expect(panicImmune(p2)).toBe(true)
        state.events.length = 0
        expect(breathe(state, p1)).toBe(true)
        expect(panicked(p2)).toBe(false)
        expect(panics(state)).toEqual([])
        tickPanics(state.players, PANIC_IMMUNITY_SECONDS)
        breathe(state, p1)
        expect(panicked(p2)).toBe(true)
    })

    it("doesn't reset a panic in progress", () => {
        const state = friendly(testBreath({ cooldown: 0 }))
        const [p1, p2] = state.players
        breathe(state, p1)
        tickPanics(state.players, 1)
        state.events.length = 0
        breathe(state, p1)
        expect(p2.panickedFor).toBe(PANIC_SECONDS - 1)
        expect(panics(state)).toEqual([])
    })

    it("panics from the cells it strikes only, not the tiles it leaves", () => {
        // The Skunk's cloud from (1, 1) covers (1, 1) to (3, 1) and lasts
        // 5 s; player 2 walks into it from (6, 1) once it is breathed.
        const state = friendly(BREATHS[AnimalId.skunk], vec2(6, 1))
        const p2 = state.players[1]
        step(state, TICK, [breath, IDLE], fixedRandom(0))
        expect(state.tiles.some((t) => t.pos.x === 3)).toBe(true)
        run(state, [IDLE, hold(west)], TICK_RATE * 2)
        expect(p2.character.pos).toEqual(vec2(2, 1))
        expect(panicked(p2)).toBe(false)
    })

    it("from the Boar's Rush, bumps into the other player and panics it", () => {
        const state = friendly(BREATHS[AnimalId.boar], vec2(2, 1))
        const [p1, p2] = state.players
        expect(breathe(state, p1)).toBe(true)
        expect(p1.character.pos).toEqual(vec2(1, 1))
        expect(p2.character.pos).toEqual(vec2(2, 1))
        expect(panicked(p2)).toBe(true)
        expect(p2.health).toBe(MAX_HEALTH)
    })

    it("from the Rush's chain, shoves the other player and panics it", () => {
        // The Boar rams the enemy on (2, 1), which flies 2 cells, shoving
        // player 2 from (3, 1) to (5, 1).
        const enemy = makeEnemy(2, 1)
        const state = makeState(hall, [vec2(1, 1), vec2(3, 1)], [enemy], {
            mode: "coop",
            breath: BREATHS[AnimalId.boar],
            health: MAX_HEALTH,
        })
        const [p1, p2] = state.players
        p1.breather.energy = p1.breather.breath.maxEnergy
        expect(breathe(state, p1)).toBe(true)
        expect(p2.character.pos).toEqual(vec2(5, 1))
        expect(panicked(p2)).toBe(true)
        expect(p2.health).toBe(MAX_HEALTH)
        expect(panics(state)).toEqual([
            { type: "playerPanicked", player: 1, by: 0, at: vec2(5, 1) },
        ])
    })

    it("from the Rush's chain, panics the other player against a wall", () => {
        // Player 2 on (11, 1), the hall's end: the chain can't move.
        const enemy = makeEnemy(10, 1)
        const state = makeState(hall, [vec2(9, 1), vec2(11, 1)], [enemy], {
            mode: "coop",
            breath: BREATHS[AnimalId.boar],
            health: MAX_HEALTH,
        })
        const [p1, p2] = state.players
        p1.breather.energy = p1.breather.breath.maxEnergy
        expect(breathe(state, p1)).toBe(true)
        expect(p2.character.pos).toEqual(vec2(11, 1))
        expect(panicked(p2)).toBe(true)
        expect(p2.health).toBe(MAX_HEALTH)
    })

    it("lets the panicked player be hurt by an enemy as usual", () => {
        const enemy = makeEnemy(5, 1)
        enemy.speed = 0
        const state = makeState(hall, [vec2(1, 1), vec2(5, 1)], [enemy], {
            mode: "coop",
            breath: testBreath({ shape: () => ({ kind: "line", range: 5 }) }),
            health: MAX_HEALTH,
        })
        const [p1, p2] = state.players
        p1.breather.energy = p1.breather.breath.maxEnergy
        step(state, TICK, [breath, IDLE], fixedRandom(0))
        expect(panicked(p2)).toBe(true)
        expect(p2.health).toBeLessThan(MAX_HEALTH)
        expect(state.events.map((e) => e.type)).toContain("hurt")
    })

    it("leaves solo play alone", () => {
        const state = makeState(hall, vec2(1, 1), [], {
            breath: testBreath({ shape: () => ({ kind: "self" }) }),
        })
        const p1 = state.players[0]
        p1.breather.energy = p1.breather.breath.maxEnergy
        expect(breathe(state, p1)).toBe(true)
        expect(panicked(p1)).toBe(false)
        expect(panics(state)).toEqual([])
    })

    it("never panics the player breathing it", () => {
        const state = friendly(testBreath({ shape: () => ({ kind: "self" }) }))
        const p1 = state.players[0]
        breathe(state, p1)
        expect(panicked(p1)).toBe(false)
    })
})

describe("a panicked player", () => {
    function panickedP2(p2At = vec2(3, 1)) {
        const state = coop(p2At)
        panic(state.players[1])
        return state
    }

    it("doesn't move until the panic is over", () => {
        const state = panickedP2()
        const p2 = state.players[1]
        run(state, [IDLE, hold(east)], PANIC_TICKS - 1)
        expect(p2.character.pos).toEqual(vec2(3, 1))
        run(state, [IDLE, hold(east)], 1)
        expect(p2.character.pos).toEqual(vec2(4, 1))
    })

    it("ignores taps made while panicked", () => {
        const state = panickedP2()
        const p2 = state.players[1]
        step(state, TICK, [IDLE, { held: [], pressed: east }], fixedRandom(0))
        run(state, [IDLE, IDLE], PANIC_TICKS)
        expect(p2.character.pos).toEqual(vec2(3, 1))
    })

    it("finishes the glide it is in", () => {
        const state = coop()
        const p2 = state.players[1].character
        p2.lastPos = vec2(4, 1)
        p2.moveProgress = 0.5
        panic(state.players[1])
        run(state, [IDLE, hold(west)], TICK_RATE / 2)
        expect(p2.moveProgress).toBe(1)
        expect(p2.pos).toEqual(vec2(3, 1))
    })

    it("finishes its slide on ice, then stays put", () => {
        // Ice from (3, 1) to (6, 1), floor either side.
        const { map, ice } = textMap([
            "############",
            "#  ~~~~    #",
            "############",
            "#.##########",
        ])
        const state = makeState(map, [vec2(10, 1), vec2(4, 1)], [], {
            mode: "coop",
            ice,
        })
        const p2 = state.players[1]
        // Sliding east: it just slid from (3, 1) onto (4, 1).
        p2.character.lastPos = vec2(3, 1)
        panic(p2)
        run(state, [IDLE, hold(west)], PANIC_TICKS - 1)
        expect(panicked(p2)).toBe(true)
        expect(p2.character.pos).toEqual(vec2(7, 1))
    })

    it("can't breathe, and loses its charge", () => {
        const state = panickedP2()
        const p2 = state.players[1]
        p2.breather.energy = 100
        run(state, [IDLE, breath], 1)
        expect(p2.breather.energy).toBe(100)
    })

    it("can still be caught, which ends the panic", () => {
        const enemy = makeEnemy(11, 1)
        enemy.speed = 0
        const state = makeState(hall, [vec2(1, 1), vec2(11, 1)], [enemy], {
            mode: "coop",
            health: 1,
        })
        panic(state.players[1])
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(state.players[1].out).toBe(true)
        expect(panicked(state.players[1])).toBe(false)
    })
})
