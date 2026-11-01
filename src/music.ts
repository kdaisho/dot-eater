// Background music as data (KDA-212): one short looping chip tune per stage
// and one for the title, written in a tiny text notation and compiled to
// tones (see tone.ts). `tonesInWindow` picks the tones that start in a span
// of track time; the audio engine (audio.ts) calls it a little ahead of the
// AudioContext clock (lookahead scheduling). No DOM access here.
//
// Notation: a voice is a list of bars, each STEPS_PER_BAR tokens (eighth
// notes) separated by spaces.
// - Notes voice: a note name ("C4", "F#3", "Bb2") starts a note, "-" holds
//   the note before it one more step, "." is a rest.
// - Drums voice: "k" kick, "s" snare, "h" hi-hat (see DRUM_KIT), "." a rest.
// Every voice of a track has the same number of bars; the track loops.

import { noteFreq, SILENT, type Tone, type Wave } from "./tone"

export const STEPS_PER_BEAT = 2
export const STEPS_PER_BAR = 8

export type NotesVoice = {
    kind: "notes"
    wave: Wave
    // Peak level of each note, 0–1.
    volume: number
    // Hold notes at full level (pads, held leads) instead of fading them.
    hold?: boolean
    // Share of each note's length that sounds, so repeated notes separate.
    // Default DEFAULT_GATE.
    gate?: number
    bars: readonly string[]
}

export type DrumsVoice = {
    kind: "drums"
    // Scales every drum's own volume.
    volume: number
    bars: readonly string[]
}

export type Voice = NotesVoice | DrumsVoice

export type Track = {
    bpm: number
    voices: readonly Voice[]
}

export const DEFAULT_GATE = 0.9

export type Drum = "k" | "s" | "h"

// One hit of each drum, at full voice volume.
export const DRUM_KIT: Readonly<Record<Drum, Omit<Tone, "at">>> = {
    k: { wave: "sine", duration: 0.15, freq: 150, freqEnd: 45, volume: 0.9 },
    s: { wave: "noise", duration: 0.12, freq: 1800, volume: 0.5 },
    h: { wave: "noise", duration: 0.04, freq: 8000, volume: 0.3 },
}

function isDrum(token: string): token is Drum {
    return token in DRUM_KIT
}

// A track turned into tones: `length` is one loop in seconds, `tones` are
// sorted by start time within the loop.
export type CompiledTrack = {
    length: number
    stepSeconds: number
    tones: readonly Tone[]
}

function voiceTokens(voice: Voice, index: number): string[] {
    return voice.bars.flatMap((bar, b) => {
        const tokens = bar.split(/\s+/).filter((t) => t !== "")
        if (tokens.length !== STEPS_PER_BAR)
            throw new Error(
                `Voice ${index} bar ${b}: ${tokens.length} steps, not ${STEPS_PER_BAR}`
            )
        return tokens
    })
}

function notesTones(
    voice: NotesVoice,
    tokens: readonly string[],
    stepSeconds: number,
    index: number
): Tone[] {
    const gate = voice.gate ?? DEFAULT_GATE
    const notes: { step: number; steps: number; freq: number }[] = []
    let current: (typeof notes)[number] | undefined
    tokens.forEach((token, step) => {
        if (token === ".") {
            current = undefined
        } else if (token === "-") {
            if (!current)
                throw new Error(
                    `Voice ${index} step ${step}: "-" holds nothing`
                )
            current.steps++
        } else {
            current = { step, steps: 1, freq: noteFreq(token) }
            notes.push(current)
        }
    })
    return notes.map((n) => ({
        wave: voice.wave,
        at: n.step * stepSeconds,
        duration: n.steps * stepSeconds * gate,
        freq: n.freq,
        volume: voice.volume,
        ...(voice.hold ? { hold: true } : {}),
    }))
}

function drumsTones(
    voice: DrumsVoice,
    tokens: readonly string[],
    stepSeconds: number,
    index: number
): Tone[] {
    return tokens.flatMap((token, step) => {
        if (token === ".") return []
        if (!isDrum(token))
            throw new Error(
                `Voice ${index} step ${step}: unknown drum ${token}`
            )
        const drum = DRUM_KIT[token]
        return [
            {
                ...drum,
                at: step * stepSeconds,
                volume: drum.volume * voice.volume,
            },
        ]
    })
}

// Compile a track. Throws on a bad token, a bar of the wrong length or
// voices of different lengths, so a typo in a tune fails loudly.
export function compileTrack(track: Track): CompiledTrack {
    if (!(track.bpm > 0)) throw new Error(`Bad bpm: ${track.bpm}`)
    if (track.voices.length === 0) throw new Error("A track needs a voice")
    const stepSeconds = 60 / track.bpm / STEPS_PER_BEAT
    const bars = track.voices[0].bars.length
    if (bars === 0) throw new Error("A track needs a bar")
    const tones = track.voices.flatMap((voice, index) => {
        if (voice.bars.length !== bars)
            throw new Error(
                `Voice ${index}: ${voice.bars.length} bars, not ${bars}`
            )
        const tokens = voiceTokens(voice, index)
        return voice.kind === "notes"
            ? notesTones(voice, tokens, stepSeconds, index)
            : drumsTones(voice, tokens, stepSeconds, index)
    })
    tones.sort((a, b) => a.at - b.at)
    return { length: bars * STEPS_PER_BAR * stepSeconds, stepSeconds, tones }
}

// The tones starting in [from, to) of track time (seconds since the track
// started, counting loops), with `at` in the same track time. A window can
// span the loop point, or several loops.
export function tonesInWindow(
    track: CompiledTrack,
    from: number,
    to: number
): Tone[] {
    const out: Tone[] = []
    if (!(to > from)) return out
    for (
        let loop = Math.max(0, Math.floor(from / track.length));
        loop * track.length < to;
        loop++
    ) {
        const offset = loop * track.length
        for (const tone of track.tones) {
            const at = tone.at + offset
            if (at >= from && at < to) out.push({ ...tone, at })
        }
    }
    return out
}

// Quieter than this, a held tone isn't worth bringing back.
const MIN_HELD_VOLUME = 0.005

// The tones started before `position` (track time) and still sounding at
// it, cut to what is left of them: each starts at `position` and ends where
// it would have, at the pitch and (for a fading tone) the level it would
// have reached. For resuming a paused tune in place. Tones faded to near
// silence are left out.
export function heldTones(track: CompiledTrack, position: number): Tone[] {
    const out: Tone[] = []
    const from = Math.max(0, position - track.length)
    for (const tone of tonesInWindow(track, from, position)) {
        const end = tone.at + tone.duration
        if (end <= position) continue
        const share = (position - tone.at) / tone.duration
        const volume = tone.hold
            ? tone.volume
            : tone.volume * (SILENT / tone.volume) ** share
        if (volume < MIN_HELD_VOLUME) continue
        out.push({
            ...tone,
            at: position,
            duration: end - position,
            freq:
                tone.freqEnd === undefined
                    ? tone.freq
                    : tone.freq * (tone.freqEnd / tone.freq) ** share,
            volume,
        })
    }
    return out
}

export const MusicTrackId = {
    // The opening before the title (see opening.ts): a recorded track
    // (recorded.ts); its chip tune here is only the fallback.
    opening: "opening",
    title: "title",
    stage1: "stage1",
    stage2: "stage2",
    stage3: "stage3",
    stage4: "stage4",
    stage5: "stage5",
    stage6: "stage6",
    stage7: "stage7",
    stage8: "stage8",
    stage9: "stage9",
    stage10: "stage10",
    // The end roll's (endRoll.ts); recorded only, see TRACKS.
    endRoll: "endRoll",
} as const
export type MusicTrackId = (typeof MusicTrackId)[keyof typeof MusicTrackId]

export const MUSIC_TRACK_IDS: readonly MusicTrackId[] =
    Object.values(MusicTrackId)

// Stage tunes by stage index (0 is stage 1, as in levels/index.ts).
export const STAGE_TRACKS: readonly MusicTrackId[] = [
    MusicTrackId.stage1,
    MusicTrackId.stage2,
    MusicTrackId.stage3,
    MusicTrackId.stage4,
    MusicTrackId.stage5,
    MusicTrackId.stage6,
    MusicTrackId.stage7,
    MusicTrackId.stage8,
    MusicTrackId.stage9,
    MusicTrackId.stage10,
]

// The tune for a stage index; stages past the list reuse it from the start.
export function stageTrack(stage: number): MusicTrackId {
    const n = STAGE_TRACKS.length
    return STAGE_TRACKS[((Math.trunc(stage) % n) + n) % n]
}

const BACKBEAT = "k . h . s . h ."

export const TRACKS: Readonly<Record<MusicTrackId, Track>> = {
    // The opening plays a recorded track; if it can't load, the title's tune.
    get opening() {
        return this.title
    },
    // So does the end roll's.
    get endRoll() {
        return this.title
    },
    // Title: a calm, cheerful C major tune.
    title: {
        bpm: 112,
        voices: [
            {
                kind: "notes",
                wave: "square",
                volume: 0.12,
                hold: true,
                bars: [
                    "C5 - E5 - G5 - E5 -",
                    "F5 - A5 - G5 - - -",
                    "E5 - C5 - D5 - B4 -",
                    "C5 - - - . . . .",
                ],
            },
            {
                kind: "notes",
                wave: "triangle",
                volume: 0.3,
                bars: [
                    "C3 . G2 . C3 . G2 .",
                    "F2 . C3 . G2 . D3 .",
                    "A2 . E3 . G2 . D3 .",
                    "C3 . G2 . C3 - - .",
                ],
            },
            {
                kind: "drums",
                volume: 0.5,
                bars: [BACKBEAT, BACKBEAT, BACKBEAT, "k . h . s . h h"],
            },
        ],
    },
    // Stage 1, Classic: a busy A minor arcade arpeggio.
    stage1: {
        bpm: 140,
        voices: [
            {
                kind: "notes",
                wave: "square",
                volume: 0.1,
                bars: [
                    "A4 C5 E5 C5 A4 C5 E5 C5",
                    "G4 B4 D5 B4 G4 B4 D5 B4",
                    "F4 A4 C5 A4 F4 A4 C5 A4",
                    "E4 G#4 B4 G#4 E5 - D5 B4",
                ],
            },
            {
                kind: "notes",
                wave: "triangle",
                volume: 0.35,
                bars: [
                    "A2 . A3 . A2 . A3 .",
                    "G2 . G3 . G2 . G3 .",
                    "F2 . F3 . F2 . F3 .",
                    "E2 . E3 . E2 . E3 .",
                ],
            },
            {
                kind: "drums",
                volume: 0.5,
                bars: [BACKBEAT, BACKBEAT, BACKBEAT, "k . h . s h s s"],
            },
        ],
    },
    // Stage 2, Wrap maze: a bouncy, syncopated D dorian tune.
    stage2: {
        bpm: 150,
        voices: [
            {
                kind: "notes",
                wave: "square",
                volume: 0.1,
                bars: [
                    "D5 . F5 . A5 - G5 .",
                    "F5 - D5 . E5 . C5 .",
                    "D5 . F5 . A5 - C6 .",
                    "B5 - A5 . G5 . F5 E5",
                ],
            },
            {
                kind: "notes",
                wave: "triangle",
                volume: 0.35,
                bars: [
                    "D2 . D3 . D2 . D3 .",
                    "C2 . C3 . C2 . C3 .",
                    "D2 . D3 . D2 . D3 .",
                    "G2 . G3 . G2 . A2 .",
                ],
            },
            {
                kind: "drums",
                volume: 0.5,
                bars: [
                    "k . h k s . h .",
                    "k . h k s . h .",
                    "k . h k s . h .",
                    "k . h k s . s s",
                ],
            },
        ],
    },
    // Stage 3, Ice rink: slow, glassy G major with a twinkling arpeggio.
    stage3: {
        bpm: 104,
        voices: [
            {
                kind: "notes",
                wave: "triangle",
                volume: 0.3,
                hold: true,
                bars: [
                    "B5 - D6 - G6 - - -",
                    "F#6 - E6 - D6 - - -",
                    "E6 - C6 - A5 - - -",
                    "B5 - A5 - D6 - - -",
                ],
            },
            {
                kind: "notes",
                wave: "sine",
                volume: 0.08,
                bars: [
                    "G6 B6 D7 B6 G6 B6 D7 B6",
                    "D6 F#6 A6 F#6 D6 F#6 A6 F#6",
                    "C6 E6 A6 E6 C6 E6 A6 E6",
                    "D6 F#6 A6 F#6 D6 F#6 A6 F#6",
                ],
            },
            {
                kind: "notes",
                wave: "triangle",
                volume: 0.3,
                hold: true,
                bars: [
                    "G2 - - - D3 - - -",
                    "D2 - - - A2 - - -",
                    "A2 - - - E3 - - -",
                    "D2 - - - F#2 - - -",
                ],
            },
            {
                kind: "drums",
                volume: 0.3,
                bars: [
                    "h . h . h . h .",
                    "h . h . h . h .",
                    "h . h . h . h .",
                    "h . h . h . h .",
                ],
            },
        ],
    },
    // Stage 4, Fog: sparse and eerie, E minor over a slow heartbeat.
    stage4: {
        bpm: 84,
        voices: [
            {
                kind: "notes",
                wave: "sine",
                volume: 0.25,
                hold: true,
                bars: [
                    "E5 - - - . . G5 -",
                    "F#5 - - - . . . .",
                    "E5 - - - . . B4 -",
                    "C5 - - - B4 - - -",
                ],
            },
            {
                kind: "notes",
                wave: "triangle",
                volume: 0.35,
                hold: true,
                bars: [
                    "E2 - - - - - - -",
                    "D2 - - - - - - -",
                    "C2 - - - - - - -",
                    "B1 - - - - - - -",
                ],
            },
            {
                kind: "drums",
                volume: 0.4,
                bars: [
                    "k . k . . . . .",
                    "k . k . . . . .",
                    "k . k . . . . .",
                    "k . k . . . . .",
                ],
            },
        ],
    },
    // Stage 5, Boss lair: fast and driving, A minor with a menacing slide.
    stage5: {
        bpm: 168,
        voices: [
            {
                kind: "notes",
                wave: "square",
                volume: 0.1,
                hold: true,
                bars: [
                    "A4 - - C5 - - E5 -",
                    "D#5 - - - D5 - C5 -",
                    "A4 - - C5 - - E5 -",
                    "G5 - F5 - E5 - D#5 -",
                ],
            },
            {
                kind: "notes",
                wave: "sawtooth",
                volume: 0.12,
                gate: 0.7,
                bars: [
                    "A1 A2 A1 A2 A1 A2 G2 A2",
                    "A1 A2 A1 A2 Bb1 Bb2 Bb1 Bb2",
                    "A1 A2 A1 A2 A1 A2 C3 A2",
                    "E2 E3 E2 E3 Eb2 Eb3 D2 D3",
                ],
            },
            {
                kind: "drums",
                volume: 0.5,
                bars: [
                    "k h s h k k s h",
                    "k h s h k k s h",
                    "k h s h k k s h",
                    "k h s h k s s s",
                ],
            },
        ],
    },
    // Stage 6, Haunted halls: a creeping D minor tune over a low organ, the
    // lead edging up and down by half steps like footsteps behind you.
    stage6: {
        bpm: 120,
        voices: [
            {
                kind: "notes",
                wave: "square",
                volume: 0.09,
                hold: true,
                bars: [
                    "D5 - F5 - A5 - G#5 -",
                    "G5 - F5 - E5 - C#5 -",
                    "D5 - F5 - A5 - D6 -",
                    "C#6 - A5 - Bb5 - A5 -",
                ],
            },
            {
                kind: "notes",
                wave: "sine",
                volume: 0.2,
                hold: true,
                bars: [
                    "A3 - - - - - - -",
                    "A3 - - - G3 - - -",
                    "F3 - - - - - - -",
                    "E3 - - - - - - -",
                ],
            },
            {
                kind: "notes",
                wave: "triangle",
                volume: 0.35,
                bars: [
                    "D2 . A2 . D2 . A2 .",
                    "C#2 . A2 . C#2 . A2 .",
                    "Bb1 . F2 . Bb1 . F2 .",
                    "A1 . E2 . A1 . C#2 .",
                ],
            },
            {
                kind: "drums",
                volume: 0.4,
                bars: [
                    "k . . h s . . h",
                    "k . . h s . . h",
                    "k . . h s . . h",
                    "k . . h s . h h",
                ],
            },
        ],
    },
    // Stage 7, Patrol base: a G minor march, with a snare roll at the end of
    // each phrase like guards changing watch.
    stage7: {
        bpm: 132,
        voices: [
            {
                kind: "notes",
                wave: "square",
                volume: 0.1,
                gate: 0.7,
                bars: [
                    "G4 . G4 . Bb4 - D5 .",
                    "C5 . Bb4 . A4 - F4 .",
                    "G4 . G4 . Bb4 - D5 .",
                    "Eb5 - D5 . C5 . A4 .",
                ],
            },
            {
                kind: "notes",
                wave: "triangle",
                volume: 0.35,
                bars: [
                    "G2 . D3 . G2 . D3 .",
                    "F2 . C3 . F2 . C3 .",
                    "Eb2 . Bb2 . Eb2 . Bb2 .",
                    "D2 . A2 . D2 . F#2 .",
                ],
            },
            {
                kind: "drums",
                volume: 0.5,
                bars: [
                    "k . s s k . s .",
                    "k . s s k . s .",
                    "k . s s k . s .",
                    "k . s s s s s s",
                ],
            },
        ],
    },
    // Stage 8, Frozen fog: Ice rink's twinkle over Fog's slow heartbeat, in
    // D minor.
    stage8: {
        bpm: 92,
        voices: [
            {
                kind: "notes",
                wave: "sine",
                volume: 0.25,
                hold: true,
                bars: [
                    "D5 - - - F5 - E5 -",
                    "C5 - - - . . A4 -",
                    "Bb4 - - - D5 - C5 -",
                    "A4 - - - . . . .",
                ],
            },
            {
                kind: "notes",
                wave: "sine",
                volume: 0.06,
                bars: [
                    "D6 F6 A6 F6 D6 F6 A6 F6",
                    "C6 E6 A6 E6 C6 E6 A6 E6",
                    "Bb5 D6 F6 D6 Bb5 D6 F6 D6",
                    "A5 C#6 E6 C#6 A5 C#6 E6 C#6",
                ],
            },
            {
                kind: "notes",
                wave: "triangle",
                volume: 0.35,
                hold: true,
                bars: [
                    "D2 - - - - - - -",
                    "A1 - - - - - - -",
                    "Bb1 - - - - - - -",
                    "A1 - - - - - - -",
                ],
            },
            {
                kind: "drums",
                volume: 0.35,
                bars: [
                    "k . k . . . h .",
                    "k . k . . . h .",
                    "k . k . . . h .",
                    "k . k . . h . h",
                ],
            },
        ],
    },
    // Stage 9, Gauntlet: the fastest dot-stage tune, a pounding E minor run
    // with a rising climb in the last bar.
    stage9: {
        bpm: 160,
        voices: [
            {
                kind: "notes",
                wave: "square",
                volume: 0.1,
                bars: [
                    "E5 . E5 G5 . B5 A5 G5",
                    "F#5 . F#5 A5 . D6 C6 B5",
                    "E5 . E5 G5 . B5 A5 G5",
                    "C6 B5 A5 G5 A5 B5 C6 D#6",
                ],
            },
            {
                kind: "notes",
                wave: "sawtooth",
                volume: 0.12,
                gate: 0.6,
                bars: [
                    "E2 E2 E3 E2 E2 E2 E3 E2",
                    "D2 D2 D3 D2 D2 D2 D3 D2",
                    "C2 C2 C3 C2 C2 C2 C3 C2",
                    "B1 B1 B2 B1 B1 B2 B1 B2",
                ],
            },
            {
                kind: "drums",
                volume: 0.5,
                bars: [
                    "k h s h k k s h",
                    "k h s h k h s k",
                    "k h s h k k s h",
                    "k s k s k s s s",
                ],
            },
        ],
    },
    // Stage 10, Final boss: the climax. D minor at full tilt, the lead
    // climbing through the harmonic minor's C# over a racing arpeggio, an
    // octave-jumping bass and a fill to turn the loop.
    stage10: {
        bpm: 176,
        voices: [
            {
                kind: "notes",
                wave: "square",
                volume: 0.1,
                hold: true,
                bars: [
                    "D5 - F5 - A5 - C#6 -",
                    "D6 - - - C6 - Bb5 -",
                    "A5 - G5 - F5 - E5 -",
                    "F5 - E5 - D5 - C#5 -",
                    "D5 - F5 - A5 - D6 -",
                    "F6 - - - E6 - D6 -",
                    "C#6 - D6 - E6 - A5 -",
                    "D6 - - - - - . .",
                ],
            },
            {
                kind: "notes",
                wave: "square",
                volume: 0.05,
                gate: 0.5,
                bars: [
                    "D6 A5 F5 A5 D6 A5 F5 A5",
                    "Bb5 F5 D5 F5 Bb5 F5 D5 F5",
                    "G5 D5 Bb4 D5 G5 D5 Bb4 D5",
                    "A5 E5 C#5 E5 A5 E5 C#5 E5",
                    "D6 A5 F5 A5 D6 A5 F5 A5",
                    "Bb5 F5 D5 F5 Bb5 F5 D5 F5",
                    "A5 E5 C#5 E5 A5 E5 C#5 E5",
                    "D6 A5 F5 A5 D6 A5 F5 A5",
                ],
            },
            {
                kind: "notes",
                wave: "sawtooth",
                volume: 0.12,
                gate: 0.7,
                bars: [
                    "D2 D3 D2 D3 D2 D3 D2 D3",
                    "Bb1 Bb2 Bb1 Bb2 Bb1 Bb2 Bb1 Bb2",
                    "G1 G2 G1 G2 G1 G2 G1 G2",
                    "A1 A2 A1 A2 A1 A2 C#2 C#3",
                    "D2 D3 D2 D3 D2 D3 D2 D3",
                    "Bb1 Bb2 Bb1 Bb2 Bb1 Bb2 Bb1 Bb2",
                    "A1 A2 A1 A2 A1 A2 A1 A2",
                    "D2 D3 D2 D3 A1 A2 C#2 C#3",
                ],
            },
            {
                kind: "drums",
                volume: 0.55,
                bars: [
                    "k h s h k k s h",
                    "k h s h k k s h",
                    "k h s h k k s h",
                    "k h s h k k s h",
                    "k h s h k k s h",
                    "k h s h k k s h",
                    "k h s h k k s h",
                    "k s k s s s s s",
                ],
            },
        ],
    },
}
