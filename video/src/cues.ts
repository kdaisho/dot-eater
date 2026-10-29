// Music cues: named moments of the soundtrack, in seconds from the start of
// the video. Scenes start and cut on cues rather than frame numbers, so
// when the track changes only these times change.
//
// They are set from the beat grid of the chosen song (KDA-250), measured
// from its audio (a kick and snare onset analysis, folded over the bar):
// 97.43 bpm, a 4-beat bar of BAR seconds, downbeats at 0.79 s + n bars into
// the track. The video uses the excerpt from the downbeat at 0:50.055
// (TRACK_START), so every cue below is a whole number of bars and lands on
// a downbeat. The song itself is local only (see music.ts); without it the
// game's own music plays over the same cues.

// Beats per minute of the song.
export const BPM = 97.432
// One 4-beat bar, in seconds, as measured (240 / BPM).
export const BAR = 2.46325
// One beat, in seconds.
export const BEAT_SECONDS = BAR / 4
// Where in the song the video starts, in seconds: a downbeat.
export const TRACK_START = 50.055

export const CUES = {
    // The first downbeat: the title's first word lands.
    intro: 0,
    // One bar in: cut from the title to gameplay (0:52.5 in the song).
    play: BAR,
    // The drop, where the song's loud section starts (1:04.8): the
    // slow-motion close call lands on it.
    drop: 6 * BAR,
    // The breakdown starts (1:24.5): cut to the end card.
    outro: 14 * BAR,
    // Two bars of end card: the video's last frame (1:29.5).
    end: 16 * BAR,
} as const

export type Cue = keyof typeof CUES

// The video frame (at `fps`) a cue falls on.
export function cueFrame(cue: Cue, fps: number): number {
    return Math.round(CUES[cue] * fps)
}

// Frames from one cue to another.
export function framesBetween(from: Cue, to: Cue, fps: number): number {
    return cueFrame(to, fps) - cueFrame(from, fps)
}

// Frames per beat at `fps` (fractional).
export function beatFrames(fps: number): number {
    return BEAT_SECONDS * fps
}
