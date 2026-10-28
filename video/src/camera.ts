import { Easing, interpolate, type EasingFunction } from "remotion"
import { glidePos, wrapDelta, type Glider } from "../../src/glide"
import { HUD_ROWS } from "../../src/layout"
import { gameTimeFor, type TimeMap } from "./time"

// The camera over the game board: maths only, no React, so it is unit-tested.
//
// Positions are in maze cells: the maze's top-left corner is (0, 0) and cell
// (x, y)'s centre is (x + 0.5, y + 0.5). The HUD strip sits above the maze,
// from y = -HUD_ROWS to 0. Like the time mapping, every camera here is a
// pure function of the frame.

export type Camera = {
    // The point at the centre of the video frame, in maze cells.
    x: number
    y: number
    // 1 fits the whole board (maze and HUD) in the frame; 2 shows half as
    // much, twice as big.
    zoom: number
}

// The maze's size in cells.
export type Board = { cols: number; rows: number }

// The video frame's size in pixels.
export type Frame = { width: number; height: number }

// How much of the frame the whole board fills at zoom 1, leaving a margin.
export const FIT = 0.92

// Pixels per cell at zoom 1.
export function baseCell(board: Board, frame: Frame, fit = FIT): number {
    return (
        Math.min(
            frame.width / board.cols,
            frame.height / (board.rows + HUD_ROWS)
        ) * fit
    )
}

// The camera that shows the whole board, centred.
export function wholeBoard(board: Board): Camera {
    return { x: board.cols / 2, y: (board.rows - HUD_ROWS) / 2, zoom: 1 }
}

// `camera` moved as little as needed to keep the frame on the board: along
// an axis where the view is bigger than the board, the board is centred;
// otherwise the view's edges stay within the board's (HUD included). A zoom
// below 1 is raised to 1.
export function clampCamera(
    camera: Camera,
    board: Board,
    frame: Frame,
    fit = FIT
): Camera {
    const zoom = Math.max(1, camera.zoom)
    const cell = baseCell(board, frame, fit) * zoom
    const clampAxis = (v: number, lo: number, hi: number, view: number) => {
        if (view >= hi - lo) return (lo + hi) / 2
        return Math.min(Math.max(v, lo + view / 2), hi - view / 2)
    }
    return {
        x: clampAxis(camera.x, 0, board.cols, frame.width / cell),
        y: clampAxis(camera.y, -HUD_ROWS, board.rows, frame.height / cell),
        zoom,
    }
}

// Where to put the board's canvas, in frame pixels, so `camera` looks at
// it: its top-left corner and size.
export type Placement = {
    left: number
    top: number
    width: number
    height: number
}

export function placement(
    camera: Camera,
    board: Board,
    frame: Frame,
    fit = FIT
): Placement {
    const cell = baseCell(board, frame, fit) * camera.zoom
    return {
        left: frame.width / 2 - camera.x * cell,
        top: frame.height / 2 - (camera.y + HUD_ROWS) * cell,
        width: board.cols * cell,
        height: (board.rows + HUD_ROWS) * cell,
    }
}

// ---- Keyframes ----

// Cubic easings, as Bézier curves. (Passing Easing.cubic around as a value
// trips the unbound-method lint.)
export const EASE_IN = Easing.bezier(0.32, 0, 0.67, 0)
export const EASE_OUT = Easing.bezier(0.33, 1, 0.68, 1)
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1)

const linear = (t: number) => t

export type Keyframe = {
    frame: number
    value: number
    // The easing of the move into this key from the one before (linear when
    // left out).
    easing?: EasingFunction
}

// The value at `frame` of a keyframed track: held before the first key and
// after the last, eased between.
export function keyframes(frame: number, keys: readonly Keyframe[]): number {
    if (keys.length === 0) throw new Error("No keyframes")
    const sorted = [...keys].sort((a, b) => a.frame - b.frame)
    const first = sorted[0]
    if (frame <= first.frame) return first.value
    for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1]
        const b = sorted[i]
        if (frame <= b.frame) {
            if (b.frame === a.frame) return b.value
            return interpolate(frame, [a.frame, b.frame], [a.value, b.value], {
                easing: b.easing ?? linear,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
            })
        }
    }
    return sorted[sorted.length - 1].value
}

// ---- Following a player ----

// Where each player is on every tick of a recording: their characters'
// glide state (see glide.ts) and rate, per tick, player 1 first. Built once
// per recording (see trackOf in replayers.ts).
export type PlayerTrack = {
    board: Board
    // ticks[k][i]: player i after k ticks.
    ticks: readonly (readonly (Glider & { rate: number })[])[]
}

// The centre of player `player`'s sprite at game time `tick` + `alpha`, as
// the renderer draws it (gliding between cells), in maze cells. Ticks past
// the track hold its end.
export function playerCentre(
    track: PlayerTrack,
    player: number,
    tick: number,
    alpha: number
): { x: number; y: number } {
    const last = track.ticks.length - 1
    const k = Math.min(Math.max(tick, 0), last)
    const glider = track.ticks[k][player]
    if (!glider) throw new Error(`No player ${player}`)
    const { cols, rows } = track.board
    // Past the end nothing moves on, so no alpha.
    const p = glidePos(glider, k < tick ? 0 : alpha, cols, rows, glider.rate)
    return { x: p.x + 0.5, y: p.y + 0.5 }
}

export type FollowOptions = {
    // Which player (0 is player 1).
    player?: number
    // How many earlier frames to average over: more is smoother and lags
    // more. 0 follows exactly.
    smoothing?: number
}

// The point to follow player `player` at on clip frame `frame` of a clip
// played with `time`: its sprite's centre averaged over the last
// `smoothing` frames, weighted towards the latest. Pure: it looks at
// the frames' game times, not at frames rendered before.
export function followPoint(
    frame: number,
    time: TimeMap,
    track: PlayerTrack,
    { player = 0, smoothing = 12 }: FollowOptions = {}
): { x: number; y: number } {
    const at = (f: number) => {
        const { tick, alpha } = gameTimeFor(f, time)
        return playerCentre(track, player, tick, alpha)
    }
    const now = at(frame)
    let sumX = 0
    let sumY = 0
    let sumW = 0
    for (let back = 0; back <= smoothing; back++) {
        const p = back === 0 ? now : at(frame - back)
        // Through a wrap tunnel the point jumps a whole board; average the
        // short way round from where it is now.
        const dx = wrapDelta(p.x - now.x, track.board.cols)
        const dy = wrapDelta(p.y - now.y, track.board.rows)
        const w = smoothing + 1 - back
        sumX += dx * w
        sumY += dy * w
        sumW += w
    }
    return { x: now.x + sumX / sumW, y: now.y + sumY / sumW }
}

// ---- Camera functions ----

// What a clip tells its camera besides the frame.
export type CameraContext = {
    time: TimeMap
    board: Board
    // The players' track (built on first use; see trackOf in replayers.ts).
    track: () => PlayerTrack
}

// A camera move: the camera on each clip frame. GameplayClip clamps what it
// returns (see clampCamera), so a camera may aim past the board's edges.
export type CameraFn = (frame: number, context: CameraContext) => Camera

// A zoom that is a number or changes per frame (e.g. a keyframed track).
export type Zoom = number | ((frame: number) => number)

function zoomAt(zoom: Zoom, frame: number): number {
    return typeof zoom === "number" ? zoom : zoom(frame)
}

// The whole board, still.
export const overview: CameraFn = (_frame, { board }) => wholeBoard(board)

// Follow a player (see followPoint) at `zoom`. At zoom 1 the board fits the
// frame and clamping centres it, so zooming in from 1 eases from the whole
// board onto the player.
export function follow({
    zoom = 2,
    ...options
}: FollowOptions & { zoom?: Zoom } = {}): CameraFn {
    return (frame, { time, track }) => ({
        ...followPoint(frame, time, track(), options),
        zoom: zoomAt(zoom, frame),
    })
}

// Look at a fixed point (maze cells) at `zoom`.
export function fixed(x: number, y: number, zoom: Zoom = 1): CameraFn {
    return (frame) => ({ x, y, zoom: zoomAt(zoom, frame) })
}
