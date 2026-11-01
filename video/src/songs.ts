// Which song each composition plays, found by name among the files in
// public/music/ (gitignored: see music.ts). Pure, so the analyser script
// shares it.

// The folder in video/public/ songs go in.
export const MUSIC_FOLDER = "music/"

const AUDIO = /\.(mp3|m4a|aac|wav|ogg|flac)$/i

// Each composition's song: a part of its file name, matched ignoring case,
// spaces and punctuation ("Great Expectations" finds
// "03 Great Expectations.m4a").
export const SONGS = {
    // v1, cut to Slam (Bionyx Remix) at 97.43 bpm (see cues.ts).
    promo: "slam",
    // v2: DJARTMUSIC, The Return of the 8-Bit Era (Pixabay licence).
    promo2: "return of the 8 bit era",
    // v3: the same song (also named stage_01), from its start.
    promo3: "return of the 8 bit era",
    // The toolkit demo: Jurassic 5, Great Expectations.
    toolkit: "great expectations",
} as const

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "")

// Whether file name `name` matches song name `song`.
export function songMatches(name: string, song: string): boolean {
    return squash(name).includes(squash(song))
}

function baseName(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1)
}

// The song among the files in public/ (as getStaticFiles lists them): the
// first audio file in music/, by name, that matches `song` (any song when
// left out), or undefined.
export function pickTrack<T extends { name: string }>(
    files: readonly T[],
    song?: string
): T | undefined {
    return files
        .filter((f) => f.name.startsWith(MUSIC_FOLDER) && AUDIO.test(f.name))
        .filter(
            (f) => song === undefined || songMatches(baseName(f.name), song)
        )
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))[0]
}

// The beats file the analyser writes next to song file `name`
// ("music/slam.m4a" -> "slam.beats.json").
export function beatsFileName(name: string): string {
    const base = baseName(name)
    const dot = base.lastIndexOf(".")
    return `${dot > 0 ? base.slice(0, dot) : base}.beats.json`
}
