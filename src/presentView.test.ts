import { describe, expect, it } from "vite-plus/test"
import { GERM_LAND_SECONDS, PRESENT_SECONDS, QUAKE_SECONDS } from "./present"
import { HUGE_DOT_ICON, hugeDotPalette } from "./presentData"
import {
    BLINK_AT,
    DOT,
    FAST_BLINK_AT,
    GERM_JUMP_SECONDS,
    germJump,
    openAt,
    presentBob,
    presentShown,
    quakePanic,
    QUAKE_WARN_SECONDS,
    revealFrame,
} from "./presentView"
import { SPRITE_SCALE } from "./constants"
import { STAGE_STYLES } from "./tiles"
import { vec2 } from "./vec2"

// A box `age` seconds into its life.
const box = (age: number) => ({ pos: vec2(1, 1), left: PRESENT_SECONDS - age })

describe("a box's look", () => {
    it("is drawn at the sprites' dot density", () => {
        expect(DOT).toBeCloseTo(SPRITE_SCALE / 18)
    })

    it("bobs a dot every 0.4 s while fresh", () => {
        expect(presentBob(box(0.1))).toBe(0)
        expect(presentBob(box(0.5))).toBe(1)
        expect(presentBob(box(0.9))).toBe(0)
        expect(presentBob(box(BLINK_AT + 0.5))).toBe(0)
    })

    it("shows while fresh, then blinks at 2 Hz, then at 4 Hz", () => {
        expect(BLINK_AT).toBe(7)
        expect(FAST_BLINK_AT).toBe(8.5)
        for (let t = 0; t < BLINK_AT; t += 0.05) {
            expect(presentShown(box(t))).toBe(true)
        }
        const flips = (from: number, to: number) => {
            let n = 0
            let was = presentShown(box(from))
            for (let t = from; t < to; t += 0.01) {
                const now = presentShown(box(t))
                if (now !== was) n++
                was = now
            }
            return n
        }
        // 1.5 s at 2 Hz: 3 blinks, 6 flips (give or take the ends).
        expect(flips(BLINK_AT, FAST_BLINK_AT - 0.01)).toBeGreaterThanOrEqual(5)
        expect(flips(BLINK_AT, FAST_BLINK_AT - 0.01)).toBeLessThanOrEqual(6)
        expect(
            flips(FAST_BLINK_AT, PRESENT_SECONDS - 0.01)
        ).toBeGreaterThanOrEqual(11)
        expect(presentShown(box(BLINK_AT + 0.1))).toBe(true)
        expect(presentShown(box(BLINK_AT + 0.4))).toBe(false)
        expect(presentShown(box(FAST_BLINK_AT + 0.2))).toBe(false)
    })
})

describe("revealFrame", () => {
    const reveal = (content: "heal" | "germ" | "quake", age: number) => ({
        pos: vec2(3, 3),
        player: 0,
        content,
        germ: content === "germ" ? 1 : null,
        age,
    })

    it("squashes the box, then opens it and throws the lid", () => {
        const squash = revealFrame(reveal("heal", 0.05))
        expect(squash.box!.open).toBe(false)
        expect(squash.box!.scaleX).toBeGreaterThan(1)
        expect(squash.box!.scaleY).toBeLessThan(1)
        expect(squash.lid).toBeNull()
        expect(squash.icon).toBeNull()
        const open = revealFrame(reveal("heal", 0.3))
        expect(open.box!.open).toBe(true)
        expect(open.lid!.dy).toBeLessThan(0)
        expect(open.lid!.dx).toBeGreaterThan(0)
        // The icon rises over the opener.
        expect(open.icon!.dy).toBeLessThan(-0.5)
        expect(revealFrame(reveal("heal", 1.4)).box).toBeNull()
    })

    it("shakes the Germ's box first, a tell, and has no icon", () => {
        expect(openAt("germ")).toBeGreaterThan(openAt("heal"))
        const a = revealFrame(reveal("germ", 0.01))
        const b = revealFrame(reveal("germ", 0.05))
        expect(a.box!.open).toBe(false)
        expect(Math.abs(a.box!.dx)).toBeCloseTo(DOT)
        expect(Math.sign(a.box!.dx)).not.toBe(Math.sign(b.box!.dx))
        expect(revealFrame(reveal("germ", 0.5)).icon).toBeNull()
    })

    it("floats the label up and fades it out", () => {
        expect(revealFrame(reveal("quake", 0.1)).label).toBeNull()
        const label = revealFrame(reveal("quake", 0.6)).label!
        expect(label.alpha).toBe(1)
        expect(label.dy).toBeLessThan(-1)
        expect(revealFrame(reveal("quake", 1.45)).label).toBeNull()
    })

    it("jumps the Germ out of the box onto its cell as it lands", () => {
        expect(openAt("germ") + GERM_JUMP_SECONDS).toBeCloseTo(
            GERM_LAND_SECONDS
        )
        const to = vec2(4, 3)
        expect(germJump(reveal("germ", 0.1), to)).toEqual({ hidden: true })
        const mid = germJump(reveal("germ", 0.4), to)
        expect(mid.hidden).toBe(false)
        if (mid.hidden) return
        expect(mid.landed).toBe(false)
        expect(mid.dy).toBeLessThan(0)
        expect(mid.dx).toBeLessThan(0)
        expect(mid.scale).toBeLessThan(1)
        expect(germJump(reveal("germ", GERM_LAND_SECONDS + 0.01), to)).toEqual({
            hidden: false,
            landed: true,
            dx: 0,
            dy: 0,
            scale: 1,
        })
    })
})

describe("quakePanic", () => {
    it("trembles, looks about and hops, then blinks its sweat drop at the end", () => {
        const xs = new Set<number>()
        const looks = new Set<boolean | null>()
        let hopped = false
        for (let t = 0; t < QUAKE_SECONDS - QUAKE_WARN_SECONDS; t += 0.02) {
            const p = quakePanic(QUAKE_SECONDS - t, 0, false)
            xs.add(Math.sign(p.dx))
            looks.add(p.right)
            if (p.dy < 0) hopped = true
            expect(p.badge).toBe(true)
            expect(p.dust).not.toBeNull()
        }
        expect(xs).toEqual(new Set([1, -1]))
        expect(looks).toEqual(new Set([true, false]))
        expect(hopped).toBe(true)
        const end = [0.55, 0.45, 0.35, 0.25].map(
            (left) => quakePanic(left, 0, false).badge
        )
        expect(end).toContain(true)
        expect(end).toContain(false)
    })

    it("keeps still with reduced motion, the drop still showing", () => {
        expect(quakePanic(2, 3, true)).toEqual({
            dx: 0,
            dy: 0,
            right: null,
            badge: true,
            dust: null,
        })
    })
})

describe("hugeDotPalette", () => {
    it("takes every stage's own dot colours", () => {
        for (const [stage, style] of Object.entries(STAGE_STYLES)) {
            const palette = hugeDotPalette(style)
            const colours = Object.values(style.palette)
            const dotLetters = new Set(style.dot.join("").replace(/\./g, ""))
            const dotColours = [...dotLetters].map((l) => style.palette[l])
            // Its fill is the stage dot's.
            expect(dotColours, `stage ${stage}`).toContain(palette.C)
            for (const c of Object.values(palette)) {
                expect(c, `stage ${stage}`).toMatch(/^#[0-9a-f]{6}$/i)
            }
            expect(colours.length).toBeGreaterThan(0)
            expect(new Set(Object.values(palette)).size, `stage ${stage}`).toBe(
                3
            )
        }
    })

    it("matches the design page's stages 1, 4 and 10", () => {
        expect(hugeDotPalette(STAGE_STYLES[1])).toMatchObject({
            C: "#1f3b8a",
            S: "#6d8ae0",
        })
        expect(hugeDotPalette(STAGE_STYLES[4]).C).toBe(
            STAGE_STYLES[4].palette.Y
        )
        expect(hugeDotPalette(STAGE_STYLES[4]).R).toBe(
            STAGE_STYLES[4].palette.g
        )
        expect(hugeDotPalette(STAGE_STYLES[10]).C).toBe(
            STAGE_STYLES[10].palette.D
        )
        expect(HUGE_DOT_ICON.grid).toHaveLength(9)
    })
})
