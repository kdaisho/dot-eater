import type { Recording } from "../../src/replay"
import { beatFrames, cueFrame, framesBetween } from "./cues"
import { nearMisses, type NearMiss } from "./replayers"
import { alignTo, gameTimeAt, type TimeMap } from "./time"

// The promo's plan: its size, its scenes' frames, the run it shows and how
// game time maps onto it. The one source of truth for both the composition
// (Promo.tsx, drawing the frames) and the audio render
// (scripts/render-audio.ts, placing the game's sounds on the same frames),
// so the two can't drift. No Remotion or bundler imports: it runs in Node.

export const FPS = 30
export const WIDTH = 1920
export const HEIGHT = 1080
export const DURATION = cueFrame("end", FPS)

// Frames per beat of the music, for the text pops (fractional).
export const BEAT = beatFrames(FPS)

// The run to show, by file name in src/recordings/: the demo run (see
// scripts/record-demo.ts) until a real recording replaces it.
export const RUN = "demo"

// The scenes, in video frames.
export const TITLE = { from: 0, duration: cueFrame("play", FPS) }
export const GAMEPLAY = {
    from: cueFrame("play", FPS),
    duration: framesBetween("play", "outro", FPS),
}
export const END_CARD = {
    from: cueFrame("outro", FPS),
    duration: framesBetween("outro", "end", FPS),
}

// The close call lands on the drop; in the gameplay clip's own frames.
export const CLOSE_CALL = framesBetween("play", "drop", FPS)

// Real time, easing into fifth-speed slow motion just before the close
// call, and back to real time a little after it.
export const SLOW_MOTION = { from: CLOSE_CALL - 15, to: CLOSE_CALL + 40 }
const SPEED: TimeMap = {
    fps: FPS,
    segments: [
        { fromFrame: SLOW_MOTION.from, speed: 0.2, ramp: 10 },
        { fromFrame: SLOW_MOTION.to, speed: 1, ramp: 12 },
    ],
}

// The close call to slow down on: the closest one that comes late enough
// in the run to land on clip frame `frame` (`lead` ticks after the
// recording's start), so the clip doesn't have to start before the run
// does. The closest of all when none does; undefined without any.
export function pickCloseCall(
    misses: readonly NearMiss[],
    lead: number
): NearMiss | undefined {
    return misses.find((miss) => miss.tick >= lead) ?? misses[0]
}

// Which game time each frame of the gameplay clip shows: the close call on
// the drop.
export function promoTime(run: Recording): TimeMap {
    const lead = gameTimeAt(CLOSE_CALL, SPEED)
    const miss = pickCloseCall(nearMisses(run), lead)
    return alignTo(SPEED, CLOSE_CALL, miss?.tick ?? 0)
}

// A run shown in the video: the recording, its time mapping, and where
// its clip sits in the composition (in video frames).
export type ClipPlan = {
    recording: Recording
    time: TimeMap
    from: number
    duration: number
}

// The promo's gameplay clip of `run` (the recording named RUN).
export function promoClip(run: Recording): ClipPlan {
    return { recording: run, time: promoTime(run), ...GAMEPLAY }
}
