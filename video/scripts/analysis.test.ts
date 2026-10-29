import { describe, expect, it } from "vite-plus/test"
import {
    analyse,
    checkerboardNovelty,
    fft,
    findRepeats,
    fold,
    pickPeaks,
    tempoByAutocorrelation,
} from "./analysis"

const RATE = 22_050

// A seeded noise source, so the synthetic songs are the same every run.
function noise(seed: number) {
    let s = seed >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 2 ** 31 - 1
    }
}

// A synthetic song: `bars` bars of 4/4 at `bpm`, a kick (a falling 60 Hz
// thump) on beats 1 and 3 and a snare (a noise burst) on 2 and 4, after
// `pickup` beats before the first downbeat at `start` s. Bars in `loud`
// add a held bass and a bright pad, about 10 dB up.
function song({
    bpm,
    bars,
    start = 0.25,
    pickup = 0,
    loud = (_bar: number) => false,
}: {
    bpm: number
    bars: number
    start?: number
    pickup?: number
    loud?: (bar: number) => boolean
}) {
    const beat = 60 / bpm
    const first = start + pickup * beat
    const length = Math.ceil((first + bars * 4 * beat + 1) * RATE)
    const out = new Float32Array(length)
    const rand = noise(7)
    const hit = (at: number, kind: "kick" | "snare", gain: number) => {
        const from = Math.round(at * RATE)
        for (let i = 0; i < 0.12 * RATE && from + i < length; i++) {
            const t = i / RATE
            const env = Math.exp(-t * 30)
            // A kick is a falling thump with a short click of attack, as
            // a real one has (without it the thump alone barely shows in
            // the spectral flux).
            const sweep = 60 + 80 * Math.exp(-t * 40)
            out[from + i] +=
                kind === "kick"
                    ? gain * env * Math.sin(2 * Math.PI * sweep * t) +
                      (t < 0.006 ? gain * 0.8 * rand() : 0)
                    : gain * 0.6 * env * rand()
        }
    }
    for (let b = -pickup; b < bars * 4; b++) {
        if (b < 0 && start + (b + pickup) * beat < 0) continue
        const at = first + b * beat
        const phase = ((b % 4) + 4) % 4
        hit(at, phase % 2 === 0 ? "kick" : "snare", 0.4)
    }
    for (let bar = 0; bar < bars; bar++) {
        if (!loud(bar)) continue
        const from = Math.round((first + bar * 4 * beat) * RATE)
        const to = Math.round((first + (bar + 1) * 4 * beat) * RATE)
        for (let i = from; i < to && i < length; i++) {
            const t = i / RATE
            out[i] +=
                0.35 * Math.sin(2 * Math.PI * 55 * t) +
                0.12 * Math.sin(2 * Math.PI * 880 * t) +
                0.05 * rand()
        }
    }
    return { samples: out, first, beat }
}

describe("fft", () => {
    it("finds a sine's bin", () => {
        const n = 64
        const re = Float64Array.from({ length: n }, (_, i) =>
            Math.cos((2 * Math.PI * 5 * i) / n)
        )
        const im = new Float64Array(n)
        fft(re, im)
        const mags = Array.from(re, (r, k) => Math.hypot(r, im[k]))
        expect(mags[5]).toBeCloseTo(n / 2)
        expect(mags[59]).toBeCloseTo(n / 2)
        expect(mags[4]).toBeCloseTo(0)
    })
})

describe("tempoByAutocorrelation", () => {
    // An onset envelope with a pulse on every beat and a weaker one on
    // every eighth, at 100 frames a second.
    const envelope = (bpm: number, seconds = 30) => {
        const rate = 100
        const env = new Float64Array(seconds * rate)
        const beat = (60 / bpm) * rate
        for (let k = 0; k * beat < env.length; k++) {
            env[Math.round(k * beat)] = 1
            const and = Math.round((k + 0.5) * beat)
            if (and < env.length) env[and] = 0.4
        }
        return env
    }

    it("finds the beat, not its double or half", () => {
        expect(tempoByAutocorrelation(envelope(100), 100)).toBeCloseTo(100, 0)
        expect(tempoByAutocorrelation(envelope(128), 100)).toBeCloseTo(128, 0)
        expect(tempoByAutocorrelation(envelope(87), 100)).toBeCloseTo(87, 0)
    })
})

describe("fold", () => {
    it("stacks a pulse train sharply at its period and phase", () => {
        const rate = 200
        const env = new Float64Array(20 * rate)
        for (let t = 0.3; t < 20; t += 0.5) env[Math.round(t * rate)] = 1
        const right = fold(env, rate, 0.5)
        const wrong = fold(env, rate, 0.51)
        expect(right.strength).toBeGreaterThan(wrong.strength * 2)
        expect(right.phase).toBeCloseTo(0.3, 2)
    })
})

describe("pickPeaks", () => {
    it("keeps the strongest peaks far enough apart, in order", () => {
        const curve = [0, 1, 0, 0.8, 0, 0, 0, 0.9, 0, 0.2, 0]
        expect(pickPeaks(curve, 3, 0.5, 1)).toEqual([1, 7])
    })
})

describe("checkerboardNovelty", () => {
    it("peaks where one block of alike rows meets another", () => {
        const rows = 16
        const sim = Array.from({ length: rows }, (_, i) =>
            Array.from({ length: rows }, (_, j) => (i < 8 === j < 8 ? 1 : -1))
        )
        const novelty = checkerboardNovelty(sim, 4)
        const best = novelty.indexOf(Math.max(...novelty))
        expect(best).toBe(8)
    })
})

describe("findRepeats", () => {
    it("finds every return of the passage that repeats", () => {
        // Bars as one-hot vectors: a verse (unique bars) then a hook of 4
        // bars, twice, then a verse and the hook again.
        const hook = [0, 1, 2, 3].map((k) =>
            Array.from({ length: 12 }, (_, d) => (d === k ? 1 : 0))
        )
        const other = (seed: number) =>
            Array.from({ length: 12 }, (_, d) => Math.sin(seed * 7.3 + d * 1.7))
        const bars = [
            ...[1, 2, 3, 4].map(other),
            ...hook,
            ...[5, 6, 7, 8].map(other),
            ...hook,
            ...[9, 10, 11, 12].map(other),
            ...hook,
        ]
        const starts = Array.from({ length: 6 }, (_, i) => i * 4)
        const repeats = findRepeats(bars, starts, { length: 4 })
        expect(repeats.windows.map((w) => w.start)).toEqual([4, 12, 20])
    })

    it("finds none in a song that never repeats", () => {
        const bars = Array.from({ length: 16 }, (_, i) =>
            Array.from({ length: 12 }, (_, d) => (d === i % 12 ? 1 : -0.1))
        )
        expect(findRepeats(bars, [0, 4, 8], { length: 4 }).windows).toEqual([])
    })
})

describe("analyse", () => {
    it("measures a click track's tempo, downbeats and loud sections", () => {
        // 24 bars at 128 bpm after a 2-beat pickup; bars 8–15 are loud.
        const { samples, first, beat } = song({
            bpm: 128,
            bars: 24,
            pickup: 2,
            loud: (bar) => bar >= 8 && bar < 16,
        })
        const beats = analyse(samples, RATE, { track: "click" })
        expect(beats.bpm).toBeCloseTo(128, 1)
        expect(beats.beatPeriod).toBeCloseTo(beat, 3)
        // The first downbeat, not the pickup.
        expect(Math.abs(beats.downbeats[0] - first)).toBeLessThan(0.02)
        expect(beats.beats.length).toBeGreaterThanOrEqual(24 * 4)
        expect(beats.bars).toHaveLength(beats.downbeats.length)
        // The loud bars start a drop on bar 8 and end on bar 16.
        const drop = beats.sections.find((s) => s.label === "drop")
        expect(drop).toMatchObject({ startBar: 8, endBar: 16 })
        expect(beats.drop.bar).toBe(8)
        expect(beats.drop.time).toBeCloseTo(beats.downbeats[8], 3)
        expect(beats.sections[0]).toMatchObject({ label: "intro", startBar: 0 })
        expect(beats.bars[10].loudness).toBeGreaterThan(beats.bars[4].loudness)
    })

    it("snaps every section to bars, back to back", () => {
        const { samples } = song({
            bpm: 100,
            bars: 20,
            loud: (bar) => bar >= 6 && bar < 14,
        })
        const beats = analyse(samples, RATE)
        expect(beats.bpm).toBeCloseTo(100, 1)
        for (const [i, s] of beats.sections.entries()) {
            expect(s.start).toBe(beats.downbeats[s.startBar])
            if (i > 0) expect(s.startBar).toBe(beats.sections[i - 1].endBar)
        }
        expect(beats.sections.at(-1)?.endBar).toBe(beats.downbeats.length)
    })
})
