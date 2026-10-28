import { describe, expect, it } from "vite-plus/test"
import { HUD_ROWS } from "../../src/layout"
import { vec2 } from "../../src/vec2"
import {
    EASE_IN_OUT,
    baseCell,
    clampCamera,
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

    it("holds the end past the track", () => {
        const track = walkingTrack(30)
        const end = playerCentre(track, 0, 30, 0)
        expect(playerCentre(track, 0, 500, 0.7)).toEqual(end)
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

    it("averages the short way round through a wrap tunnel", () => {
        // Stepping left off x 0 onto x 16 (the board is 17 wide).
        const track: PlayerTrack = {
            board: BOARD,
            ticks: Array.from({ length: 61 }, (_, k) => {
                const x = k < 30 ? 0 : 16
                return [
                    {
                        pos: vec2(x, 7),
                        lastPos: vec2(k < 30 ? 1 : 0, 7),
                        moveProgress: 1,
                        speed: 4,
                        rate: 1,
                    },
                ]
            }),
        }
        // Frame 16 is tick 32: just through, with earlier frames at x 0.
        const p = followPoint(16, time, track, { smoothing: 4 })
        expect(p.x).toBeGreaterThan(16.5)
        expect(p.x).toBeLessThan(17.6)
    })
})
