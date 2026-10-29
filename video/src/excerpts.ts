import { beatsOf, fallbackBeats, type Beats, type BeatsFile } from "./beats"
import { SONGS } from "./songs"

// The stretch of a song a composition is cut to, in bars of the song's
// analysed grid (BeatsFile.downbeats), with its cues as bar numbers. Bars
// rather than seconds: the cues stay on the beat whatever fps renders them,
// and a re-analysis that moves the grid by a few milliseconds moves them
// with it.

export type Excerpt<Cue extends string = string> = {
    // The song, as in SONGS.
    song: string
    // Bars [fromBar, toBar) of the song.
    fromBar: number
    toBar: number
    // Named moments, as song bar numbers (fractions are beats into a bar:
    // 40.5 is the third beat of bar 40).
    cues: Readonly<Record<Cue, number>>
}

// A song's grid as measured by analyze-track, for when its beats file
// isn't there (a fresh clone): the fallback grid then matches it.
export type SongGrid = { bpm: number; offset: number; bars: number }

export const SONG_GRIDS: Readonly<Record<string, SongGrid>> = {
    // Slam (Bionyx Remix): 97.431 bpm, first downbeat 0.778 s.
    [SONGS.promo]: { bpm: 97.431, offset: 0.778, bars: 89 },
    // Great Expectations: 96.968 bpm, first downbeat 0.291 s.
    [SONGS.promo2]: { bpm: 96.968, offset: 0.291, bars: 88 },
}

// The v2 promo's excerpt of Great Expectations, picked with the user:
// bars 32–48 (1:19.49–1:59.09, 39.6 s). Verse 2 opens it; a one-bar
// dropout at bar 34 and a lift at 36 carry the character run-through;
// the second hook lands on bar 40 (the song's strongest lift) for the boss
// climax; the end card holds the hook's last two bars, which end just
// before verse 3.
export const PROMO2_EXCERPT = {
    song: SONGS.promo2,
    fromBar: 32,
    toBar: 48,
    cues: {
        open: 32,
        dropout: 34,
        lift: 36,
        hook: 40,
        endCard: 46,
        end: 48,
    },
} as const satisfies Excerpt

// The beats file to use for `song` when none was found: its measured grid,
// or a plain 120 bpm one.
export function fallbackFor(song: string): BeatsFile {
    const grid = SONG_GRIDS[song]
    return grid ? fallbackBeats(grid) : fallbackBeats()
}

export type ExcerptFrames<Cue extends string> = {
    // The grid with frame 0 on the excerpt's first downbeat.
    beats: Beats
    // Seconds into the song at frame 0 (for <Audio trimBefore>).
    start: number
    // Frames from the excerpt's start to its end.
    duration: number
    // The frame a cue falls on (rounded).
    cue(name: Cue): number
    // The frame of song bar `bar` (fractions are beats; rounded).
    bar(bar: number): number
}

// The excerpt's frames at `fps`, on the grid of `file`.
export function excerptFrames<Cue extends string>(
    file: BeatsFile,
    excerpt: Excerpt<Cue>,
    fps: number
): ExcerptFrames<Cue> {
    const grid = beatsOf(file, { fps })
    const start = grid.barFrame(excerpt.fromBar) / fps
    const beats = beatsOf(file, { fps, start })
    const bar = (n: number) => {
        const whole = Math.floor(n)
        const into = (n - whole) * file.beatsPerBar
        const b = whole - excerpt.fromBar
        return Math.round(
            into
                ? beats.beatFrame(b * file.beatsPerBar + into)
                : beats.barFrame(b)
        )
    }
    return {
        beats,
        start,
        duration: bar(excerpt.toBar),
        cue: (name) => bar(excerpt.cues[name]),
        bar,
    }
}
