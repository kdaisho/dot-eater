import { interpolate } from "remotion"

// The v2 promo's sound: the song alone, trimmed to the excerpt. No game
// sound effects at all. Pure, so it is tested.

export type Promo2Track = {
    name: string
    src: string
    // Frames of the file to skip (for <Audio trimBefore>).
    trimBefore: number
    // The volume on each frame of the composition.
    volume: (frame: number) => number
}

// Frames of fade at the start (a touch, so the cut into the verse doesn't
// click) and at the end (the excerpt ends just before verse 3).
export const FADE_IN = 2
export const FADE_OUT = 12

// The tracks Promo2 plays: song `song` (its URL, or null when it isn't in
// public/music/) from `start` seconds in, for `duration` frames at `fps`.
export function promo2Tracks(
    song: string | null,
    { start, duration, fps }: { start: number; duration: number; fps: number }
): Promo2Track[] {
    if (!song) return []
    return [
        {
            name: "Song",
            src: song,
            trimBefore: Math.round(start * fps),
            volume: (frame) =>
                interpolate(
                    frame,
                    [0, FADE_IN, duration - FADE_OUT, duration],
                    [0, 1, 1, 0],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                ),
        },
    ]
}
