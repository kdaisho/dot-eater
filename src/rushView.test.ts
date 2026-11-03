import { describe, expect, it } from "vite-plus/test"
import { breathe } from "./breath"
import { boar, knockDistance } from "./breaths/boar"
import { ENEMY_IDS, TICK_RATE } from "./constants"
import type { GameEvent } from "./events"
import { DASH_SECONDS, IDLE, step, type GameState } from "./game"
import { glidePos } from "./glide"
import {
    createRushView,
    FLIGHT_SECONDS,
    flown,
    rushFrame,
    type RushView,
} from "./rushView"
import { createSplitter } from "./splitter"
import { fixedRandom, makeEnemy, makeState, textMap } from "./test/helpers"
import { vec2 } from "./vec2"

// The Rush as it is drawn (KDA-307): the game and the view stepped
// together as main.ts steps them, a tick at a time.

const TICK = 1 / TICK_RATE
const COLS = 14
const ROWS = 4
// A hall from x 1 to x 12 along row 1. The dot in the pocket keeps the game
// from being won.
const hall = textMap([
    "##############",
    "#            #",
    "##############",
    "#.############",
]).map

// An enemy on (x, y) that never moves by itself.
const still = (x: number, y: number) => {
    const enemy = makeEnemy(x, y)
    enemy.speed = 0
    return enemy
}

function boarState(x: number, enemies = [still(4, 1)]): GameState {
    const state = makeState(hall, { x, y: 1 }, enemies, { breath: boar })
    state.players[0].breather.energy = boar.maxEnergy
    state.players[0].character.moveProgress = 1
    return state
}

const types = (events: readonly GameEvent[]) => events.map((e) => e.type)

// What happened on one tick: the events let through (on the tick or held
// till then), where the Boar is drawn and the frame's fliers.
type Frame = {
    played: GameEvent["type"][]
    boar: number
    fliers: number[]
}

// Let the Rush go at `level`, as main does on its tick, then run `ticks`
// more, idle; the frames from the release on.
function rush(
    state: GameState,
    level: number,
    ticks: number
): { view: RushView; frames: Frame[] } {
    const view = createRushView()
    const frames: Frame[] = []
    const player = state.players[0]
    const record = (played: readonly GameEvent[]) => {
        const frame = rushFrame(view.flights, state, 0, TICK)
        frames.push({
            played: types(played),
            boar: glidePos(player.character, 0, COLS, ROWS, player.rate).x,
            fliers: frame.fliers.map((f) => f.pos.x),
        })
    }
    breathe(state, player, level)
    const now = view.take(state.events, state)
    record([...now, ...view.update(TICK)])
    for (let k = 0; k < ticks; k++) {
        step(state, TICK, IDLE, fixedRandom(0))
        const now = view.take(state.events, state)
        record([...now, ...view.update(TICK)])
    }
    return { view, frames }
}

describe("the Rush as drawn", () => {
    const impactTick = Math.round(DASH_SECONDS * TICK_RATE)
    const slamTick = impactTick + Math.ceil(FLIGHT_SECONDS * TICK_RATE - 1e-9)

    it("hits the enemy as the Boar's glide reaches it, flies it, then pops it at the slam cell", () => {
        // The Boar dashes 2 cells, to x 3; the enemy flies 6, from x 4 to x 10.
        const state = boarState(1)
        expect(knockDistance(5)).toBe(6)
        const { frames } = rush(state, 5, slamTick + 2)
        // The breath (its whoosh, its dust) on release; nothing else yet.
        expect(frames[0].played).toEqual(["breathed"])
        // Until the impact, the enemy stands where it was and the Boar
        // closes in.
        for (const frame of frames.slice(0, impactTick)) {
            expect(frame.fliers).toEqual([4])
            expect(frame.boar).toBeLessThan(3)
        }
        // On the tick the Boar gets there, the ram: thud, burst, dust trail.
        expect(frames[impactTick].boar).toBeCloseTo(3)
        expect(frames[impactTick].played).toEqual(["rammed", "knockedFlying"])
        expect(frames[impactTick].fliers).toEqual([4])
        // Then it flies on, faster at first, to the slam cell.
        const flight = frames.slice(impactTick + 1, slamTick)
        expect(flight.length).toBeGreaterThan(0)
        let last = 4
        for (const frame of flight) {
            expect(frame.played).toEqual([])
            expect(frame.fliers[0]).toBeGreaterThan(last)
            expect(frame.fliers[0]).toBeLessThan(10)
            last = frame.fliers[0]
        }
        expect(flight[0].fliers[0] - 4).toBeGreaterThan(
            flight.at(-1)!.fliers[0] - flight.at(-2)!.fliers[0]
        )
        // Popped there: the defeat's poof and chirps, and it's gone.
        expect(frames[slamTick].played).toEqual(["enemyDefeated"])
        expect(frames[slamTick].fliers).toEqual([])
        expect(frames.slice(slamTick + 1).every((f) => f.played.length === 0))
    })

    it("keeps the impact and the slam together with the Boar for any dash", () => {
        for (const [x, level] of [
            [2, 2],
            [2, 4],
            [1, 4],
        ] as const) {
            const { frames } = rush(boarState(x), level, slamTick + 2)
            const impact = frames.findIndex((f) => f.played.includes("rammed"))
            expect(impact).toBe(impactTick)
            expect(frames[impact].boar).toBeCloseTo(3)
            expect(
                frames.findIndex((f) => f.played.includes("enemyDefeated"))
            ).toBe(slamTick)
        }
    })

    it("rams at once when the Boar is already up against it", () => {
        const { frames } = rush(boarState(3), 1, slamTick + 2)
        expect(frames[0].played).toEqual([
            "breathed",
            "rammed",
            "knockedFlying",
        ])
        const slam = frames.findIndex((f) => f.played.includes("enemyDefeated"))
        expect(slam).toBe(Math.ceil(FLIGHT_SECONDS * TICK_RATE - 1e-9))
    })

    it("pops an enemy against a wall where it stands, at the impact", () => {
        const state = boarState(9, [still(12, 1)])
        const { frames } = rush(state, 5, slamTick)
        const impact = frames.findIndex((f) => f.played.includes("rammed"))
        expect(impact).toBe(impactTick)
        expect(frames[impact].played).toEqual(["rammed", "enemyDefeated"])
        expect(frames[impact - 1].fliers).toEqual([12])
        expect(frames[impact].fliers).toEqual([])
    })

    it("slides the chain in front of the flier, each car from where it was picked up", () => {
        // The flier at x 2 flies 4 cells to x 6; a (x 3) is carried all 4,
        // to x 7, and b (x 5) the last 3, to x 8, from when a reaches it.
        const state = boarState(1, [still(2, 1), still(3, 1), still(5, 1)])
        const view = createRushView()
        breathe(state, state.players[0], 3)
        view.take(state.events, state)
        const [, a, b] = state.enemies
        expect([a.pos.x, b.pos.x]).toEqual([7, 8])
        const drawn = (alpha = 0) => {
            const frame = rushFrame(view.flights, state, alpha, TICK)
            const at = (i: number) =>
                state.enemies[i].pos.x + (frame.enemyShift.get(i)?.x ?? 0)
            return { flier: frame.fliers[0]?.pos.x, a: at(1), b: at(2) }
        }
        // Rammed where it stands (the Boar is right behind it): at once.
        expect(drawn()).toEqual({ flier: 2, a: 3, b: 5 })
        view.update(TICK)
        const seen = [drawn()]
        while (view.flights.length > 0) {
            view.update(TICK)
            seen.push(drawn())
        }
        for (const { flier, a, b } of seen.slice(0, -1)) {
            // a stays right in front of the flier, and b doesn't move until
            // a gets to it.
            expect(a - flier).toBeCloseTo(1)
            expect(b).toBeCloseTo(Math.max(5, a + 1))
        }
        expect(seen.at(-1)).toEqual({ flier: undefined, a: 7, b: 8 })
    })

    it("stops sliding a shoved player that moves on", () => {
        const state = makeState(hall, [vec2(1, 1), vec2(5, 1)], [still(3, 1)], {
            breath: boar,
            mode: "coop",
        })
        state.players[0].breather.energy = 100
        const view = createRushView()
        breathe(state, state.players[0], 2)
        view.take(state.events, state)
        const shift = () =>
            rushFrame(view.flights, state, 0, TICK).playerShift.get(1)
        // At x 7, drawn back at x 5 until the flier gets to it.
        expect(state.players[1].character.pos).toEqual(vec2(7, 1))
        expect(shift()).toEqual(vec2(-2, 0))
        state.players[1].character.lastPos = vec2(7, 1)
        state.players[1].character.pos = vec2(8, 1)
        expect(shift()).toBeUndefined()
    })

    it("flies a whole Splitter whole, its halves held back until the slam", () => {
        const [main, spare] = createSplitter(
            [ENEMY_IDS[0], ENEMY_IDS[1]],
            vec2(4, 1)
        )
        main.speed = 0
        const state = boarState(1, [main, spare])
        const view = createRushView()
        breathe(state, state.players[0], 5)
        view.take(state.events, state)
        const frame = rushFrame(view.flights, state, 0, TICK)
        expect(frame.fliers).toMatchObject([{ index: 0, split: true }])
        expect([...frame.hidden]).toEqual([0, 1])
    })

    it("holds nothing back on a tick that fells the boss", () => {
        const view = createRushView()
        const events: GameEvent[] = [
            { type: "rammed", player: 0, at: vec2(4, 1), facing: vec2(1, 0) },
            { type: "bossDefeated", player: 0, at: vec2(4, 1) },
        ]
        expect(view.take(events, boarState(1))).toEqual(events)
        expect(view.flights).toEqual([])
    })

    it("moves between ticks with the frame, as the Boar's glide does", () => {
        const state = boarState(3)
        const view = createRushView()
        breathe(state, state.players[0], 1)
        view.take(state.events, state)
        view.update(TICK)
        const at = (alpha: number) =>
            rushFrame(view.flights, state, alpha, TICK).fliers[0].pos.x
        const flight = view.flights[0]
        expect(at(0.5)).toBeCloseTo(4 + flown(flight, TICK / 2))
        expect(at(0.5)).toBeGreaterThan(at(0))
    })
})
