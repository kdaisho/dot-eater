import { describe, expect, it } from "vite-plus/test"
import { BREATHS } from "./breaths"
import { BOSS_BREATH_WIND_UP } from "./constants"
import { ANIMAL_IDS } from "./roster"
import { BREATH_SFX, breathSfx, SFX, SFX_IDS, SfxId } from "./sfx"
import { soundLength, type Tone } from "./tone"

// What the engine needs to play a tone (exponential ramps need positive
// levels and frequencies).
function expectPlayable(tone: Tone) {
    expect(tone.at).toBeGreaterThanOrEqual(0)
    expect(tone.duration).toBeGreaterThan(0)
    expect(tone.freq).toBeGreaterThan(0)
    expect(Number.isFinite(tone.freq)).toBe(true)
    if (tone.freqEnd !== undefined) expect(tone.freqEnd).toBeGreaterThan(0)
    expect(tone.volume).toBeGreaterThan(0)
    expect(tone.volume).toBeLessThanOrEqual(1)
    if (tone.attack !== undefined) {
        expect(tone.attack).toBeGreaterThanOrEqual(0)
        expect(tone.attack).toBeLessThanOrEqual(tone.duration)
    }
}

describe("SFX", () => {
    it("defines every id with playable tones", () => {
        for (const id of SFX_IDS) {
            const tones = SFX[id]
            expect(tones.length, id).toBeGreaterThan(0)
            tones.forEach(expectPlayable)
        }
    })

    it("has no definition without an id", () => {
        expect(Object.keys(SFX).sort()).toEqual([...SFX_IDS].sort())
    })

    it("keeps effects short, the dot shortest", () => {
        for (const id of SFX_IDS)
            expect(soundLength(SFX[id]), id).toBeLessThanOrEqual(2)
        // The dot plays several times a second.
        expect(soundLength(SFX[SfxId.dot])).toBeLessThanOrEqual(0.1)
    })
})

describe("the hurt sound", () => {
    it("is shorter than the knockout's", () => {
        expect(soundLength(SFX[SfxId.hurt])).toBeLessThan(
            soundLength(SFX[SfxId.caught])
        )
    })
})

describe("the boss's breath sounds", () => {
    it("rumble low through about the wind-up, then roar", () => {
        expect(soundLength(SFX[SfxId.bossWindUp])).toBeCloseTo(
            BOSS_BREATH_WIND_UP,
            1
        )
        for (const id of [SfxId.bossWindUp, SfxId.bossBreath]) {
            const lowest = Math.min(...SFX[id].map((t) => t.freq))
            expect(lowest, id).toBeLessThan(200)
        }
        expect(SfxId.bossWindUp).not.toBe(SfxId.bossBreath)
    })
})

describe("breath sounds", () => {
    it("gives every animal with a breath its own sound", () => {
        expect(Object.keys(BREATH_SFX).sort()).toEqual(
            Object.keys(BREATHS).sort()
        )
        const ids = ANIMAL_IDS.map(breathSfx)
        expect(new Set(ids).size).toBe(ANIMAL_IDS.length)
        for (const id of ids) expect(SFX[id].length).toBeGreaterThan(0)
    })

    it("names breath sounds after the animal", () => {
        for (const animal of ANIMAL_IDS)
            expect(breathSfx(animal)).toBe(`breath.${animal}`)
    })
})
