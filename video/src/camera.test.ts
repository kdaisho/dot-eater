import { describe, expect, it } from "vite-plus/test"
import { HUD_ROWS } from "../../src/layout"
import { vec2 } from "../../src/vec2"
import {
    EASE_IN_OUT,
    baseCell,
    clampCamera,
    drawTime,
    followPoint,
    keyframes,
    placement,
    playerCentre,
    wholeBoard,
    type PlayerTrack,
} from "./camera"
import type { TimeMap } from "./time"

const BOARD = { cols: 17, rows: 15 }
const FRAME = { width: 1920, height: 1080 }

// A one-player track: the player steps right one cell every `every` ticks
// along row 7 (a whole move, glide included, takes `every` ticks).
function walkingTrack(ticks: number, every = 15): PlayerTrack {
    const speed = 60 / every
    return {
        board: BOARD,
        ticks: Array.from({ length: ticks + 1 }, (_, k) => {
            const x = 1 + Math.floor(k / every)
            const since = k % every
            return [
                {
                    pos: vec2(x, 7),
                    lastPos: vec2(Math.max(1, x - 1), 7),
                    moveProgress: k < every ? 1 : since / every,
                    speed,
                    rate: 1,
                },
            ]
        }),
        moving: Array.from({ length: ticks + 1 }, () => true),
    }
}

// A one-player track like walkingTrack, but from x 10 along row 7 and on
// through the tunnel at the right edge (x 16 to 0) and beyond.
function tunnelTrack(ticks: number, every = 15): PlayerTrack {
    const speed = 60 / every
    const xAt = (k: number) => (10 + Math.floor(k / every)) % BOARD.cols
    return {
        board: BOARD,
        ticks: Array.from({ length: ticks + 1 }, (_, k) => [
            {
                pos: vec2(xAt(k), 7),
                lastPos: vec2(k < every ? xAt(k) : xAt(k - every), 7),
                moveProgress: k < every ? 1 : (k % every) / every,
                speed,
                rate: 1,
            },
        ]),
        moving: Array.from({ length: ticks + 1 }, () => true),
    }
}

describe("baseCell and wholeBoard", () => {
    it("fits the whole board, HUD included, in the frame", () => {
        const cell = baseCell(BOARD, FRAME, 1)
        expect(cell).toBe(1080 / 16)
        const place = placement(wholeBoard(BOARD), BOARD, FRAME, 1)
        expect(place.top).toBeCloseTo(0)
        expect(place.height).toBeCloseTo(1080)
        expect(place.left + place.width / 2).toBeCloseTo(960)
    })
})

describe("clampCamera", () => {
    it("centres the board along an axis the view is bigger than", () => {
        const camera = clampCamera({ x: 0, y: 0, zoom: 1 }, BOARD, FRAME)
        expect(camera).toEqual(wholeBoard(BOARD))
    })

    it("keeps a zoomed view's edges on the board", () => {
        const camera = clampCamera({ x: -5, y: 99, zoom: 3 }, BOARD, FRAME)
        const place = placement(camera, BOARD, FRAME)
        expect(place.left).toBeCloseTo(0)
        expect(place.top + place.height).toBeCloseTo(1080)
    })

    it("leaves a view inside the board alone", () => {
        const camera = { x: 8.5, y: 7.5, zoom: 3 }
        expect(clampCamera(camera, BOARD, FRAME)).toEqual(camera)
    })

    it("raises a zoom below 1", () => {
        expect(clampCamera({ x: 3, y: 3, zoom: 0.5 }, BOARD, FRAME).zoom).toBe(
            1
        )
    })

    it("counts the HUD as part of the board", () => {
        const camera = clampCamera({ x: 8, y: -10, zoom: 3 }, BOARD, FRAME)
        const place = placement(camera, BOARD, FRAME)
        expect(place.top).toBeCloseTo(0)
        // The view's top edge is the HUD's, above the maze's.
        const view = FRAME.height / (baseCell(BOARD, FRAME) * 3)
        expect(camera.y - view / 2).toBeCloseTo(-HUD_ROWS)
    })
})

describe("keyframes", () => {
    const keys = [
        { frame: 10, value: 1 },
        { frame: 20, value: 3 },
        { frame: 40, value: 2, easing: EASE_IN_OUT },
    ]

    it("holds before the first key and after the last", () => {
        expect(keyframes(0, keys)).toBe(1)
        expect(keyframes(99, keys)).toBe(2)
    })

    it("moves linearly by default and with the key's easing", () => {
        expect(keyframes(15, keys)).toBe(2)
        expect(keyframes(30, keys)).toBeCloseTo(2.5)
        // Eased: slow at the start.
        expect(keyframes(22, keys)).toBeGreaterThan(2.95)
    })

    it("takes keys in any order", () => {
        expect(keyframes(15, [...keys].reverse())).toBe(2)
    })
})

describe("playerCentre", () => {
    it("glides between cells with alpha, like the renderer", () => {
        const track = walkingTrack(100)
        // Tick 15: just moved from x 1 to 2, drawn at 1 (cell centre 1.5).
        expect(playerCentre(track, 0, 15, 0).x).toBeCloseTo(1.5)
        // Halfway through the glide.
        expect(playerCentre(track, 0, 22, 0.5).x).toBeCloseTo(2)
    })

    it("ignores alpha on the track's last tick", () => {
        // Tick 20 is a third of the way through a glide.
        const track = walkingTrack(20)
        expect(playerCentre(track, 0, 20, 0.5)).toEqual(
            playerCentre(track, 0, 20, 0)
        )
    })

    it("holds the end past the track", () => {
        const track = walkingTrack(30)
        const end = playerCentre(track, 0, 30, 0)
        expect(playerCentre(track, 0, 500, 0.7)).toEqual(end)
    })
})

describe("drawTime", () => {
    // 0.6 ticks a frame: frame 33 is tick 19.8, frame 34 is 20.4.
    const time: TimeMap = { fps: 30, segments: [{ fromFrame: 0, speed: 0.3 }] }
    const moving = (end: boolean) =>
        Array.from({ length: 21 }, (_, k) => k < 20 || end)

    it("is the frame's game time while the game moves", () => {
        const t = drawTime(11, time, { moving: moving(true) })
        expect(t.tick).toBe(6)
        expect(t.alpha).toBeCloseTo(0.6)
    })

    it("keeps the last alpha of play on an end screen, as main does", () => {
        for (const frame of [34, 40, 500]) {
            const t = drawTime(frame, time, { moving: moving(false) })
            expect(t.tick).toBe(20)
            expect(t.alpha).toBeCloseTo(0.8)
        }
    })

    it("holds a recording that ends mid-play at alpha 0", () => {
        expect(drawTime(40, time, { moving: moving(true) })).toEqual({
            tick: 20,
            alpha: 0,
        })
    })
})

describe("followPoint", () => {
    const time: TimeMap = { fps: 30 }

    it("follows exactly with no smoothing", () => {
        const track = walkingTrack(200)
        const p = followPoint(20, time, track, { smoothing: 0 })
        expect(p).toEqual(playerCentre(track, 0, 40, 0))
    })

    it("lags behind a moving player when smoothing", () => {
        const track = walkingTrack(200)
        const exact = followPoint(40, time, track, { smoothing: 0 })
        const smooth = followPoint(40, time, track, { smoothing: 10 })
        expect(smooth.x).toBeLessThan(exact.x)
        expect(smooth.y).toBeCloseTo(exact.y)
    })

    it("moves smoothly frame to frame", () => {
        const track = walkingTrack(400)
        const xs = Array.from(
            { length: 60 },
            (_, f) => followPoint(f + 20, time, track).x
        )
        const steps = xs.slice(1).map((x, i) => x - xs[i])
        for (const step of steps) {
            expect(step).toBeGreaterThanOrEqual(0)
            expect(step).toBeLessThan(0.3)
        }
    })

    it("depends only on the frame", () => {
        const track = walkingTrack(400)
        const a = followPoint(50, time, track)
        followPoint(10, time, track)
        followPoint(90, time, track)
        expect(followPoint(50, time, track)).toEqual(a)
    })

    it("pans across the board through a wrap tunnel, not in one frame", () => {
        // Through the tunnel at tick 105 (x 16 to 0), frame 52.5.
        const track = tunnelTrack(400)
        const camera = (f: number) =>
            clampCamera(
                { ...followPoint(f, time, track), zoom: 3 },
                BOARD,
                FRAME
            )
        const view = FRAME.width / (baseCell(BOARD, FRAME) * 3)
        const xs = Array.from({ length: 60 }, (_, f) => camera(f + 30).x)
        const steps = xs.slice(1).map((x, i) => Math.abs(x - xs[i]))
        expect(Math.max(...steps)).toBeLessThan(3)
        // On the right edge before, and on the left edge after.
        expect(xs[0]).toBeCloseTo(BOARD.cols - view / 2)
        expect(xs.at(-1)).toBeCloseTo(view / 2)
    })

    it("doesn't average across both sides of a tunnel", () => {
        // Through at tick 105; long after, settled on the new side as if
        // it had always been there.
        const track = tunnelTrack(400)
        const p = followPoint(90, time, track, { smoothing: 4 })
        const exact = followPoint(90, time, track, { smoothing: 0 })
        expect(p.x).toBeGreaterThan(0)
        expect(p.x).toBeLessThan(exact.x)
        expect(exact.x - p.x).toBeLessThan(1)
    })
})
