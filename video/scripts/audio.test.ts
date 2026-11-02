import { describe, expect, it } from "vite-plus/test"
import { SfxId } from "../../src/sfx"
import {
    encodeWav,
    peak,
    renderEffects,
    renderMusic,
    SAMPLE_RATE,
} from "./audio"

// The first sample louder than `threshold`.
function onset(samples: Float32Array, threshold = 1e-3): number {
    return samples.findIndex((s) => Math.abs(s) > threshold)
}

describe("renderEffects", () => {
    const cues = [
        { at: 0.25, id: SfxId.dot },
        // A noise sound, from the seeded noise buffer.
        { at: 0.5, id: SfxId.breathOwl },
    ]

    it("renders the same bytes every time", async () => {
        const a = encodeWav(await renderEffects(cues, 1, 1), SAMPLE_RATE)
        const b = encodeWav(await renderEffects(cues, 1, 1), SAMPLE_RATE)
        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    })

    it("plays each sound at its time", async () => {
        const samples = await renderEffects(cues, 1, 1)
        const first = onset(samples)
        expect(first).toBeGreaterThanOrEqual(0.25 * SAMPLE_RATE)
        // Within the tone's attack.
        expect(first).toBeLessThan(0.26 * SAMPLE_RATE)
        expect(peak(samples)).toBeLessThan(1)
    })

    it("is silent without cues", async () => {
        expect(peak(await renderEffects([], 0.5, 1))).toBe(0)
    })
})

describe("renderMusic", () => {
    it("renders a tune in its section, the same every time", async () => {
        const sections = [{ track: "stage1" as const, from: 0.5, to: 1.5 }]
        const a = await renderMusic(sections, 2, 0.5)
        const b = await renderMusic(sections, 2, 0.5)
        expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true)
        expect(onset(a)).toBeGreaterThanOrEqual(0.5 * SAMPLE_RATE)
        // Cut at the section's end.
        expect(peak(a.subarray(Math.ceil(1.5 * SAMPLE_RATE)))).toBe(0)
    })
})

describe("encodeWav", () => {
    it("writes a mono 16-bit PCM WAV, clipping beyond full scale", () => {
        const wav = encodeWav(Float32Array.from([0, 1, -1, 2, -0.5]), 48_000)
        const view = new DataView(wav.buffer)
        const text = (at: number) =>
            String.fromCharCode(...wav.subarray(at, at + 4))
        expect([text(0), text(8), text(12), text(36)]).toEqual([
            "RIFF",
            "WAVE",
            "fmt ",
            "data",
        ])
        expect(view.getUint32(4, true)).toBe(wav.length - 8)
        expect(view.getUint16(22, true)).toBe(1)
        expect(view.getUint32(24, true)).toBe(48_000)
        expect(view.getUint16(34, true)).toBe(16)
        expect(view.getUint32(40, true)).toBe(10)
        const samples = [0, 1, 2, 3, 4].map((i) =>
            view.getInt16(44 + i * 2, true)
        )
        expect(samples).toEqual([0, 32767, -32767, 32767, -16383])
    })
})
