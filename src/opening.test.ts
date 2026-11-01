import { describe, expect, it } from "vite-plus/test"
import {
    BOSS_ABOVE,
    LOGO_TOP,
    logoTop,
    OPENING_DRUM,
    OPENING_HEIGHT,
    OPENING_WIDTH,
    PACK,
    PACK_DELAY,
    PACK_GONE,
    PACK_LAP,
    packLap,
    RISE_FROM,
    RUNNER_WIDTH,
    runnerX,
    shine,
} from "./opening"

describe("logoTop", () => {
    it("starts with the boss above the logo out of sight", () => {
        expect(logoTop(0) - BOSS_ABOVE).toBeGreaterThanOrEqual(OPENING_HEIGHT)
        expect(logoTop(RISE_FROM)).toBe(logoTop(0))
    })

    it("rises evenly and rests from the drum on", () => {
        const mid = logoTop((RISE_FROM + OPENING_DRUM) / 2)
        expect(mid).toBeCloseTo((logoTop(0) + LOGO_TOP) / 2, 0)
        expect(logoTop(OPENING_DRUM - 0.1)).toBeGreaterThan(LOGO_TOP)
        expect(logoTop(OPENING_DRUM)).toBe(LOGO_TOP)
        expect(logoTop(60)).toBe(LOGO_TOP)
    })
})

describe("the minions' pack", () => {
    it("first runs a moment after the drum, then every lap", () => {
        const first = OPENING_DRUM + PACK_DELAY
        expect(packLap(first - 0.01)).toBeUndefined()
        expect(packLap(first + 1e-9)).toBeCloseTo(0, 6)
        expect(packLap(first + PACK_LAP + 1)).toBeCloseTo(1, 9)
    })

    it("comes in from off the right edge", () => {
        expect(runnerX(0, 0)).toBeGreaterThan(OPENING_WIDTH)
    })

    it("is all gone from the screen when the R shines", () => {
        for (const [lag] of PACK)
            expect(runnerX(lag, PACK_GONE) + RUNNER_WIDTH).toBeLessThanOrEqual(
                0
            )
        const [last] = PACK[PACK.length - 1]!
        expect(runnerX(last, PACK_GONE - 0.05) + RUNNER_WIDTH).toBeGreaterThan(
            0
        )
        // and every lap leaves time for the shine before the next run
        expect(PACK_GONE + 0.6).toBeLessThan(PACK_LAP)
    })
})

describe("shine", () => {
    const run = OPENING_DRUM + PACK_DELAY

    it("shines once the pack is gone, on every run", () => {
        expect(shine(run + PACK_GONE - 0.01)).toBeUndefined()
        expect(shine(run + PACK_GONE + 1e-9)).toBeCloseTo(0, 6)
        expect(shine(run + PACK_GONE + 0.3)).toBeCloseTo(0.5, 9)
        expect(shine(run + PACK_GONE + 0.7)).toBeUndefined()
        expect(shine(run + PACK_LAP * 2 + PACK_GONE + 0.3)).toBeCloseTo(0.5, 6)
    })

    it("doesn't shine before the first run", () => {
        expect(shine(1)).toBeUndefined()
    })
})
