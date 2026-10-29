import { getStaticFiles } from "remotion"
import type { BeatsFile } from "./beats"
import { fallbackFor, SONG_GRIDS } from "./excerpts"
import { beatsFileName, MUSIC_FOLDER, pickTrack } from "./songs"

export type LoadedBeats = {
    file: BeatsFile
    // The song's URL for <Audio>, or null when it isn't there.
    song: string | null
    // Where the grid came from: the song's analysis, or the fallback.
    source: "analysis" | "fallback"
}

// The beat grid of `song` (see SONGS): its beats file from public/music/
// (written by `pnpm analyze-track`), or the fallback grid (fallbackFor)
// when the song or its analysis isn't there (or its grid is forced), so a
// fresh clone still renders. Async (it fetches the JSON): call it from a composition's
// calculateMetadata and pass the result down as props, so every frame
// gets the same grid.
export async function loadBeats(song: string): Promise<LoadedBeats> {
    const files = getStaticFiles()
    const track = pickTrack(files, song)
    const name = track && `${MUSIC_FOLDER}${beatsFileName(track.name)}`
    const json = name && files.find((f) => f.name === name)
    if (track && json && !SONG_GRIDS[song]?.forced) {
        const response = await fetch(json.src)
        if (response.ok) {
            const file = (await response.json()) as BeatsFile
            return { file, song: track.src, source: "analysis" }
        }
    }
    return {
        file: fallbackFor(song),
        song: track?.src ?? null,
        source: "fallback",
    }
}
