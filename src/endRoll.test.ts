import { describe, expect, it } from "vite-plus/test"
import { AiType } from "./constants"
import {
    CAST,
    cardStage,
    END_ROLL,
    endingKind,
    endRollPhase,
    endRollPress,
    FINALE_AT,
    scale2x,
    SKIP_TO,
    STAFF,
    staffAt,
    lampPower,
    ufoAt,
    UFO_CROSSING,
    UFO_PASSES,
} from "./endRoll"
import { update, type FlowDeps, type Screen, type TickInput } from "./flow"
import type { Action } from "./input"
import { emptyProgress } from "./progress"
import { ANIMAL_IDS } from "./roster"
import { vec2 } from "./vec2"

describe("CAST", () => {
    it("has every hero, every enemy and the boss, heroes first, boss last", () => {
        const animals = CAST.flatMap((c) =>
            c.who.kind === "animal" ? [c.who.id] : []
        )
        const enemies = CAST.flatMap((c) =>
            c.who.kind === "enemy" ? [c.who.ai] : []
        )
        expect(animals).toEqual([...ANIMAL_IDS])
        expect([...enemies].sort((a, b) => a - b)).toEqual(
            Object.values(AiType).sort((a, b) => a - b)
        )
        expect(
            CAST.slice(0, ANIMAL_IDS.length).every(
                (c) => c.who.kind === "animal"
            )
        ).toBe(true)
        expect(CAST.at(-1)?.who.kind).toBe("boss")
    })

    it("keeps every line within the 256 px screen (32 characters)", () => {
        for (const c of CAST) {
            for (const text of [c.name, c.ability, c.line])
                expect(text.length, text).toBeLessThanOrEqual(30)
        }
        for (const { role, names } of STAFF) {
            for (const text of [role, ...names])
                expect(text.length, text).toBeLessThanOrEqual(30)
        }
    })
})

describe("endRollPhase", () => {
    it("runs the cards one by one, then the finale, then THE END", () => {
        expect(endRollPhase(0)).toEqual({ kind: "opening", t: 0 })
        expect(endRollPhase(END_ROLL.start)).toEqual({
            kind: "card",
            index: 0,
            u: 0,
        })
        const second = endRollPhase(END_ROLL.start + END_ROLL.perCard + 1)
        expect(second).toMatchObject({ kind: "card", index: 1 })
        expect(endRollPhase(FINALE_AT - 0.01)).toMatchObject({
            kind: "card",
            index: CAST.length - 1,
        })
        expect(endRollPhase(FINALE_AT)).toEqual({ kind: "finale", v: 0 })
        expect(endRollPhase(END_ROLL.ending)).toEqual({ kind: "fade", p: 0 })
        const ending = endRollPhase(SKIP_TO)
        expect(ending.kind).toBe("ending")
        if (ending.kind === "ending") expect(ending.u).toBeCloseTo(0, 9)
    })

    it("gives the cards time before THE END for the staff", () => {
        expect(FINALE_AT).toBeLessThan(END_ROLL.ending - 15)
    })
})

describe("cardStage", () => {
    it("slides in, rests, then slides out", () => {
        expect(cardStage(0)).toBe("in")
        expect(cardStage(END_ROLL.slideIn)).toBe("rest")
        expect(cardStage(END_ROLL.perCard - END_ROLL.slideOut)).toBe("rest")
        expect(cardStage(END_ROLL.perCard - 0.01)).toBe("out")
    })
})

describe("staffAt", () => {
    it("shows each staff credit in turn before THE END", () => {
        expect(staffAt(0)).toBeUndefined()
        const seen = new Set<number>()
        for (let v = 0; v < END_ROLL.ending - FINALE_AT; v += 0.1) {
            const at = staffAt(v)
            if (at) seen.add(at.index)
        }
        expect([...seen]).toEqual(STAFF.map((_, i) => i))
    })
})

describe("endRollPress", () => {
    it("skips during the roll, waits, then leaves", () => {
        expect(endRollPress(0)).toBe("skip")
        expect(endRollPress(END_ROLL.ending - 0.01)).toBe("skip")
        expect(endRollPress(SKIP_TO)).toBe("none")
        expect(endRollPress(SKIP_TO + END_ROLL.endingReady)).toBe("leave")
    })
})

describe("endingKind", () => {
    it("changes THE END with the difficulty", () => {
        expect(endingKind("easy")).toBe("plain")
        expect(endingKind("medium")).toBe("plain")
        expect(endingKind("hard")).toBe("party")
        expect(endingKind("superHard")).toBe("true")
    })
})

describe("scale2x", () => {
    it("doubles a sprite, keeping a solid shape's inside solid", () => {
        expect(scale2x(["A"])).toEqual(["AA", "AA"])
        const big = scale2x(["AAA", "AAA", "AAA"])
        expect(big).toHaveLength(6)
        // Only the outer corners round off.
        expect(big[0]).toBe(".AAAA.")
        expect(big.slice(1, 5)).toEqual(Array(4).fill("AAAAAA"))
    })

    it("rounds a diagonal into a smooth line", () => {
        expect(scale2x(["A.", ".A"])).toEqual(["AA..", "AAA.", ".AAA", "..AA"])
    })

    it("cuts the corners of an outlined block", () => {
        expect(scale2x(["AB", "CD"])).toEqual([".AB.", "AABB", "CCDD", ".CD."])
    })
})

// The end roll in the screen flow (flow.ts).
describe("the endRoll screen", () => {
    function input(actions: readonly Action[] = [], player = 0): TickInput {
        return {
            wasPressed: (action, p = 0) =>
                p === player && actions.includes(action),
            move: () => ({ held: [], pressed: vec2(0, 0) }),
        }
    }
    const deps = (dt = 0.5): FlowDeps => ({
        levels: [],
        progress: emptyProgress(),
        dt,
        random: () => 0,
    })
    const roll = (seconds = 0): Extract<Screen, { kind: "endRoll" }> => ({
        kind: "endRoll",
        mode: "solo",
        difficulty: "hard",
        elapsed: { seconds },
    })

    it("plays on by itself", () => {
        const screen = roll()
        expect(update(screen, input(), deps(0.5))).toBe(screen)
        expect(update(screen, input(), deps(0.5))).toBe(screen)
        expect(screen).toMatchObject({ elapsed: { seconds: 1 } })
    })

    it("follows the music's clock while there is one", () => {
        const screen = roll(3)
        const music = { ...deps(0.5), endRollClock: 20 }
        expect(update(screen, input(), music)).toBe(screen)
        expect(screen.elapsed.seconds).toBe(20)
    })

    it("keeps its own time after a skip, whatever the music says", () => {
        const screen = { ...roll(SKIP_TO), skipped: true }
        update(screen, input(), { ...deps(0.5), endRollClock: 20 })
        expect(screen.elapsed.seconds).toBe(SKIP_TO + 0.5)
    })

    it("skips to THE END on confirm or pause", () => {
        for (const action of ["confirm", "pause"] as const) {
            expect(update(roll(10), input([action]), deps(0))).toEqual({
                ...roll(),
                elapsed: { seconds: SKIP_TO },
                skipped: true,
            })
        }
    })

    it("takes player 2's press in co-op", () => {
        const coop: Screen = { ...roll(10), mode: "coop" }
        expect(update(coop, input(["confirm"], 1), deps(0))).toMatchObject({
            elapsed: { seconds: SKIP_TO },
        })
    })

    it("ignores a press as THE END comes on, then goes to the title", () => {
        const screen = roll(SKIP_TO)
        expect(update(screen, input(["confirm"]), deps(0))).toBe(screen)
        const later = roll(SKIP_TO + END_ROLL.endingReady)
        expect(update(later, input(["confirm"]), deps(0))).toEqual({
            kind: "title",
            mode: "solo",
        })
    })

    it("ignores other buttons", () => {
        const screen = roll(10)
        expect(
            update(screen, input(["breath", "punch", "left"]), deps(0))
        ).toBe(screen)
    })
})

describe("lampPower", () => {
    const samples = Array.from({ length: 8600 }, (_, i) => lampPower(i / 100))
    it("is full most of the time", () => {
        const full = samples.filter((p) => p === 1).length
        expect(full / samples.length).toBeGreaterThan(0.9)
    })
    it("stutters now and then over the roll", () => {
        let stutters = 0
        samples.forEach((p, i) => {
            if (p < 1 && (i === 0 || samples[i - 1] === 1)) stutters++
        })
        // Several stutters, each a few quick cuts.
        expect(stutters).toBeGreaterThan(20)
        expect(samples.every((p) => p === 1 || p === 0.25)).toBe(true)
    })
})

describe("ufoAt", () => {
    it("crosses right to left at each pass, quickly", () => {
        for (const at of UFO_PASSES) {
            expect(ufoAt(at)).toBe(0)
            expect(ufoAt(at + UFO_CROSSING / 2)).toBeCloseTo(0.5)
            expect(ufoAt(at + UFO_CROSSING + 0.001)).toBeUndefined()
            expect(ufoAt(at - 0.01)).toBeUndefined()
        }
        expect(UFO_CROSSING).toBeLessThan(1)
    })
})
