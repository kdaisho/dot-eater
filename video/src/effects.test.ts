import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import { TICK_RATE } from "../../src/constants"
import type { GameEvent } from "../../src/events"
import { gameOf } from "../../src/flow"
import type { Recording } from "../../src/replay"
import { vec2 } from "../../src/vec2"
import { EFFECT_WINDOW, effectsAt, longestEffect } from "./effects"
import { replayerFor, runOf } from "./replayers"

const demo = JSON.parse(
    readFileSync(new URL("recordings/demo.json", import.meta.url), "utf8")
) as Recording
const game = gameOf(replayerFor(demo).at(0))!

// A run of `length` ticks, all moving the effects on, with `events` on
// the ticks given.
function ticksWith(length: number, events: Record<number, GameEvent[]>) {
    return Array.from({ length }, (_, k) => ({
        events: events[k] ?? [],
        moved: k > 0,
    }))
}

const caught: GameEvent = {
    type: "playerCaught",
    player: 0,
    at: vec2(3, 3),
    outForGood: false,
}

describe("effectsAt", () => {
    it("starts far enough back for every effect to have run out", () => {
        expect(longestEffect() * TICK_RATE).toBeLessThan(EFFECT_WINDOW)
    })

    it("bursts and shakes on an event, then runs out", () => {
        const ticks = ticksWith(400, { 10: [caught] })
        const at = (tick: number) => effectsAt(ticks, 1, game, tick, 0)
        expect(at(9).particles).toHaveLength(0)
        expect(at(10).particles.length).toBeGreaterThan(0)
        expect(at(10).shake).not.toEqual(vec2(0, 0))
        expect(at(10 + EFFECT_WINDOW).particles).toHaveLength(0)
        expect(at(10 + EFFECT_WINDOW).shake).toEqual(vec2(0, 0))
    })

    it("depends only on the tick, the alpha and the seed", () => {
        const { ticks } = runOf(demo)
        const a = effectsAt(ticks, demo.seed, game, 300, 0.5)
        effectsAt(ticks, demo.seed, game, 700, 0)
        effectsAt(ticks, demo.seed, game, 10, 0.2)
        expect(effectsAt(ticks, demo.seed, game, 300, 0.5)).toEqual(a)
        expect(a.particles.length).toBeGreaterThan(0)
    })

    it("moves particles on between ticks with alpha", () => {
        const ticks = ticksWith(400, { 10: [caught] })
        const p0 = effectsAt(ticks, 1, game, 12, 0).particles[0]
        const p5 = effectsAt(ticks, 1, game, 12, 0.5).particles[0]
        const p1 = effectsAt(ticks, 1, game, 13, 0).particles[0]
        expect(p5.age).toBeGreaterThan(p0.age)
        expect(p5.age).toBeLessThan(p1.age)
    })
})
