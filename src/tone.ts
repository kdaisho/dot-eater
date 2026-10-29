// The one building block of every sound (KDA-212): a single synthesized
// tone, chip style. Sound effects (sfx.ts) and music (music.ts) are lists of
// tones as plain data; the audio engine (audio.ts) is the only place that
// turns a tone into Web Audio nodes. No DOM access here.

// An oscillator shape, or "noise" (white noise through a band-pass filter
// centred on the tone's frequency, for hisses, crashes and drums).
export type Wave = "square" | "triangle" | "sawtooth" | "sine" | "noise"

export type Tone = {
    wave: Wave
    // Start, in seconds from the start of the sound it belongs to.
    at: number
    // Length in seconds.
    duration: number
    // Frequency in Hz at the start (the filter centre for noise).
    freq: number
    // Frequency at the end, swept exponentially; omitted for a steady pitch.
    freqEnd?: number
    // Peak level, 0–1, before the effects or music volume.
    volume: number
    // Seconds to rise from silence to the peak. Default DEFAULT_ATTACK.
    attack?: number
    // Omitted or false: fade out over the whole duration (a pluck, a blip).
    // True: stay at the peak, then a short RELEASE at the end (held notes).
    hold?: boolean
}

export const DEFAULT_ATTACK = 0.005
export const RELEASE = 0.03

// The quietest level an envelope fades to: exponential ramps can't reach 0.
export const SILENT = 0.0001

const SEMITONES: Readonly<Record<string, number>> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
}

// A note name ("C4", "F#3", "Bb5"; octave -1 to 9) as a MIDI note number
// (A4 is 69), or undefined for anything else.
export function noteNumber(name: string): number | undefined {
    const match = /^([A-G])([#b]?)(-1|[0-9])$/.exec(name)
    if (!match) return undefined
    const [, letter, accidental, octave] = match
    const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0
    return 12 * (Number(octave) + 1) + SEMITONES[letter] + shift
}

// A note name's frequency in Hz (equal temperament, A4 = 440). Throws on a
// name noteNumber doesn't know, so a typo in sound data fails loudly.
export function noteFreq(name: string): number {
    const midi = noteNumber(name)
    if (midi === undefined) throw new Error(`Unknown note: ${name}`)
    return 440 * 2 ** ((midi - 69) / 12)
}

// How long a sound made of these tones lasts, in seconds.
export function soundLength(tones: readonly Tone[]): number {
    return Math.max(0, ...tones.map((t) => t.at + t.duration))
}
