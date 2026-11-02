import { getStaticFiles } from "remotion"
import { pickTrack } from "./songs"

// The soundtrack: your own song, kept out of git.
//
// Drop the song into video/public/music/ (gitignored: songs are usually
// copyrighted, and the repo is public). Each composition plays the song
// whose file name matches its entry in SONGS (songs.ts), from TRACK_START
// (cues.ts) for the promo. Without one, the game's own music (rendered by
// scripts/render-audio.ts) plays instead, so a fresh clone still renders a
// video with sound.

export { MUSIC_FOLDER, pickTrack } from "./songs"

// The URL for <Audio> of the song matching `song` (see SONGS; any song when
// left out), or null to play the game's music. Remotion lists public/ in
// the Studio and when rendering.
export function musicTrack(song?: string): string | null {
    return pickTrack(getStaticFiles(), song)?.src ?? null
}
