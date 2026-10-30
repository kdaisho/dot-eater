import { describe, expect, it } from "vite-plus/test"
import {
    affordable,
    cancelCharges,
    CHARGE_SECONDS,
    chargeLevel,
    energyHud,
    MAX_CHARGE,
    type BreathHit,
} from "./breath"
import { BREATHS } from "./breaths"
import { TICK_RATE } from "./constants"
import { step, takeOut, type GameState, type MoveInput } from "./game"
import { fixedRandom, makeState, testBreath, textMap } from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"
import { stun } from "./versus"

// The charged breath (KDA-289, with the user): held, the breath charges a
// level every CHARGE_SECONDS, up to MAX_CHARGE or what the meter pays for,
// and fires at that level once let go. End to end through step(), with a
// test breath that records the level of each hit.

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
// Ticks of holding per charge level.
const LEVEL_TICKS = CHARGE_SECONDS * TICK_RATE

type Press = { held?: Vec2; breath?: boolean; breathHeld?: boolean }

function input({ held, breath, breathHeld }: Press = {}): MoveInput {
    return {
        held: held ? [held] : [],
        pressed: none,
        breath: breath ?? false,
        breathHeld: breathHeld ?? false,
    }
}

function tick(state: GameState, press: Press = {}) {
    return step(state, TICK, input(press), fixedRandom(0))
}

// A long corridor with a dot shut away below, so the game isn't won.
const hall = textMap([
    "##############",
    "#            #",
    "##############",
    "#.############",
]).map

// A game in the hall with a breath that costs 10 a level and records the
// level of every hit, and the player's meter at `energy`.
function charging(energy = 100) {
    const levels: number[] = []
    const breath = testBreath({
        fire: (hit: BreathHit) => void levels.push(hit.level),
    })
    const state = makeState(hall, { x: 1, y: 1 }, [], { breath })
    state.players[0].breather.energy = energy
    return { state, levels, breather: state.players[0].breather }
}

// Press the breath and hold it for `ticks` more ticks, without letting go.
function hold(state: GameState, ticks: number, press: Press = {}) {
    tick(state, { ...press, breath: true, breathHeld: true })
    for (let i = 0; i < ticks; i++) tick(state, { ...press, breathHeld: true })
}

describe("charging the breath", () => {
    it("fires a tap at level 1 on the tick of its press", () => {
        const { state, levels, breather } = charging()
        tick(state, { breath: true })
        expect(levels).toEqual([1])
        expect(breather.energy).toBe(90)
        expect(breather.charge).toBeNull()
    })

    it("fires a press held for a tick at level 1, on the release", () => {
        const { state, levels } = charging()
        hold(state, 1)
        expect(levels).toEqual([])
        tick(state)
        expect(levels).toEqual([1])
    })

    it("doesn't fire while held, however long", () => {
        const { state, levels, breather } = charging()
        hold(state, TICK_RATE * 3)
        expect(levels).toEqual([])
        expect(breather.energy).toBe(100)
        expect(chargeLevel(breather)).toBe(MAX_CHARGE)
    })

    it("gains a level every 0.25 s held, up to 5", () => {
        expect(CHARGE_SECONDS).toBe(0.25)
        expect(MAX_CHARGE).toBe(5)
        const reached: number[] = []
        for (const ticks of [
            0,
            LEVEL_TICKS - 1,
            LEVEL_TICKS,
            LEVEL_TICKS * 2 - 1,
            LEVEL_TICKS * 2,
            LEVEL_TICKS * 3,
            LEVEL_TICKS * 4,
            LEVEL_TICKS * 10,
        ]) {
            const { state, levels } = charging()
            hold(state, ticks)
            tick(state)
            reached.push(...levels)
        }
        expect(reached).toEqual([1, 1, 2, 2, 3, 4, 5, 5])
    })

    it("spends that level's energy, and the usual cooldown", () => {
        const { state, breather } = charging()
        hold(state, LEVEL_TICKS * 2)
        tick(state)
        expect(breather.energy).toBe(100 - 3 * 10)
        expect(breather.cooldown).toBeCloseTo(breather.breath.cooldown)
    })

    it("charges no higher than the meter pays for", () => {
        // 25 energy: level 2 at 10 a level.
        const { state, levels, breather } = charging(25)
        expect(affordable(breather)).toBe(2)
        hold(state, LEVEL_TICKS * 4)
        expect(chargeLevel(breather)).toBe(2)
        tick(state)
        expect(levels).toEqual([2])
        expect(breather.energy).toBe(5)
    })

    it("charges higher once dots eaten meanwhile pay for it", () => {
        // 20 energy, then 4 dots (20 more) eaten walking while held.
        const { map } = textMap(["#######", "#.... #", "#######", "#.#####"])
        const levels: number[] = []
        const breath = testBreath({
            fire: (hit: BreathHit) => void levels.push(hit.level),
        })
        const state = makeState(map, { x: 5, y: 1 }, [], { breath })
        const { breather, character } = state.players[0]
        breather.energy = 20
        breather.facing = vec2(-1, 0)
        character.moveProgress = 1
        hold(state, LEVEL_TICKS * 4, { held: vec2(-1, 0) })
        expect(character.pos).toEqual(vec2(1, 1))
        expect(breather.energy).toBe(40)
        tick(state)
        expect(levels).toEqual([4])
    })

    it("lets the player keep moving while it charges", () => {
        const { state, levels } = charging()
        state.players[0].character.moveProgress = 1
        hold(state, TICK_RATE, { held: east })
        // A cell at once, then 4 a second.
        expect(state.players[0].character.pos).toEqual(vec2(6, 1))
        expect(levels).toEqual([])
        // It fires from where the player is when let go.
        tick(state, { held: east })
        expect(levels).toEqual([MAX_CHARGE])
    })

    it("drops a press without the energy for level 1, as before", () => {
        const { state, levels, breather } = charging(9)
        hold(state, LEVEL_TICKS)
        expect(breather.charge).toBeNull()
        tick(state)
        expect(levels).toEqual([])
        expect(breather.energy).toBe(9)
    })

    it("drops a press during the cooldown", () => {
        const { state, levels, breather } = charging()
        tick(state, { breath: true })
        hold(state, 2)
        expect(breather.charge).toBeNull()
        tick(state)
        expect(levels).toEqual([1])
    })

    it("needs a fresh press: a hold from before it could breathe charges nothing", () => {
        const { state, levels, breather } = charging(0)
        hold(state, 2)
        breather.energy = 100
        for (let i = 0; i < LEVEL_TICKS; i++) tick(state, { breathHeld: true })
        expect(breather.charge).toBeNull()
        tick(state)
        expect(levels).toEqual([])
        // Pressed again, it charges.
        tick(state, { breath: true })
        expect(levels).toEqual([1])
    })

    it("fires nothing and spends nothing when the breath refuses", () => {
        const breath = testBreath({ fire: () => false })
        const state = makeState(hall, { x: 1, y: 1 }, [], { breath })
        const { breather } = state.players[0]
        breather.energy = 100
        hold(state, LEVEL_TICKS * 2)
        tick(state)
        expect(breather.energy).toBe(100)
        expect(breather.cooldown).toBe(0)
        expect(breather.charge).toBeNull()
        expect(state.events.some((e) => e.type === "breathed")).toBe(false)
    })

    it("is dropped, unfired, by cancelCharges (a pause)", () => {
        const { state, levels, breather } = charging()
        hold(state, LEVEL_TICKS * 2)
        cancelCharges(state)
        expect(breather.charge).toBeNull()
        tick(state)
        expect(levels).toEqual([])
        expect(breather.energy).toBe(100)
    })
})

describe("charging with two players", () => {
    function duel() {
        const levels: number[][] = [[], []]
        const breaths = [0, 1].map((i) =>
            testBreath({ fire: (hit) => void levels[i].push(hit.level) })
        )
        const state = makeState(hall, [vec2(1, 1), vec2(8, 1)], [], {
            breath: breaths,
            mode: "versus",
        })
        for (const p of state.players) p.breather.energy = 100
        return { state, levels }
    }
    const both = (state: GameState, p1: Press, p2: Press) =>
        step(state, TICK, [input(p1), input(p2)], fixedRandom(0))

    it("charges each player's breath on its own", () => {
        const { state, levels } = duel()
        both(state, { breath: true, breathHeld: true }, {})
        for (let i = 0; i < LEVEL_TICKS; i++) {
            both(state, { breathHeld: true }, {})
        }
        both(state, { breathHeld: true }, { breath: true, breathHeld: true })
        for (let i = 0; i < LEVEL_TICKS * 2; i++) {
            both(state, { breathHeld: true }, { breathHeld: true })
        }
        both(state, {}, {})
        expect(levels).toEqual([[4], [3]])
    })

    it("drops a stunned player's charge, unfired", () => {
        const { state, levels } = duel()
        const p2 = state.players[1]
        both(state, {}, { breath: true, breathHeld: true })
        stun(p2)
        both(state, {}, { breathHeld: true })
        expect(p2.breather.charge).toBeNull()
        // Let go once the stun is over: nothing fires.
        p2.stunnedFor = 0
        both(state, {}, {})
        expect(levels[1]).toEqual([])
        expect(p2.breather.energy).toBe(100)
    })

    it("drops the charge of a player taken out", () => {
        const { state, levels } = duel()
        const p2 = state.players[1]
        both(state, {}, { breath: true, breathHeld: true })
        takeOut(p2, 0.1)
        both(state, {}, { breathHeld: true })
        expect(p2.breather.charge).toBeNull()
        expect(levels[1]).toEqual([])
    })
})

describe("the energy HUD while charging", () => {
    it("shows the level the charge has reached, 0 when not charging", () => {
        const { state } = charging()
        expect(energyHud(state).charge).toBe(0)
        hold(state, 0)
        expect(energyHud(state).charge).toBe(1)
        hold(state, LEVEL_TICKS * 2 - 1)
        // The press above didn't restart it: 2 * LEVEL_TICKS held.
        expect(energyHud(state).charge).toBe(3)
        expect(energyHud(state).ready).toBe(true)
        tick(state)
        expect(energyHud(state)).toMatchObject({ charge: 0, ready: false })
    })

    it("shows no more than the meter pays for", () => {
        const { state } = charging(35)
        hold(state, LEVEL_TICKS * 4)
        expect(energyHud(state).charge).toBe(3)
    })

    it("marks the cost per level", () => {
        const state = makeState(hall, { x: 1, y: 1 }, [], {
            breath: BREATHS.skunk,
        })
        expect(energyHud(state)).toMatchObject({ cost: 30, max: 150 })
    })
})
