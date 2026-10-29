import { getStaticFiles } from "remotion"

// The soundtrack: your own song, kept out of git.
//
// Drop the song into video/public/music/ (gitignored: songs are usually
// copyrighted, and the repo is public). The first audio file there, by
// name, is the soundtrack, played from TRACK_START (cues.ts). Without one,
// the game's own music (rendered by scripts/render-audio.ts) plays
// instead, so a fresh clone still renders a video with sound.

// The folder in video/public/ songs go in.
export const MUSIC_FOLDER = "music/"

const AUDIO = /\.(mp3|m4a|aac|wav|ogg|flac)$/i

// The song among the files in public/ (as getStaticFiles lists them), or
// undefined.
export function pickTrack<T extends { name: string }>(
    files: readonly T[]
): T | undefined {
    return files
        .filter((f) => f.name.startsWith(MUSIC_FOLDER) && AUDIO.test(f.name))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))[0]
}

// The song's URL for <Audio>, or null to play the game's music. Remotion
// lists public/ in the Studio and when rendering.
export function musicTrack(): string | null {
    return pickTrack(getStaticFiles())?.src ?? null
}
