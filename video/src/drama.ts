import { spring } from "remotion"
import type { Segment } from "./time"

// The maths of the edit's drama: speed ramps, shakes, flashes, whips,
// wipes and slams, each a pure function of the frame (see drama.tsx for
// the components that draw them).

// ---- Speed ramp ----

export type RampOptions = {
    // Fast forward into the moment: speed, and how many frames before the
    // hero frame it starts.
    fast?: number
    fastFrames?: number
    // The hard slow motion on the moment: speed, and frames it holds after
    // the hero frame.
    slow?: number
    hold?: number
    // Frames to ease back to real time after the hold.
    recover?: number
}

// Speed segments for a clip whose hero moment is on clip frame `hero`:
// real time, then fast, then a hard cut to slow motion just before the
// hero frame, held, then easing back to real time. Use with alignTo(map,
// hero, heroTick) to land the hero tick on the hero frame.
export function speedRamp(
    hero: number,
    {
        fast = 2.4,
        fastFrames = 14,
        slow = 0.12,
        hold = 16,
        recover = 10,
    }: RampOptions = {}
): Segment[] {
    // The slow motion bites 2 frames early, so the moment itself is slow.
    const slowFrom = Math.max(0, hero - 2)
    const fastFrom = Math.max(0, slowFrom - fastFrames)
    const segments: Segment[] = []
    if (slowFrom > fastFrom) {
        segments.push({ fromFrame: fastFrom, speed: fast, ramp: 4 })
    }
    segments.push({ fromFrame: slowFrom, speed: slow, ramp: 1 })
    segments.push({ fromFrame: hero + hold, speed: 1, ramp: recover })
    return segments
}

// ---- Shake ----

export type Impact = {
    // The frame it hits on.
    frame: number
    // 1 is a solid hit; 2 twice as hard.
    strength?: number
}

export type ShakeOptions = {
    // Pixels of the biggest jolt at strength 1.
    amplitude?: number
    // Frames for the shake to fall to about a third.
    decay?: number
}

// A small integer hash to a number in [0, 1), so each impact shakes its
// own way, the same on every render.
function hash01(n: number): number {
    let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
    return (h >>> 0) / 2 ** 32
}

// The camera shake on frame `frame` from `impacts`: an offset in pixels
// and a tilt in degrees, jolting on each impact and dying away.
export function shakeAt(
    frame: number,
    impacts: readonly Impact[],
    { amplitude = 28, decay = 6 }: ShakeOptions = {}
): { x: number; y: number; rotate: number } {
    let x = 0
    let y = 0
    let rotate = 0
    for (const { frame: at, strength = 1 } of impacts) {
        const t = frame - at
        if (t < 0 || t > decay * 6) continue
        const env = strength * amplitude * Math.exp(-t / decay)
        const seed = Math.round(at * 1000)
        // Two incommensurate wobbles per axis, phased per impact.
        const wob = (k: number, f1: number, f2: number) =>
            0.65 * Math.sin(t * f1 + hash01(seed + k) * 6.283) +
            0.35 * Math.sin(t * f2 + hash01(seed + k + 7) * 6.283)
        x += env * wob(1, 2.1, 3.7)
        y += env * wob(2, 2.6, 4.3)
        rotate += (env / amplitude) * 1.6 * wob(3, 1.9, 3.1)
    }
    return { x, y, rotate }
}

// ---- Flash ----

// A flash's opacity on frame `frame`: full on frame `at`, held for `hold`
// frames, then gone over `fade` frames. 0 before.
export function flashAt(
    frame: number,
    at: number,
    { hold = 1, fade = 4 }: { hold?: number; fade?: number } = {}
): number {
    const t = frame - at
    if (t < 0) return 0
    if (t < hold) return 1
    const out = (t - hold + 1) / (fade + 1)
    return out >= 1 ? 0 : (1 - out) ** 2
}

// ---- Zoom punch ----

// A zoom punched up on the beat: `base`, pushed in by up to `amount`
// (0.12 is 12%) as the beat's `pulse` (0–1) peaks.
export function punchZoom(base: number, pulse: number, amount = 0.12) {
    return base * (1 + amount * pulse)
}

// ---- Transitions ----

export type Transition = "cut" | "flash" | "whip" | "wipe"

// Frames each side of a cut that a whip or wipe takes.
export const TRANSITION_FRAMES = 5

const easeIn = (t: number) => t * t * t
const easeOut = (t: number) => 1 - (1 - t) ** 3

// A whip pan over a cut, for a shot `duration` frames long, on its frame
// `frame`: whipping in (if `enter` is "whip") over its first frames from
// the right, and out (if `exit` is) over its last frames to the left.
// `offset` is the shift as a fraction of the frame's width (negative is
// left) and `blur` the motion blur, 0–1.
export function whipAt(
    frame: number,
    duration: number,
    enter: Transition,
    exit: Transition,
    frames = TRANSITION_FRAMES
): { offset: number; blur: number } {
    if (enter === "whip" && frame < frames) {
        const t = easeOut((frame + 1) / (frames + 1))
        return { offset: 0.7 * (1 - t), blur: 1 - t }
    }
    const left = duration - frame
    if (exit === "whip" && left <= frames) {
        const t = easeIn((frames - left + 1) / (frames + 1))
        return { offset: -0.7 * t, blur: t }
    }
    return { offset: 0, blur: 0 }
}

// A colour wipe over the cut on frame `at`: the panel's left and right
// edges as fractions of the frame's width, sweeping in from the left to
// cover the frame on the cut and off to the right after it. Undefined
// when it isn't on screen.
export function wipeAt(
    frame: number,
    at: number,
    frames = TRANSITION_FRAMES
): { left: number; right: number } | undefined {
    const t = frame - at
    if (t < -frames || t >= frames) return undefined
    // Covering the whole frame on the cut itself.
    if (t <= 0) return { left: 0, right: easeIn((t + frames) / frames) }
    return { left: easeOut(t / frames), right: 1 }
}

// ---- Slam ----

// Something slamming in on frame `at`: from `from` times its size down to
// its own, overshooting (squashing below 1) and settling, with a little
// tilt that straightens. Hidden before `at`.
export function slamAt(
    frame: number,
    at: number,
    fps: number,
    { from = 3.2, tilt = -6 }: { from?: number; tilt?: number } = {}
): { scale: number; rotate: number; opacity: number } {
    if (frame < at) return { scale: from, rotate: tilt, opacity: 0 }
    const t = spring({
        frame: frame - at,
        fps,
        config: { damping: 9, stiffness: 380, mass: 0.55 },
    })
    return {
        scale: from + (1 - from) * t,
        rotate: tilt * (1 - t),
        opacity: 1,
    }
}

// ---- Confetti ----

export type ConfettiPiece = {
    // Position as fractions of the frame's width and height.
    x: number
    y: number
    // Degrees, and how much of its face shows as it tumbles (-1 to 1).
    rotate: number
    flip: number
    colour: string
    // Its size in pixels.
    size: number
}

export type ConfettiOptions = {
    // How many pieces.
    count?: number
    // Their colours, picked per piece.
    colours: readonly string[]
    // Where they burst from, as fractions of the frame.
    origin?: { x: number; y: number }
    // A different burst for a different seed.
    seed?: number
}

// A confetti burst on frame `at`, worked out afresh for frame `frame`: each
// piece shoots up and out from `origin`, slows in the air, falls and
// tumbles. Pure (seeded per piece), so any frame renders the same in any
// order. Empty before the burst; pieces that have fallen off the bottom
// are left out.
export function confettiAt(
    frame: number,
    at: number,
    fps: number,
    {
        count = 140,
        colours,
        origin = { x: 0.5, y: 0.6 },
        seed = 1,
    }: ConfettiOptions
): ConfettiPiece[] {
    const t = (frame - at) / fps
    if (t < 0 || colours.length === 0) return []
    const pieces: ConfettiPiece[] = []
    // Air drag (per second) and gravity (frame heights per second squared).
    const drag = 1.9
    const gravity = 0.9
    // Under drag a speed v0 covers v0 (1 - e^(-kt)) / k by time t.
    const decay = (1 - Math.exp(-drag * t)) / drag
    for (let i = 0; i < count; i++) {
        const r = (k: number) => hash01(seed * 7919 + i * 31 + k)
        // Up and out, in a wide cone.
        const angle = -Math.PI / 2 + (r(1) - 0.5) * Math.PI * 1.1
        const speed = 1.1 + 1.9 * r(2)
        const x = origin.x + Math.cos(angle) * speed * 0.62 * decay
        // Gravity pulls towards a terminal fall of gravity / drag.
        const y =
            origin.y +
            Math.sin(angle) * speed * decay +
            (gravity / drag) * (t - decay)
        if (y > 1.1) continue
        pieces.push({
            x,
            y,
            rotate: r(4) * 360 + (r(3) - 0.5) * 900 * t,
            flip: Math.cos(t * (6 + 10 * r(5)) + r(6) * 6.283),
            colour: colours[Math.floor(r(7) * colours.length)] ?? colours[0],
            size: 16 + 18 * r(8),
        })
    }
    return pieces
}
