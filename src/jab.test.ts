import { describe, expect, it } from "vite-plus/test"
import { createJabs, jabLunge, JAB_LUNGE, JAB_SECONDS } from "./jab"
import { vec2 } from "./vec2"

describe("jabs", () => {
    it("last JAB_SECONDS, then are gone", () => {
        const jabs = createJabs()
        jabs.add(0, vec2(1, 0))
        expect(jabs.list).toEqual([{ player: 0, facing: vec2(1, 0), age: 0 }])
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
        expect(jabs.list).toEqual([
            { player: 1, facing: vec2(-1, 0), age: 0.05 },
            { player: 0, facing: vec2(0, 1), age: 0 },
        ])
        jabs.clear()
        expect(jabs.list).toEqual([])
    })

    it("lunge out to JAB_LUNGE halfway and back", () => {
        const at = (age: number) =>
            jabLunge({ player: 0, facing: vec2(1, 0), age })
        expect(at(0)).toBe(0)
        expect(at(JAB_SECONDS / 2)).toBeCloseTo(JAB_LUNGE)
        expect(at(JAB_SECONDS / 4)).toBeLessThan(JAB_LUNGE)
        expect(at(JAB_SECONDS)).toBe(0)
    })
})
