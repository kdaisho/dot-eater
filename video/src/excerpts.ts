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
// `forced` keeps it even when an analysis exists: for a song the analyser
// reads at double time.
export type SongGrid = {
    bpm: number
    offset: number
    bars: number
    forced?: boolean
}

export const SONG_GRIDS: Readonly<Record<string, SongGrid>> = {
    // Slam (Bionyx Remix): 97.431 bpm, first downbeat 0.778 s.
    [SONGS.promo]: { bpm: 97.431, offset: 0.778, bars: 89 },
    // Great Expectations: 96.968 bpm, first downbeat 0.291 s.
    [SONGS.toolkit]: { bpm: 96.968, offset: 0.291, bars: 88 },
    // The Return of the 8-Bit Era: the analyser reads 173.983 bpm with its
    // first downbeat at 0.059 s; the edit cuts on the half-time feel
    // (86.99 bpm, 2.759 s bars), so this grid always wins.
    [SONGS.promo2]: { bpm: 86.9915, offset: 0.059, bars: 26, forced: true },
}

// The v2 promo's excerpt of The Return of the 8-Bit Era, on its half-time
// grid: bars 8–24 (0:22.13–1:06.27, 44.1 s). The build opens it, the
// dropout and lift keep v2's shape, the hook lands on bar 16 (0:44.20, the
// song's strongest lift) for the boss climax, and the end card holds the
// hook's last two bars, which end where the outro starts.
export const PROMO2_EXCERPT = {
    song: SONGS.promo2,
    fromBar: 8,
    toBar: 24,
    cues: {
        open: 8,
        dropout: 10,
        lift: 12,
        hook: 16,
        endCard: 22,
        end: 24,
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
