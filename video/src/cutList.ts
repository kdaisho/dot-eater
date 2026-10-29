import { TICK_RATE } from "../../src/constants"
import type { AnimalId } from "../../src/roster"
import { tickCount, type Recording } from "../../src/replay"
import type { Beats } from "./beats"
import {
    EASE_IN_OUT,
    EASE_OUT,
    follow,
    followPoint,
    keyframes,
    type CameraFn,
} from "./camera"
import {
    punchZoom,
    speedRamp,
    type RampOptions,
    type Transition,
} from "./drama"
import { alignTo, gameTimeAt, type TimeMap } from "./time"

// A declarative edit: shots in order, each so many beats long, laid end to
// end on the music's beat grid and compiled into frame ranges. A gameplay
// shot names a moment of a recording (its hero tick, and where on the
// board it happens); the compiler lines the clip up so that tick lands
// exactly on a chosen beat of the shot.
//
// Pure: CutSequence.tsx draws a compiled cut list.

// A point on the board, in maze cells (cell (x, y)'s centre is
// (x + 0.5, y + 0.5)).
export type BoardPoint = { x: number; y: number }

export type CameraMove = {
    // push: zoom in to the hero moment; pull: zoom out from it; hold: stay;
    // follow: follow `player` instead of looking at `at`.
    move?: "push" | "pull" | "hold" | "follow"
    // The zoom at the shot's start and at the hero frame (one number holds).
    zoom?: number | readonly [number, number]
    // How hard to punch in on the beat (0.12 is 12%; 0 for none).
    punch?: number
    // Which player follow follows (0 is player 1).
    player?: number
}

type ShotBase = {
    // For error messages and the Studio's timeline.
    name: string
    // How long the shot lasts, in beats (fractions allowed: 0.5 is an
    // eighth note).
    durationBeats: number
    // How the shot comes in: a hard cut, a cut on a 1-frame flash, a whip
    // pan, or a colour wipe. A hard cut when left out.
    transition?: Transition
    // The shot's colour, for its flash, wipe and caption.
    colour?: string
}

export type GameShot = ShotBase & {
    kind?: "game"
    recording: Recording
    // The tick of the moment the shot is about.
    heroTick: number
    // Where on the board it happens: the camera centres there.
    at: BoardPoint
    // Which beat of the shot (0 is its first) the hero tick lands on.
    // The middle beat when left out.
    heroBeat?: number
    // The speed ramp into the moment (see speedRamp); false plays it in
    // real time.
    speed?: RampOptions | false
    camera?: CameraMove
    // A word or two over the shot, slamming in on the hero beat.
    caption?: string
    // How hard the camera shakes on the hero frame (0 for none; 1 when
    // left out).
    shake?: number
}

export type CardShot = ShotBase & {
    kind: "card"
    // The character whose name slams in, one beat at a time.
    animal: AnimalId
}

export type Shot = GameShot | CardShot

export type CutList = {
    // The beat the first shot starts on (0 when left out).
    startBeat?: number
    shots: readonly Shot[]
}

export type CompiledShot = {
    shot: Shot
    index: number
    // The shot's frames: from `from`, for `duration` frames.
    from: number
    duration: number
    // The beat (of the grid) it starts on.
    startBeat: number
    // How it comes in and goes out (the next shot's way in).
    enter: Transition
    exit: Transition
    // Each beat in the shot, as a shot frame (0 is the shot's first).
    beats: readonly number[]
    // Gameplay shots: the hero frame (a shot frame), the time mapping and
    // the camera.
    game?: {
        hero: number
        time: TimeMap
        camera: CameraFn
        // The ticks the shot shows, first to last (fractional).
        ticks: { first: number; last: number }
    }
}

// A cut list that can't be cut: every problem found, one per line.
export class CutListError extends Error {
    constructor(readonly problems: readonly string[]) {
        super(`The cut list doesn't fit:\n- ${problems.join("\n- ")}`)
        this.name = "CutListError"
    }
}

const DEFAULT_ZOOM: Record<
    NonNullable<CameraMove["move"]>,
    [number, number]
> = {
    push: [1.9, 3.1],
    pull: [3.2, 2],
    hold: [2.6, 2.6],
    follow: [2.4, 2.4],
}

// The camera of a gameplay shot: from the player onto its board position
// by the hero frame (or following the player throughout), zooming as its move says to land on the hero frame, punched in
// on the beat. `from` is the shot's first frame, for the beat pulse.
export function shotCamera(
    shot: GameShot,
    hero: number,
    from: number,
    duration: number,
    beats: Beats
): CameraFn {
    const { move = "push", punch = 0.1, player = 0 } = shot.camera ?? {}
    const zoomSpec = shot.camera?.zoom ?? DEFAULT_ZOOM[move]
    const [z0, z1] =
        typeof zoomSpec === "number" ? [zoomSpec, zoomSpec] : zoomSpec
    const zoom = (frame: number) =>
        punchZoom(
            keyframes(frame, [
                { frame: 0, value: z0 },
                { frame: hero, value: z1, easing: EASE_IN_OUT },
                // Keep drifting a little past the moment.
                {
                    frame: Math.max(hero + 1, duration),
                    value: z1 + (z1 - z0) * 0.15,
                    easing: EASE_OUT,
                },
            ]),
            beats.pulse(frame + from),
            punch
        )
    if (move === "follow") return follow({ player, smoothing: 6, zoom })
    // Starts on the player, closing in on the moment's position by the
    // hero frame and staying there, so the run leads into the moment.
    return (frame, { time, track }) => {
        const w = frame >= hero ? 1 : 0.35 + 0.65 * smoothstep(frame / hero)
        const p = followPoint(frame, time, track(), { player, smoothing: 8 })
        return {
            x: p.x + (shot.at.x - p.x) * w,
            y: p.y + (shot.at.y - p.y) * w,
            zoom: zoom(frame),
        }
    }
}

function smoothstep(t: number): number {
    const x = Math.min(Math.max(t, 0), 1)
    return x * x * (3 - 2 * x)
}

// The cut list as frames on the beat grid. Throws a CutListError listing
// every shot that doesn't fit (a hero tick the clip can't reach, a clip
// that would run off either end of its recording, a hero beat outside its
// shot).
export function compileCuts(list: CutList, beats: Beats): CompiledShot[] {
    const problems: string[] = []
    const compiled: CompiledShot[] = []
    let beat = list.startBeat ?? 0
    for (const [index, shot] of list.shots.entries()) {
        const label = `Shot ${index + 1} "${shot.name}"`
        if (!(shot.durationBeats > 0)) {
            problems.push(`${label}: durationBeats must be above 0`)
            continue
        }
        const from = Math.round(beats.beatFrame(beat))
        const to = Math.round(beats.beatFrame(beat + shot.durationBeats))
        const duration = to - from
        const shotBeats: number[] = []
        for (let k = 0; k < shot.durationBeats; k++) {
            shotBeats.push(Math.round(beats.beatFrame(beat + k)) - from)
        }
        const next = list.shots[index + 1]
        const item: CompiledShot = {
            shot,
            index,
            from,
            duration,
            startBeat: beat,
            enter: index === 0 ? "cut" : (shot.transition ?? "cut"),
            exit: next?.transition ?? "cut",
            beats: shotBeats,
        }
        if (shot.kind !== "card") {
            const heroBeat = shot.heroBeat ?? Math.floor(shot.durationBeats / 2)
            if (heroBeat < 0 || heroBeat >= shot.durationBeats) {
                problems.push(
                    `${label}: heroBeat ${heroBeat} is outside its ${shot.durationBeats} beats`
                )
            }
            const hero = Math.round(beats.beatFrame(beat + heroBeat)) - from
            const segments =
                shot.speed === false ? [] : speedRamp(hero, shot.speed)
            const map: TimeMap = { fps: beats.fps, segments }
            const lead = gameTimeAt(hero, map)
            const time = alignTo(map, hero, shot.heroTick)
            const first = gameTimeAt(0, time)
            const last = gameTimeAt(duration - 1, time)
            const length = tickCount(shot.recording)
            if (shot.heroTick > length) {
                problems.push(
                    `${label}: heroTick ${shot.heroTick} is past the recording's end (tick ${length})`
                )
            } else if (lead > shot.heroTick + 1e-9) {
                problems.push(
                    `${label}: needs ${lead.toFixed(0)} ticks of play before heroTick ${shot.heroTick} but the recording has only ${shot.heroTick} (${secs(lead - shot.heroTick)} short): put the hero beat earlier, shorten the ramp or pick a later moment`
                )
            }
            if (last > length && shot.heroTick <= length) {
                problems.push(
                    `${label}: runs to tick ${last.toFixed(0)} but the recording ends at tick ${length} (${secs(last - length)} over): shorten the shot, put the hero beat later or slow it down`
                )
            }
            item.game = {
                hero,
                time,
                camera: shotCamera(shot, hero, from, duration, beats),
                ticks: { first, last },
            }
        }
        compiled.push(item)
        beat += shot.durationBeats
    }
    if (problems.length) throw new CutListError(problems)
    return compiled
}

// Ticks as seconds of real time, for messages.
const secs = (ticks: number) => `${(ticks / TICK_RATE).toFixed(1)} s`

// The frame after the last shot: the cut list's length.
export function cutLength(shots: readonly CompiledShot[]): number {
    const last = shots[shots.length - 1]
    return last ? last.from + last.duration : 0
}
