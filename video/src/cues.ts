// Music cues: named moments of the soundtrack, in seconds from its start.
// Scenes start and cut on cues rather than frame numbers, so when the real
// track arrives only these times change.
//
// PLACEHOLDERS until the music is chosen (KDA-250): set them from the track,
// e.g. by scrubbing it in Remotion Studio.
export const CUES = {
    // The first beat: the title's first word lands.
    intro: 0.4,
    // The beat drops: cut from the title to gameplay.
    drop: 3,
    // The big moment of the run: the slow-motion close call.
    chorus: 9,
    // The music winds down: cut to the end card.
    outro: 17,
    // The track's end: the video's last frame.
    end: 20,
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

// The soundtrack: a file in video/public/ (e.g. "music.mp3"), or null for a
// silent video. Cue times are seconds into this file.
export const MUSIC: string | null = null
