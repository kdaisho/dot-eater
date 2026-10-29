// Renders the promo's sound (src/soundtrack.ts) offline, through the game's
// own tone code (src/audio.ts's scheduleTone), with node-web-audio-api's
// OfflineAudioContext: a Web Audio implementation for Node that renders
// faster than real time. Everything is seeded, so the same soundtrack
// renders to the same bytes every time.
import { OfflineAudioContext } from "node-web-audio-api"
import {
    createNoise,
    scheduleTone,
    type AudioContextLike,
} from "../../src/audio.ts"
import { compileTrack, TRACKS, tonesInWindow } from "../../src/music.ts"
import { seededRandom } from "../../src/replay.ts"
import { SFX } from "../../src/sfx.ts"
import type { Tone } from "../../src/tone.ts"
import type { MusicSection, SfxCue } from "../src/soundtrack.ts"

export const SAMPLE_RATE = 48_000
// Seeds the noise the noise tones (breaths, drums) loop over.
export const NOISE_SEED = 253
// Seconds a tune fades out over where its section ends.
export const SECTION_FADE = 0.05

type Graph = {
    context: AudioContextLike & { startRendering(): Promise<AudioBuffer> }
    noise: AudioBuffer
}

function graph(seconds: number): Graph {
    const context = new OfflineAudioContext({
        numberOfChannels: 1,
        length: Math.ceil(seconds * SAMPLE_RATE),
        sampleRate: SAMPLE_RATE,
    }) as unknown as Graph["context"]
    return { context, noise: createNoise(context, seededRandom(NOISE_SEED)) }
}

async function render({ context }: Graph): Promise<Float32Array> {
    const buffer = await context.startRendering()
    return Float32Array.from(buffer.getChannelData(0))
}

// The sound effects of `cues`, `seconds` long, at `gain`.
export async function renderEffects(
    cues: readonly SfxCue[],
    seconds: number,
    gain: number
): Promise<Float32Array> {
    const g = graph(seconds)
    const bus = g.context.createGain()
    bus.gain.value = gain
    bus.connect(g.context.destination)
    for (const cue of cues) {
        for (const tone of SFX[cue.id] as readonly Tone[])
            scheduleTone(g.context, tone, cue.at, bus, g.noise)
    }
    return render(g)
}

// The game's tunes in `sections`, `seconds` long, at `gain`.
export async function renderMusic(
    sections: readonly MusicSection[],
    seconds: number,
    gain: number
): Promise<Float32Array> {
    const g = graph(seconds)
    for (const section of sections) {
        const bus = g.context.createGain()
        const fade = Math.max(section.from, section.to - SECTION_FADE)
        bus.gain.setValueAtTime(gain, 0)
        bus.gain.setValueAtTime(gain, fade)
        bus.gain.linearRampToValueAtTime(0, section.to)
        bus.connect(g.context.destination)
        const track = compileTrack(TRACKS[section.track])
        for (const tone of tonesInWindow(track, 0, section.to - section.from))
            scheduleTone(g.context, tone, section.from, bus, g.noise)
    }
    return render(g)
}

// The loudest sample, as a share of full scale.
export function peak(samples: Float32Array): number {
    let max = 0
    for (const s of samples) max = Math.max(max, Math.abs(s))
    return max
}

// `samples` (-1–1, clipped beyond) as a mono 16-bit PCM WAV file.
export function encodeWav(
    samples: Float32Array,
    sampleRate: number
): Uint8Array {
    const bytes = new Uint8Array(44 + samples.length * 2)
    const view = new DataView(bytes.buffer)
    const text = (at: number, s: string) => {
        for (let i = 0; i < s.length; i++)
            view.setUint8(at + i, s.charCodeAt(i))
    }
    text(0, "RIFF")
    view.setUint32(4, 36 + samples.length * 2, true)
    text(8, "WAVE")
    text(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, 1, true) // mono
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    text(36, "data")
    view.setUint32(40, samples.length * 2, true)
    for (const [i, s] of samples.entries()) {
        const v = Math.max(-1, Math.min(1, s))
        view.setInt16(44 + i * 2, Math.round(v * 32767), true)
    }
    return bytes
}
