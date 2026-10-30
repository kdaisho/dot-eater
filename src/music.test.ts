import { describe, expect, it } from "vite-plus/test"
import { levels } from "./levels"
import {
    compileTrack,
    DEFAULT_GATE,
    DRUM_KIT,
    heldTones,
    MUSIC_TRACK_IDS,
    STAGE_TRACKS,
    stageTrack,
    tonesInWindow,
    TRACKS,
    type Track,
} from "./music"
import { noteFreq } from "./tone"

// 120 bpm: an eighth-note step is 0.25 s, a bar 2 s.
const simple: Track = {
    bpm: 120,
    voices: [
        {
            kind: "notes",
            wave: "square",
            volume: 0.5,
            bars: ["C4 - . E4 . . G4 -"],
        },
        { kind: "drums", volume: 0.5, bars: ["k . . . s . . ."] },
    ],
}

describe("compileTrack", () => {
    it("turns notes and holds into tones, sorted by start", () => {
        const track = compileTrack(simple)
        expect(track.stepSeconds).toBe(0.25)
        expect(track.length).toBe(2)
        expect(track.tones.map((t) => [t.at, t.wave])).toEqual([
            [0, "square"],
            [0, "sine"],
            [0.75, "square"],
            [1, "noise"],
            [1.5, "square"],
        ])
        const [c] = track.tones
        expect(c.freq).toBe(noteFreq("C4"))
        expect(c.duration).toBeCloseTo(0.5 * DEFAULT_GATE)
        expect(c.volume).toBe(0.5)
    })

    it("scales each drum by the voice volume", () => {
        const kick = compileTrack(simple).tones[1]
        expect(kick.volume).toBe(DRUM_KIT.k.volume * 0.5)
        expect(kick.freq).toBe(DRUM_KIT.k.freq)
    })

    it("throws on mistakes in a tune", () => {
        const notes = (bars: string[]): Track => ({
            bpm: 120,
            voices: [{ kind: "notes", wave: "square", volume: 0.5, bars }],
        })
        expect(() => compileTrack(notes(["C4 . . ."]))).toThrow("4 steps")
        expect(() => compileTrack(notes(["- . . . . . . ."]))).toThrow(
            "holds nothing"
        )
        expect(() => compileTrack(notes(["X4 . . . . . . ."]))).toThrow(
            "Unknown note"
        )
        expect(() =>
            compileTrack({
                bpm: 120,
                voices: [
                    { kind: "drums", volume: 1, bars: ["z . . . . . . ."] },
                ],
            })
        ).toThrow("unknown drum")
        expect(() =>
            compileTrack({
                ...simple,
                voices: [
                    simple.voices[0],
                    { kind: "drums", volume: 1, bars: [] },
                ],
            })
        ).toThrow("0 bars, not 1")
        expect(() => compileTrack({ ...simple, bpm: 0 })).toThrow("bpm")
    })
})

describe("tonesInWindow", () => {
    const track = compileTrack(simple)
    const starts = (from: number, to: number) =>
        tonesInWindow(track, from, to).map((t) => t.at)

    it("picks the tones starting in the window", () => {
        expect(starts(0, 0.1)).toEqual([0, 0])
        expect(starts(0.1, 1)).toEqual([0.75])
        // The start is included, the end excluded.
        expect(starts(0.75, 1)).toEqual([0.75])
        expect(starts(0.5, 0.75)).toEqual([])
    })

    it("carries on past the loop point in track time", () => {
        expect(starts(1.9, 2.1)).toEqual([2, 2])
        expect(starts(4.5, 6.8)).toEqual([4.75, 5, 5.5, 6, 6, 6.75])
    })

    it("is empty for an empty or backwards window", () => {
        expect(starts(1, 1)).toEqual([])
        expect(starts(1, 0.5)).toEqual([])
    })

    it("gives each tone once when windows tile", () => {
        const tiled: number[] = []
        for (let i = 0; i < 48; i++)
            tiled.push(...starts(i * 0.125, (i + 1) * 0.125))
        expect(tiled).toEqual(starts(0, 6))
    })
})

describe("heldTones", () => {
    // 120 bpm: C4 held 0–0.9 s, a sweep from 100 to 400 Hz fading 0–1 s.
    const track = compileTrack({
        bpm: 120,
        voices: [
            {
                kind: "notes",
                wave: "square",
                volume: 0.5,
                hold: true,
                gate: 0.9,
                bars: ["C4 - - - . . . ."],
            },
        ],
    })
    const sweep = {
        length: 2,
        stepSeconds: 0.25,
        tones: [
            {
                wave: "sine" as const,
                at: 0,
                duration: 1,
                freq: 100,
                freqEnd: 400,
                volume: 0.5,
            },
        ],
    }

    it("cuts a note held at the position to what is left of it", () => {
        const [c] = heldTones(track, 0.5)
        expect(c.at).toBe(0.5)
        expect(c.duration).toBeCloseTo(0.4)
        expect(c.freq).toBe(noteFreq("C4"))
        expect(c.volume).toBe(0.5)
    })

    it("picks up a sweep and a fade where they were", () => {
        const [t] = heldTones(sweep, 0.5)
        expect(t.freq).toBeCloseTo(200)
        expect(t.duration).toBeCloseTo(0.5)
        expect(t.volume).toBeLessThan(0.5)
    })

    it("has nothing between notes, past their end, or faded out", () => {
        expect(heldTones(track, 1.5)).toEqual([])
        expect(heldTones(track, 0.9)).toEqual([])
        expect(heldTones(sweep, 0.99)).toEqual([])
    })

    it("finds notes held across loops", () => {
        expect(heldTones(track, 2.5)[0].at).toBe(2.5)
    })
})

describe("TRACKS", () => {
    it("has a tune for the title and every stage, each compiling", () => {
        expect(Object.keys(TRACKS).sort()).toEqual([...MUSIC_TRACK_IDS].sort())
        for (const id of MUSIC_TRACK_IDS) {
            const track = compileTrack(TRACKS[id])
            expect(track.tones.length, id).toBeGreaterThan(0)
            for (const tone of track.tones) {
                expect(tone.freq, id).toBeGreaterThan(0)
                expect(tone.volume, id).toBeGreaterThan(0)
                expect(tone.volume, id).toBeLessThanOrEqual(1)
                expect(tone.duration, id).toBeGreaterThan(0)
            }
        }
    })

    it("keeps each loop between 4 and 30 seconds", () => {
        for (const id of MUSIC_TRACK_IDS) {
            const { length } = compileTrack(TRACKS[id])
            expect(length, id).toBeGreaterThanOrEqual(4)
            expect(length, id).toBeLessThanOrEqual(30)
        }
    })
})

describe("stageTrack", () => {
    it("gives every stage its own tune", () => {
        expect(STAGE_TRACKS).toHaveLength(levels.length)
        expect(new Set(STAGE_TRACKS).size).toBe(STAGE_TRACKS.length)
        expect(levels.map((_, i) => stageTrack(i))).toEqual([
            "stage1",
            "stage2",
            "stage3",
            "stage4",
            "stage5",
            "stage6",
            "stage7",
        ])
    })

    it("wraps stages past the list", () => {
        expect(stageTrack(STAGE_TRACKS.length)).toBe("stage1")
        expect(stageTrack(-1)).toBe(STAGE_TRACKS[STAGE_TRACKS.length - 1])
    })
})
