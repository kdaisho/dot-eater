import { describe, expect, it } from "vite-plus/test"
import { fallbackBeats } from "./beats"
import {
    excerptFrames,
    fallbackFor,
    PROMO2_EXCERPT,
    SONG_GRIDS,
} from "./excerpts"
import { SONGS } from "./songs"

describe("excerptFrames", () => {
    // 120 bpm from 1 s: a bar is 2 s, 60 frames.
    const file = fallbackBeats({ bpm: 120, bars: 20, offset: 1 })
    const excerpt = {
        song: "test",
        fromBar: 4,
        toBar: 12,
        cues: { open: 4, lift: 6, hook: 8.5, end: 12 },
    }

    it("starts on the excerpt's first downbeat", () => {
        const frames = excerptFrames(file, excerpt, 30)
        expect(frames.start).toBe(9)
        expect(frames.duration).toBe(8 * 60)
        expect(frames.beats.barFrame(0)).toBe(0)
    })

    it("puts cues on their bars, and fractions on beats", () => {
        const frames = excerptFrames(file, excerpt, 30)
        expect(frames.cue("open")).toBe(0)
        expect(frames.cue("lift")).toBe(120)
        // Half a bar: two beats in.
        expect(frames.cue("hook")).toBe(4 * 60 + 30)
        expect(frames.bar(12)).toBe(frames.duration)
    })
})

describe("PROMO2_EXCERPT", () => {
    it("runs 16 bars, about 44 s, on the half-time grid without the song", () => {
        const frames = excerptFrames(
            fallbackFor(SONGS.promo2),
            PROMO2_EXCERPT,
            30
        )
        const bar = 240 / 86.9915
        // Half-time bar 8: 0.059 s + 8 bars of 2.759 s.
        expect(frames.start).toBeCloseTo(0.059 + 8 * bar, 2)
        expect(frames.duration / 30).toBeCloseTo(44.1, 1)
        // The hook lands at 0:44.20, where the analyser found the lift.
        expect(frames.start + frames.cue("hook") / 30).toBeCloseTo(44.2, 1)
        expect(frames.cue("endCard")).toBeLessThan(frames.cue("end"))
    })

    it("has a measured grid for each song", () => {
        expect(SONG_GRIDS[SONGS.promo]?.bpm).toBeCloseTo(97.43, 2)
        expect(fallbackFor("unknown").bpm).toBe(120)
    })
})
