import { describe, expect, it } from "vite-plus/test"
import { SPRITE_SCALE } from "./constants"
import type { GameEvent } from "./events"
import {
    CRUMBLE_AT,
    FLASH_SECONDS,
    GREY_AT,
    GREY_END,
    KNOCKOUT_SECONDS,
    PILE_AT,
    RING_COLORS,
    RING_DELAY,
    RING_REACH,
    RING_SECONDS,
    createKnockoutView,
    crumble,
    grey,
    greyAmount,
    hidden,
    knockoutDots,
    knockoutFlash,
    knockoutJitter,
    knockoutLight,
    knockoutRings,
    knockoutTime,
    mix,
    pileSlots,
    type Knockout,
} from "./knockoutView"
import { ANIMAL_IDS } from "./roster"
import { ANIMAL_SPRITES, spritePixels, type Dots } from "./sprites"
import { vec2 } from "./vec2"

const TICK = 1 / 60

const caught = (player: number, x = 2, y = 3): GameEvent => ({
    type: "playerCaught",
    player,
    at: vec2(x, y),
})

// Every animal's panic face, outlined, as render.ts draws a knockout.
const faces: [string, Dots][] = ANIMAL_IDS.map((id) => [
    id,
    spritePixels({ id: ANIMAL_SPRITES[id], panicked: true }, "#000000"),
])

const shown = (dots: Dots) => dots.flat().filter((c) => c !== null).length

describe("createKnockoutView", () => {
    it("records each playerCaught with its cell and a seed, and nothing else", () => {
        const view = createKnockoutView({ random: () => 0.5 })
        view.take([
            { type: "dotEaten", player: 0, at: vec2(1, 1) },
            caught(1, 4, 5),
            { type: "gameLost" },
        ])
        expect(view.knockouts).toEqual([
            { player: 1, at: vec2(4, 5), seed: 2 ** 30, elapsed: 0 },
        ])
    })

    it("moves each knockout on, up to its end, and keeps it", () => {
        const view = createKnockoutView({ random: () => 0 })
        view.take([caught(0)])
        view.update(0.5)
        expect(view.knockouts[0]!.elapsed).toBeCloseTo(0.5)
        for (let i = 0; i < 200; i++) view.update(TICK)
        expect(view.knockouts[0]!.elapsed).toBe(KNOCKOUT_SECONDS)
        expect(view.knockouts).toHaveLength(1)
    })

    it("keeps several knockouts, each on its own clock", () => {
        const view = createKnockoutView({ random: () => 0 })
        view.take([caught(0, 1, 1)])
        view.update(KNOCKOUT_SECONDS)
        view.take([caught(1, 6, 1)])
        view.update(0.25)
        expect(view.knockouts.map((k) => k.player)).toEqual([0, 1])
        expect(view.knockouts[0]!.elapsed).toBe(KNOCKOUT_SECONDS)
        expect(view.knockouts[1]!.elapsed).toBeCloseTo(0.25)
        expect(hidden(view.knockouts)).toEqual(new Set([0, 1]))
    })

    it("forgets every knockout on clear (a new game)", () => {
        const view = createKnockoutView({ random: () => 0 })
        view.take([caught(0)])
        view.clear()
        expect(view.knockouts).toEqual([])
    })
})

describe("knockoutTime", () => {
    const at = (elapsed: number): Knockout => ({
        player: 0,
        at: vec2(0, 0),
        seed: 1,
        elapsed,
    })

    it("adds the part of a tick drawn, and stops at the end", () => {
        expect(knockoutTime(at(0.2), 0.5, TICK)).toBeCloseTo(0.2 + TICK / 2)
        expect(knockoutTime(at(KNOCKOUT_SECONDS), 0.9, TICK)).toBe(
            KNOCKOUT_SECONDS
        )
        expect(knockoutTime(at(KNOCKOUT_SECONDS - 0.001), 0.9, TICK)).toBe(
            KNOCKOUT_SECONDS
        )
    })
})

describe("the timeline", () => {
    it("flashes only briefly, fading", () => {
        expect(knockoutFlash(0)).toBeGreaterThan(0)
        expect(knockoutFlash(FLASH_SECONDS / 2)).toBeLessThan(knockoutFlash(0))
        expect(knockoutFlash(FLASH_SECONDS)).toBe(0)
        expect(FLASH_SECONDS).toBeLessThanOrEqual(0.1)
    })

    it("spreads a white ring, then a gold one, out to about 2.5 to 3 cells", () => {
        const [white, gold] = RING_COLORS
        expect(knockoutRings(0).map((r) => r.color)).toEqual([white])
        const both = knockoutRings(RING_DELAY + 0.01)
        expect(both.map((r) => r.color)).toEqual([white, gold])
        expect(both[1]!.radius).toBeLessThan(both[0]!.radius)
        // Wider and fainter as they go.
        const early = knockoutRings(0.1)[0]!
        const late = knockoutRings(0.5)[0]!
        expect(late.radius).toBeGreaterThan(early.radius)
        expect(late.alpha).toBeLessThan(early.alpha)
        const last = knockoutRings(RING_SECONDS - 1e-6)[0]!
        expect(last.radius).toBeGreaterThanOrEqual(2.5)
        expect(last.radius).toBeLessThanOrEqual(3)
        expect(RING_REACH).toBeLessThanOrEqual(3)
        expect(knockoutRings(RING_SECONDS)).toEqual([])
    })

    it("drains the sprite to grey from 0.05 s, all grey well before it crumbles", () => {
        expect(greyAmount(0)).toBe(0)
        expect(greyAmount(GREY_AT)).toBe(0)
        expect(greyAmount((GREY_AT + GREY_END) / 2)).toBeCloseTo(0.5)
        expect(greyAmount(GREY_END)).toBe(1)
        expect(GREY_END).toBeLessThan(CRUMBLE_AT)
    })

    it("jitters a dot while it greys, not before or once it crumbles", () => {
        expect(knockoutJitter(0.05)).toBe(0)
        const jitters = Array.from({ length: 30 }, (_, i) =>
            knockoutJitter(0.11 + i * 0.01)
        )
        expect(new Set(jitters)).toEqual(new Set([0, 1]))
        expect(knockoutJitter(CRUMBLE_AT)).toBe(0)
    })

    it("keeps the light on until the pile lands, out by the end", () => {
        expect(knockoutLight(0)).toBe(1)
        expect(knockoutLight(PILE_AT)).toBe(1)
        expect(knockoutLight((PILE_AT + KNOCKOUT_SECONDS) / 2)).toBeCloseTo(0.5)
        expect(knockoutLight(KNOCKOUT_SECONDS)).toBe(0)
    })

    it("has the pile landed by 1.1 s, within the effect", () => {
        expect(PILE_AT).toBeCloseTo(1.1)
        expect(PILE_AT).toBeLessThan(KNOCKOUT_SECONDS)
    })
})

describe("grey and mix", () => {
    it("greys by brightness into four greys, black staying black", () => {
        expect(grey("#000000")).toBe("#000000")
        expect(grey("#ffffff")).toBe("#fcfcfc")
        expect(grey("#f8c838")).toBe("#fcfcfc")
        expect(grey("#a0a0a0")).toBe("#bcbcbc")
        expect(grey("#e8501c")).toBe("#7c7c7c")
        expect(grey("#401000")).toBe("#3c3c3c")
        expect(grey("red")).toBe("red")
        // A grey stays itself.
        for (const g of ["#fcfcfc", "#bcbcbc", "#7c7c7c", "#3c3c3c"]) {
            expect(grey(g)).toBe(g)
        }
    })

    it("mixes two colours", () => {
        expect(mix("#000000", "#ffffff", 0)).toBe("#000000")
        expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080")
        expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff")
    })
})

describe("knockoutDots", () => {
    const [, face] = faces[0]!
    const h = face.length
    const w = face[0]!.length

    it("is the sprite as it is at the start", () => {
        const dots = knockoutDots(face, 0, 7)
        expect(dots).toHaveLength(shown(face))
        for (const d of dots) expect(d.color).toBe(face[d.y]![d.x])
    })

    it("is all grey, jittering a dot, just before it crumbles", () => {
        const t = 0.35
        const dx = knockoutJitter(t)
        expect(dx).toBe(1)
        for (const d of knockoutDots(face, t, 7)) {
            expect(d.color).toBe(grey(face[d.y]![d.x - dx]!))
        }
        // Reduced motion: no jitter.
        for (const d of knockoutDots(face, t, 7, true)) {
            expect(face[d.y]![d.x]).not.toBeNull()
        }
    })

    it("crumbles from the bottom: the bottom rows move first", () => {
        const crumbs = crumble(face, 7)
        const bottom = crumbs.filter((c) => c.y0 === h - 1)
        const top = crumbs.filter((c) => c.y0 === 1)
        const latest = Math.max(...bottom.map((c) => c.start))
        const earliest = Math.min(...top.map((c) => c.start))
        expect(latest).toBeLessThan(earliest)
        for (const c of crumbs)
            expect(c.start).toBeGreaterThanOrEqual(CRUMBLE_AT)
    })

    it("has every dot in a small grey pile on the cell's floor by 1.1 s", () => {
        const pile = knockoutDots(face, PILE_AT, 7)
        const slots = pileSlots(w, h)
        const key = (p: { x: number; y: number }) => `${p.x},${p.y}`
        const places = new Set(slots.map(key))
        for (const d of pile) {
            expect(places.has(key(d))).toBe(true)
            expect(d.color).toBe(grey(d.color))
        }
        // Low, on the sprite's bottom row, and within its cell.
        const ys = pile.map((d) => d.y)
        expect(Math.max(...ys)).toBe(h - 1)
        expect(h - Math.min(...ys)).toBeLessThanOrEqual(6)
        const cellDots = w / SPRITE_SCALE
        for (const d of pile) {
            expect(d.x).toBeGreaterThanOrEqual((w - cellDots) / 2)
            expect(d.x).toBeLessThan((w + cellDots) / 2)
        }
    })

    it("keeps the pile as it is from then on", () => {
        expect(knockoutDots(face, KNOCKOUT_SECONDS, 7)).toEqual(
            knockoutDots(face, PILE_AT, 7)
        )
    })

    it("is the same for the same seed, and differs mid-crumble for another", () => {
        expect(knockoutDots(face, 0.7, 7)).toEqual(knockoutDots(face, 0.7, 7))
        expect(knockoutDots(face, 0.7, 7)).not.toEqual(
            knockoutDots(face, 0.7, 12345)
        )
    })

    it.each(faces)("works for the %s's sprite", (_, dots) => {
        expect(knockoutDots(dots, 0, 1)).toHaveLength(shown(dots))
        expect(knockoutDots(dots, PILE_AT, 1)).toHaveLength(shown(dots))
        const ys = knockoutDots(dots, PILE_AT, 1).map((d) => d.y)
        expect(Math.min(...ys)).toBeGreaterThan(dots.length / 2)
    })
})
