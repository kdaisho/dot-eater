import { describe, expect, it } from "vite-plus/test"
import {
    confettiAt,
    flashAt,
    punchZoom,
    shakeAt,
    slamAt,
    speedRamp,
    whipAt,
    wipeAt,
} from "./drama"
import { alignTo, gameTimeAt, gameTimeFor, type TimeMap } from "./time"

describe("speedRamp", () => {
    const hero = 40
    const map: TimeMap = { fps: 30, segments: speedRamp(hero) }

    it("plays real time, then fast, then hard slow motion, then real time", () => {
        const speed = (f: number) => gameTimeAt(f + 1, map) - gameTimeAt(f, map)
        expect(speed(5)).toBeCloseTo(2)
        expect(speed(hero - 6)).toBeGreaterThan(4)
        expect(speed(hero)).toBeLessThan(0.3)
        expect(speed(hero + 10)).toBeLessThan(0.3)
        expect(speed(hero + 40)).toBeCloseTo(2)
    })

    it("lands the hero tick exactly on the hero frame with alignTo", () => {
        const aligned = alignTo(map, hero, 900)
        expect(gameTimeFor(hero, aligned)).toEqual({ tick: 900, alpha: 0 })
    })

    it("never starts before frame 0", () => {
        const segments = speedRamp(3)
        expect(segments.every((s) => s.fromFrame >= 0)).toBe(true)
    })
})

describe("shakeAt", () => {
    const impacts = [{ frame: 10 }]

    it("is still before the impact and dies away after", () => {
        expect(shakeAt(9, impacts)).toEqual({ x: 0, y: 0, rotate: 0 })
        const hit = shakeAt(11, impacts)
        const later = shakeAt(30, impacts)
        expect(Math.hypot(hit.x, hit.y)).toBeGreaterThan(
            Math.hypot(later.x, later.y)
        )
        expect(shakeAt(200, impacts)).toEqual({ x: 0, y: 0, rotate: 0 })
    })

    it("is the same every render, and stronger with strength", () => {
        expect(shakeAt(12, impacts)).toEqual(shakeAt(12, impacts))
        const soft = shakeAt(12, impacts)
        const hard = shakeAt(12, [{ frame: 10, strength: 2 }])
        expect(hard.x).toBeCloseTo(soft.x * 2)
    })
})

describe("flashAt", () => {
    it("is full on its frame and gone after the fade", () => {
        expect(flashAt(4, 5)).toBe(0)
        expect(flashAt(5, 5)).toBe(1)
        expect(flashAt(6, 5)).toBeGreaterThan(0)
        expect(flashAt(6, 5)).toBeLessThan(1)
        expect(flashAt(10, 5)).toBe(0)
        // A one-frame flash.
        expect(flashAt(6, 5, { hold: 1, fade: 0 })).toBe(0)
    })
})

describe("punchZoom", () => {
    it("pushes in by the amount at a full pulse", () => {
        expect(punchZoom(2, 0)).toBe(2)
        expect(punchZoom(2, 1, 0.25)).toBe(2.5)
    })
})

describe("whipAt", () => {
    it("whips in from the right and out to the left, blurred", () => {
        const enter = whipAt(0, 30, "whip", "cut")
        expect(enter.offset).toBeGreaterThan(0)
        expect(enter.blur).toBeGreaterThan(0.5)
        expect(whipAt(10, 30, "whip", "whip")).toEqual({ offset: 0, blur: 0 })
        const exit = whipAt(29, 30, "cut", "whip")
        expect(exit.offset).toBeLessThan(0)
        expect(whipAt(0, 30, "cut", "cut")).toEqual({ offset: 0, blur: 0 })
    })
})

describe("wipeAt", () => {
    it("covers the frame on the cut and uncovers it after", () => {
        expect(wipeAt(4, 10)).toBeUndefined()
        expect(wipeAt(10, 10)).toEqual({ left: 0, right: 1 })
        const before = wipeAt(8, 10)
        expect(before?.right).toBeLessThan(1)
        const after = wipeAt(12, 10)
        expect(after?.left).toBeGreaterThan(0)
        expect(after?.right).toBe(1)
        expect(wipeAt(15, 10)).toBeUndefined()
    })
})

describe("slamAt", () => {
    it("is hidden before, big on the hit, and overshoots to settle at 1", () => {
        expect(slamAt(9, 10, 30).opacity).toBe(0)
        const hit = slamAt(10, 10, 30, { from: 3 })
        expect(hit.scale).toBe(3)
        const scales = Array.from(
            { length: 30 },
            (_, i) => slamAt(10 + i, 10, 30).scale
        )
        // Below 1 at some point: the overshoot.
        expect(Math.min(...scales)).toBeLessThan(1)
        expect(scales[29]).toBeCloseTo(1, 1)
    })
})

describe("confettiAt", () => {
    const options = { colours: ["#f00", "#0f0"], count: 50 }

    it("is nothing before the burst and the same on every render", () => {
        expect(confettiAt(9, 10, 30, options)).toEqual([])
        expect(confettiAt(25, 10, 30, options)).toEqual(
            confettiAt(25, 10, 30, options)
        )
    })

    it("bursts up from its origin, then falls off the bottom", () => {
        const start = confettiAt(10, 10, 30, options)
        expect(start).toHaveLength(50)
        expect(start.every((p) => p.x === 0.5 && p.y === 0.6)).toBe(true)
        const up = confettiAt(18, 10, 30, options)
        expect(up.filter((p) => p.y < 0.6).length).toBeGreaterThan(40)
        expect(confettiAt(10 + 30 * 8, 10, 30, options)).toEqual([])
    })
})
