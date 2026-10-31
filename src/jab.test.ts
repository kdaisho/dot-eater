import { describe, expect, it } from "vite-plus/test"
import {
    createJabs,
    FIST_BOUNCE,
    FIST_BOUNCE_SECONDS,
    fistBounce,
    jabLunge,
    JAB_LUNGE,
    JAB_SECONDS,
} from "./jab"
import { vec2 } from "./vec2"

describe("jabs", () => {
    it("last JAB_SECONDS, then are gone", () => {
        const jabs = createJabs()
        jabs.add(0, vec2(1, 0))
        expect(jabs.list).toEqual([
            { player: 0, facing: vec2(1, 0), age: 0, lunge: JAB_LUNGE },
        ])
        jabs.update(JAB_SECONDS / 2)
        expect(jabs.list).toHaveLength(1)
        jabs.update(JAB_SECONDS / 2)
        expect(jabs.list).toEqual([])
    })

    it("keeps one per player, the newest", () => {
        const jabs = createJabs()
        jabs.add(0, vec2(1, 0))
        jabs.add(1, vec2(-1, 0))
        jabs.update(0.05)
        jabs.add(0, vec2(0, 1))
        expect(
            jabs.list.map(({ player, facing, age }) => ({
                player,
                facing,
                age,
            }))
        ).toEqual([
            { player: 1, facing: vec2(-1, 0), age: 0.05 },
            { player: 0, facing: vec2(0, 1), age: 0 },
        ])
        jabs.clear()
        expect(jabs.list).toEqual([])
    })

    it("lunge out to JAB_LUNGE halfway and back", () => {
        const at = (age: number) =>
            jabLunge({ player: 0, facing: vec2(1, 0), age, lunge: JAB_LUNGE })
        expect(at(0)).toBe(0)
        expect(at(JAB_SECONDS / 2)).toBeCloseTo(JAB_LUNGE)
        expect(at(JAB_SECONDS / 4)).toBeLessThan(JAB_LUNGE)
        expect(at(JAB_SECONDS)).toBe(0)
    })

    it("don't lunge with reduced motion, from the next jab on", () => {
        const jabs = createJabs({ reduced: true })
        jabs.add(0, vec2(1, 0))
        jabs.update(JAB_SECONDS / 2)
        expect(jabLunge(jabs.list[0]!)).toBe(0)
        jabs.reduced = false
        jabs.add(1, vec2(1, 0))
        expect(jabs.list.map((j) => j.lunge)).toEqual([0, JAB_LUNGE])
    })

    // KDA-293, with the user: about a quarter of a cell over 0.12 s.
    it("bounce a blocked one's fist back, then out again", () => {
        expect(FIST_BOUNCE).toBe(0.25)
        expect(FIST_BOUNCE_SECONDS).toBe(0.12)
        expect(FIST_BOUNCE_SECONDS).toBeLessThan(JAB_SECONDS)
        const jabs = createJabs()
        jabs.add(0, vec2(1, 0))
        jabs.add(1, vec2(-1, 0))
        jabs.block(1)
        const [plain, blocked] = jabs.list
        expect(plain.blocked).toBeUndefined()
        expect(blocked.blocked).toBe(true)
        expect(fistBounce(plain)).toBe(0)
        expect(fistBounce(blocked)).toBeCloseTo(FIST_BOUNCE)
        jabs.update(FIST_BOUNCE_SECONDS / 2)
        expect(fistBounce(jabs.list[1]!)).toBeCloseTo(FIST_BOUNCE / 2)
        jabs.update(FIST_BOUNCE_SECONDS / 2)
        expect(fistBounce(jabs.list[1]!)).toBe(0)
    })

    it("bounce with reduced motion too: only the sprite's lunge stops", () => {
        const jabs = createJabs({ reduced: true })
        jabs.add(0, vec2(1, 0))
        jabs.block(0)
        expect(fistBounce(jabs.list[0]!)).toBeCloseTo(FIST_BOUNCE)
    })

    it("ignore a block for a player with no jab", () => {
        const jabs = createJabs()
        jabs.block(0)
        expect(jabs.list).toEqual([])
    })
})
