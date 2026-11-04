// The soundtrack page's tracks (KDA-321): the game's recorded music in the
// order it plays, each with the name the page shows and where it plays in
// the game. All of them are open from the start. No DOM access here: the
// page's screen is in flow.ts, the music it plays in sound.ts, and how
// far into its file a track is in recorded.ts (trackProgress).

import { MusicTrackId, STAGE_TRACKS } from "./music"

export type SoundtrackEntry = {
    track: MusicTrackId
    // The track's name: its stage's (levels/), in title case.
    name: string
    // Where it plays: "Stage 1" and so on, or the opening or the end roll.
    plays: string
}

// The stage tracks' names, by stage index, as the files call them
// (assets/music/01-classic.mp3 and so on; 10 is boss-final).
const STAGE_NAMES = [
    "Classic",
    "Wrap Maze",
    "Ice Rink",
    "Fog",
    "Boss Lair",
    "Haunted Halls",
    "Patrol Base",
    "Frozen Fog",
    "Gauntlet",
    "Final Boss",
] as const

export const SOUNDTRACK: readonly SoundtrackEntry[] = [
    { track: MusicTrackId.opening, name: "Opening", plays: "The opening" },
    ...STAGE_TRACKS.map((track, i) => ({
        track,
        name: STAGE_NAMES[i]!,
        plays: `Stage ${i + 1}`,
    })),
    { track: MusicTrackId.endRoll, name: "End Roll", plays: "The end roll" },
]

// Seconds as m:ss, rounded down: 57.7 is "0:57", 169.4 is "2:49".
export function formatClock(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds))
    const rest = String(whole % 60).padStart(2, "0")
    return `${Math.floor(whole / 60)}:${rest}`
}
