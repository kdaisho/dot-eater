import { describe, expect, it } from "vite-plus/test"
import {
    CONFETTI_COLORS,
    CONFETTI_SECONDS,
    confettiBits,
} from "./pixelConfetti"

// The ending's pixel confetti (KDA-323).

describe("confettiBits", () => {
    it("is 2x2 and 3x1 bits in the title's colours", () => {
        const bits = confettiBits(0.5, "middle", 256, 224)
        expect(bits.length).toBeGreaterThan(50)
        for (const b of bits) {
            expect([`${b.w}x${b.h}`]).toEqual([
                expect.stringMatching(/^(2x2|3x1)$/),
            ])
            expect(CONFETTI_COLORS).toContain(b.color)
            expect(Number.isInteger(b.x) && Number.isInteger(b.y)).toBe(true)
        }
    })

    it("flips each bit as it falls", () => {
        const shape = (t: number) =>
            confettiBits(t, "middle", 256, 224).map((b) => b.w)
        const flipped = shape(0.5).filter((w, i) => w !== shape(0.6)[i])
        expect(flipped.length).toBeGreaterThan(10)
    })

    it("flies up from the middle, or from both bottom corners", () => {
        const middle = confettiBits(0.3, "middle", 256, 224)
        expect(middle.every((b) => b.y < 112)).toBe(true)
        const corners = confettiBits(0.05, "corners", 256, 224)
        expect(corners.some((b) => b.x < 40)).toBe(true)
        expect(corners.some((b) => b.x > 216)).toBe(true)
        expect(corners.every((b) => b.y > 150)).toBe(true)
    })

    it("fades out and is gone after CONFETTI_SECONDS", () => {
        expect(confettiBits(-0.01, "middle", 256, 224)).toEqual([])
        expect(confettiBits(1, "middle", 256, 224)[0]!.alpha).toBe(1)
        const late = confettiBits(CONFETTI_SECONDS - 0.4, "middle", 256, 224)
        expect(late[0]!.alpha).toBeCloseTo(0.5)
        expect(
            confettiBits(CONFETTI_SECONDS + 0.01, "middle", 256, 224)
        ).toEqual([])
    })

    it("is the same at the same moment, so a frame can be redrawn", () => {
        expect(confettiBits(1.2, "corners", 300, 200)).toEqual(
            confettiBits(1.2, "corners", 300, 200)
        )
    })
})
