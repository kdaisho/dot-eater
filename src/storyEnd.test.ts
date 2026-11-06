import { describe, expect, it } from "vite-plus/test"
import {
    STORY_END,
    storyEndLines,
    storyEndSeconds,
    storyEndTyped,
    typedLine,
} from "./storyEnd"

// The story end's ALL CLEAR card (KDA-323): its lines and its timing.

const card = { difficulty: "hard", runTotal: 1000, best: 1200 } as const

describe("storyEndLines", () => {
    it("shows the difficulty, the run total and the best, in upper case", () => {
        expect(storyEndLines(card)).toEqual([
            "HARD",
            "RUN TOTAL 1000",
            "BEST 1200",
        ])
        expect(storyEndLines({ difficulty: "superHard", runTotal: 5 })).toEqual(
            ["SUPER HARD", "RUN TOTAL 5"]
        )
    })

    it("has no thanks and no Continue", () => {
        expect(storyEndLines(card).join(" ")).not.toMatch(/THANK|CONTINUE/)
    })
})

describe("typing the lines", () => {
    it("types each line at 40 letters a second, from 1 s, 1.15 s and 1.5 s", () => {
        expect(STORY_END.typing).toBe(40)
        expect(typedLine("HARD", 0, 0.99)).toBe("")
        expect(typedLine("HARD", 0, 1)).toBe("")
        expect(typedLine("HARD", 0, 1.025)).toBe("H")
        expect(typedLine("HARD", 0, 1.1)).toBe("HARD")
        expect(typedLine("RUN TOTAL 1000", 1, 1.15)).toBe("")
        expect(typedLine("RUN TOTAL 1000", 1, 1.5)).toBe("RUN TOTAL 1000")
        expect(typedLine("BEST 1200", 2, 1.5)).toBe("")
    })

    it("has every letter there when the last one is due", () => {
        const lines = storyEndLines(card)
        const at = storyEndTyped(lines)
        lines.forEach((line, i) => expect(typedLine(line, i, at)).toBe(line))
        expect(typedLine(lines[2]!, 2, at - 0.01)).not.toBe(lines[2])
    })
})

describe("storyEndSeconds", () => {
    it("holds 3 s after the last letter appears", () => {
        expect(STORY_END.hold).toBe(3)
        // BEST 1200: 9 letters from 1.5 s, the last at 1.725 s.
        expect(storyEndTyped(storyEndLines(card))).toBeCloseTo(1.725)
        expect(storyEndSeconds(card)).toBeCloseTo(4.725)
    })

    it("ends on the run total when there is no best", () => {
        // RUN TOTAL 1000: 14 letters from 1.15 s, the last at 1.5 s.
        const noBest = { difficulty: "easy", runTotal: 1000 } as const
        expect(storyEndSeconds(noBest)).toBeCloseTo(4.5)
    })
})
