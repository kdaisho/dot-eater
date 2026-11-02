import { TICK_RATE } from "../../src/constants"

// Mapping video frames to game time.
//
// A clip plays a recording at a speed that can change over the clip: real
// time, slow motion, a freeze frame, fast forward. The speed is a list of
// segments, each starting at a frame; game time is the speed integrated
// over the frames, so changing speed never jumps the game.
//
// Everything here is a pure function of the frame number: Remotion renders
// frames out of order, across several tabs, so no frame may depend on an
// earlier one having been rendered.

export type Segment = {
    // The clip frame (0 is the clip's first) this speed starts at.
    fromFrame: number
    // Game speed as a multiple of real time: 1 is real time, 0.25 is
    // quarter-speed slow motion, 0 freezes, 2 is double speed.
    speed: number
    // Frames to ease from the previous speed into this one, linearly
    // (0 or left out switches at once). The ramp starts at fromFrame.
    ramp?: number
}

export type TimeMap = {
    // The video's frame rate.
    fps: number
    // The game tick the clip starts at (0, the recording's start, when left
    // out). May be fractional.
    startTick?: number
    // Speed changes, in any order. Before the first one the clip plays in
    // real time.
    segments?: readonly Segment[]
}

// Game ticks per video frame at real-time speed (2 at 30 fps).
export function ticksPerFrame(fps: number): number {
    return TICK_RATE / fps
}

// The game time, in ticks (fractional), shown on clip frame `frame`.
// Frames before 0 show the start. Speeds must not be negative, so game time
// never runs backwards.
export function gameTimeAt(frame: number, map: TimeMap): number {
    const rate = ticksPerFrame(map.fps)
    const start = map.startTick ?? 0
    if (frame <= 0) return start
    const segments = [...(map.segments ?? [])].sort(
        (a, b) => a.fromFrame - b.fromFrame
    )
    // Real-time frames' worth of game covered so far, and the speed reached.
    let covered = 0
    let speed = 1
    let from = 0
    for (const [i, segment] of segments.entries()) {
        if (segment.speed < 0) {
            throw new Error(`Negative speed: ${segment.speed}`)
        }
        const begin = Math.max(segment.fromFrame, 0)
        if (begin >= frame) break
        covered += (begin - from) * speed
        // How far into this segment the clip gets before the next one (or
        // the frame asked for).
        const next = segments[i + 1]
        const end = Math.min(next ? Math.max(next.fromFrame, 0) : frame, frame)
        const ramp = segment.ramp ?? 0
        covered += segmentDistance(speed, segment.speed, ramp, end - begin)
        speed = speedAfter(speed, segment.speed, ramp, end - begin)
        from = end
    }
    covered += (frame - from) * speed
    return start + covered * rate
}

// The speed `frames` frames into a segment easing from `p` to `v` over
// `ramp` frames.
function speedAfter(p: number, v: number, ramp: number, frames: number) {
    if (ramp <= 0 || frames >= ramp) return v
    return p + ((v - p) * frames) / ramp
}

// How far a segment gets in `frames` frames, easing linearly from speed
// `p` to speed `v` over its first `ramp` frames.
export function segmentDistance(
    p: number,
    v: number,
    ramp: number,
    frames: number
): number {
    if (frames <= 0) return 0
    if (ramp <= 0) return frames * v
    if (frames <= ramp)
        return frames * p + ((v - p) * frames * frames) / ramp / 2
    return (ramp * (p + v)) / 2 + (frames - ramp) * v
}

export type GameTime = {
    // The whole tick to replay to.
    tick: number
    // How far towards the next tick, in [0, 1): the renderer's alpha.
    alpha: number
}

// The tick and alpha to draw on clip frame `frame`.
export function gameTimeFor(frame: number, map: TimeMap): GameTime {
    // Snap values within a hair of a whole tick, so float error (e.g.
    // 0.1 + 0.2) never shows tick n-1 at alpha 0.9999.
    const raw = gameTimeAt(frame, map)
    const t = Math.abs(raw - Math.round(raw)) < 1e-9 ? Math.round(raw) : raw
    const tick = Math.floor(t)
    return { tick, alpha: t - tick }
}

// `map` with the start tick that makes clip frame `frame` show tick `tick`
// (but never before the recording's start), e.g. to land a close call
// on a beat.
export function alignTo(map: TimeMap, frame: number, tick: number): TimeMap {
    const lead = gameTimeAt(frame, { ...map, startTick: 0 })
    return { ...map, startTick: Math.max(0, tick - lead) }
}

// The first clip frame at which the game reaches tick `tick`, or Infinity
// if it never does (e.g. it freezes before). For lining up scenes and
// camera moves with moments of the run.
export function frameAtTick(
    tick: number,
    map: TimeMap,
    maxFrames = 100_000
): number {
    if (gameTimeAt(0, map) >= tick) return 0
    let lo = 0
    let hi = 1
    while (gameTimeAt(hi, map) < tick) {
        if (hi >= maxFrames) return Infinity
        lo = hi
        hi *= 2
    }
    // Game time never runs backwards, so bisect.
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2)
        if (gameTimeAt(mid, map) >= tick) hi = mid
        else lo = mid
    }
    return hi
}
