// Recorded stage music: MP3s that replace a stage's chip tune (music.ts).
// Each file plays from its start, then loops between loopStart and loopEnd
// (seconds in the file) forever, so the fade-out the track was recorded
// with is never heard. The files are cut a second past loopEnd and evened
// out in loudness when they're encoded. No DOM access here.
//
// Loop points were found by matching the music on both sides of the jump,
// then tuned by ear. Credits: djartmusic (stages 1–3), phantasticbeats
// (stage 6), moodmode (stages 7 and 8), nocopyrightsound633 (stage 9).

import classic from "./assets/music/01-classic.mp3"
import wrapMaze from "./assets/music/02-wrap-maze.mp3"
import iceRink from "./assets/music/03-ice-rink.mp3"
import fog from "./assets/music/04-fog.mp3"
import bossLair from "./assets/music/05-boss-lair.mp3"
import hauntedHalls from "./assets/music/06-haunted-halls.mp3"
import patrolBase from "./assets/music/07-patrol-base.mp3"
import frozenFog from "./assets/music/08-frozen-fog.mp3"
import gauntlet from "./assets/music/09-gauntlet.mp3"
import bossFinal from "./assets/music/10-boss-final.mp3"
import { MusicTrackId } from "./music"

export type RecordedTrack = {
    // The file's URL, as Vite serves it.
    url: string
    loopStart: number
    loopEnd: number
}

export type RecordedTracks = Partial<Record<MusicTrackId, RecordedTrack>>

// The title keeps its chip tune.
export const RECORDED_TRACKS: RecordedTracks = {
    [MusicTrackId.stage1]: {
        url: classic,
        loopStart: 24.6212,
        loopEnd: 57.7248,
    },
    [MusicTrackId.stage2]: { url: wrapMaze, loopStart: 3.142, loopEnd: 65.086 },
    [MusicTrackId.stage3]: {
        url: iceRink,
        loopStart: 7.6449,
        loopEnd: 53.3595,
    },
    [MusicTrackId.stage4]: { url: fog, loopStart: 15.1423, loopEnd: 82.663 },
    [MusicTrackId.stage5]: {
        url: bossLair,
        loopStart: 13.7466,
        loopEnd: 70.2171,
    },
    [MusicTrackId.stage6]: {
        url: hauntedHalls,
        loopStart: 4.0054,
        loopEnd: 46.6721,
    },
    [MusicTrackId.stage7]: {
        url: patrolBase,
        loopStart: 3.9981,
        loopEnd: 54.8455,
    },
    [MusicTrackId.stage8]: {
        url: frozenFog,
        loopStart: 19.7435,
        loopEnd: 75.7435,
    },
    [MusicTrackId.stage9]: { url: gauntlet, loopStart: 32.8, loopEnd: 141.867 },
    [MusicTrackId.stage10]: {
        url: bossFinal,
        loopStart: 9.3956,
        loopEnd: 169.3663,
    },
}

// Where in the file a recorded track is after `position` seconds of play:
// straight through up to loopEnd, then round the loop.
export function loopOffset(track: RecordedTrack, position: number): number {
    const { loopStart, loopEnd } = track
    if (position < loopEnd) return Math.max(0, position)
    return loopStart + ((position - loopEnd) % (loopEnd - loopStart))
}
