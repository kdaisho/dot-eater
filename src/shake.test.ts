import { describe, expect, it } from "vite-plus/test"
import { createShake, MAX_SHAKE, SHAKE_DECAY, SHAKES } from "./shake"

// Always the same number.
const fixed = (n: number) => () => n
// The far edge either way: -1 and almost +1 after scaling.
const LOW = fixed(0)
const HIGH = fixed(1 - 1e-12)

describe("createShake", () => {
    it("starts still", () => {
        const shake = createShake()
        expect(shake.trauma).toBe(0)
        expect(shake.offset(HIGH)).toEqual({ x: 0, y: 0 })
    })

    it("adds trauma, capped at 1", () => {
        const shake = createShake()
        shake.add(0.4)
        expect(shake.trauma).toBeCloseTo(0.4)
        shake.add(0.4)
        expect(shake.trauma).toBeCloseTo(0.8)
        shake.add(0.4)
        expect(shake.trauma).toBe(1)
    })

    it("ignores amounts that aren't positive", () => {
        const shake = createShake()
        shake.add(0.5)
        shake.add(-1)
        shake.add(0)
        shake.add(NaN)
        expect(shake.trauma).toBeCloseTo(0.5)
    })

    it("drains trauma at SHAKE_DECAY per second, down to 0", () => {
        const shake = createShake()
        shake.add(1)
        shake.update(0.1)
        expect(shake.trauma).toBeCloseTo(1 - SHAKE_DECAY * 0.1)
        shake.update(10)
        expect(shake.trauma).toBe(0)
        expect(shake.offset(HIGH)).toEqual({ x: 0, y: 0 })
    })

    it("is over within a second of the strongest shake", () => {
        const shake = createShake()
        shake.add(1)
        for (let i = 0; i < 60; i++) shake.update(1 / 60)
        expect(shake.trauma).toBe(0)
    })

    it("throws the maze up to MAX_SHAKE cells either way at full trauma", () => {
        const shake = createShake()
        shake.add(1)
        expect(shake.offset(LOW).x).toBeCloseTo(-MAX_SHAKE)
        expect(shake.offset(LOW).y).toBeCloseTo(-MAX_SHAKE)
        expect(shake.offset(HIGH).x).toBeCloseTo(MAX_SHAKE)
        expect(shake.offset(fixed(0.5))).toEqual({ x: 0, y: 0 })
    })

    it("moves by trauma squared, so small hits barely shake", () => {
        const shake = createShake()
        shake.add(0.5)
        expect(shake.offset(HIGH).x).toBeCloseTo(MAX_SHAKE * 0.25)
    })

    it("stays within reach for any random number", () => {
        const shake = createShake()
        shake.add(0.8)
        const reach = MAX_SHAKE * 0.64
        for (let i = 0; i < 100; i++) {
            const o = shake.offset(Math.random)
            expect(Math.abs(o.x)).toBeLessThanOrEqual(reach)
            expect(Math.abs(o.y)).toBeLessThanOrEqual(reach)
        }
    })

    it("takes its reach and decay as options", () => {
        const shake = createShake({ max: 2, decay: 1 })
        shake.add(1)
        expect(shake.offset(LOW).x).toBeCloseTo(-2)
        shake.update(0.5)
        expect(shake.trauma).toBeCloseTo(0.5)
    })

    it("clears all trauma", () => {
        const shake = createShake()
        shake.add(1)
        shake.clear()
        expect(shake.trauma).toBe(0)
        expect(shake.offset(HIGH)).toEqual({ x: 0, y: 0 })
    })

    describe("disabled", () => {
        it("never shakes", () => {
            const shake = createShake({ enabled: false })
            expect(shake.enabled).toBe(false)
            shake.add(1)
            expect(shake.trauma).toBe(0)
            expect(shake.offset(HIGH)).toEqual({ x: 0, y: 0 })
        })

        it("stops a shake under way at once when turned off", () => {
            const shake = createShake()
            shake.add(1)
            shake.enabled = false
            expect(shake.trauma).toBe(0)
            expect(shake.offset(HIGH)).toEqual({ x: 0, y: 0 })
        })

        it("shakes again once turned back on", () => {
            const shake = createShake({ enabled: false })
            shake.enabled = true
            shake.add(1)
            expect(shake.offset(HIGH).x).toBeCloseTo(MAX_SHAKE)
        })
    })

    it("suggests stronger shakes for bigger blows", () => {
        expect(SHAKES.hit).toBeLessThan(SHAKES.caught)
        for (const amount of Object.values(SHAKES)) {
            expect(amount).toBeGreaterThan(0)
            expect(amount).toBeLessThanOrEqual(1)
        }
    })
})
