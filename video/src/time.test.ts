import { describe, expect, it } from "vite-plus/test"
import {
    alignTo,
    frameAtTick,
    gameTimeAt,
    gameTimeFor,
    segmentDistance,
    ticksPerFrame,
    type TimeMap,
} from "./time"

describe("gameTimeAt", () => {
    it("plays in real time with no segments: 2 ticks a frame at 30 fps", () => {
        const map: TimeMap = { fps: 30 }
        expect(ticksPerFrame(30)).toBe(2)
        expect(gameTimeAt(0, map)).toBe(0)
        expect(gameTimeAt(1, map)).toBe(2)
        expect(gameTimeAt(45, map)).toBe(90)
    })

    it("starts at startTick and holds it before frame 0", () => {
        const map: TimeMap = { fps: 60, startTick: 100 }
        expect(gameTimeAt(-5, map)).toBe(100)
        expect(gameTimeAt(0, map)).toBe(100)
        expect(gameTimeAt(10, map)).toBe(110)
    })

    it("slows down from a segment's frame without jumping", () => {
        const map: TimeMap = {
            fps: 30,
            segments: [{ fromFrame: 10, speed: 0.25 }],
        }
        expect(gameTimeAt(10, map)).toBe(20)
        expect(gameTimeAt(11, map)).toBe(20.5)
        expect(gameTimeAt(14, map)).toBe(22)
    })

    it("freezes on a speed 0 segment and carries on after it", () => {
        const map: TimeMap = {
            fps: 30,
            segments: [
                { fromFrame: 10, speed: 0 },
                { fromFrame: 20, speed: 1 },
            ],
        }
        expect(gameTimeAt(15, map)).toBe(20)
        expect(gameTimeAt(20, map)).toBe(20)
        expect(gameTimeAt(25, map)).toBe(30)
    })

    it("takes segments in any order", () => {
        const a: TimeMap = {
            fps: 30,
            segments: [
                { fromFrame: 5, speed: 0.5 },
                { fromFrame: 15, speed: 2 },
            ],
        }
        const b: TimeMap = {
            fps: 30,
            segments: [
                { fromFrame: 15, speed: 2 },
                { fromFrame: 5, speed: 0.5 },
            ],
        }
        for (const f of [0, 4, 9, 16, 40]) {
            expect(gameTimeAt(f, b)).toBe(gameTimeAt(f, a))
        }
        // 5 frames real time, 10 at half, 5 at double: 5 + 5 + 10 = 20.
        expect(gameTimeAt(20, a)).toBe(40)
    })

    it("eases into a new speed over its ramp", () => {
        const map: TimeMap = {
            fps: 60,
            segments: [{ fromFrame: 0, speed: 0, ramp: 10 }],
        }
        // Speed falls 1 -> 0 over 10 frames: covers 5 frames' worth, then
        // holds.
        expect(gameTimeAt(10, map)).toBe(5)
        expect(gameTimeAt(30, map)).toBe(5)
        // Halfway down the ramp: 5 * 1 - 25 / 20 = 3.75.
        expect(gameTimeAt(5, map)).toBe(3.75)
    })

    it("carries the speed reached when a ramp is cut short", () => {
        const map: TimeMap = {
            fps: 60,
            segments: [
                { fromFrame: 0, speed: 0, ramp: 10 },
                // Starts at speed 0.5, half way down the ramp.
                { fromFrame: 5, speed: 1, ramp: 10 },
            ],
        }
        // 3.75, then 0.5 -> 1 over 10 frames: 7.5 more.
        expect(gameTimeAt(15, map)).toBe(11.25)
    })

    it("never runs backwards", () => {
        const map: TimeMap = {
            fps: 30,
            segments: [
                { fromFrame: 3, speed: 0.1, ramp: 7 },
                { fromFrame: 20, speed: 0 },
                { fromFrame: 22, speed: 3, ramp: 4 },
            ],
        }
        let last = -Infinity
        for (let f = -2; f < 60; f++) {
            const t = gameTimeAt(f, map)
            expect(t).toBeGreaterThanOrEqual(last)
            last = t
        }
    })

    it("depends only on the frame, whatever was asked before", () => {
        const map: TimeMap = {
            fps: 30,
            segments: [{ fromFrame: 8, speed: 0.3, ramp: 5 }],
        }
        const forward = [0, 5, 10, 20].map((f) => gameTimeAt(f, map))
        const backward = [20, 10, 5, 0].map((f) => gameTimeAt(f, map))
        expect(backward.reverse()).toEqual(forward)
    })

    it("rejects negative speeds", () => {
        const map: TimeMap = {
            fps: 30,
            segments: [{ fromFrame: 0, speed: -1 }],
        }
        expect(() => gameTimeAt(5, map)).toThrow(/Negative/)
    })
})

describe("segmentDistance", () => {
    it("is speed times frames without a ramp", () => {
        expect(segmentDistance(1, 0.5, 0, 8)).toBe(4)
        expect(segmentDistance(1, 0.5, 0, 0)).toBe(0)
    })
})

describe("gameTimeFor", () => {
    it("splits game time into a whole tick and alpha", () => {
        const map: TimeMap = {
            fps: 30,
            segments: [{ fromFrame: 0, speed: 0.25 }],
        }
        expect(gameTimeFor(3, map)).toEqual({ tick: 1, alpha: 0.5 })
    })

    it("snaps float error to the whole tick", () => {
        const map: TimeMap = {
            fps: 30,
            segments: [{ fromFrame: 0, speed: 0.1 }],
        }
        // 0.2 ticks a frame: 15 frames is 3 ticks, not 2.9999.
        expect(gameTimeFor(15, map)).toEqual({ tick: 3, alpha: 0 })
    })
})

describe("alignTo", () => {
    it("starts the clip so a frame shows a given tick", () => {
        const map: TimeMap = {
            fps: 30,
            segments: [{ fromFrame: 10, speed: 0.5 }],
        }
        const aligned = alignTo(map, 20, 300)
        // 10 frames at 2 ticks, 10 at 1: 30 ticks of lead.
        expect(aligned.startTick).toBe(270)
        expect(gameTimeAt(20, aligned)).toBe(300)
        expect(aligned.segments).toBe(map.segments)
    })

    it("never starts before the recording", () => {
        expect(alignTo({ fps: 30 }, 100, 50).startTick).toBe(0)
    })
})

describe("frameAtTick", () => {
    it("finds the first frame reaching a tick", () => {
        const map: TimeMap = {
            fps: 30,
            segments: [{ fromFrame: 10, speed: 0.5 }],
        }
        expect(frameAtTick(0, map)).toBe(0)
        expect(frameAtTick(19, map)).toBe(10)
        expect(frameAtTick(20, map)).toBe(10)
        expect(frameAtTick(21, map)).toBe(11)
        expect(frameAtTick(22, map)).toBe(12)
    })

    it("is Infinity for a tick a freeze never reaches", () => {
        const map: TimeMap = {
            fps: 30,
            segments: [{ fromFrame: 10, speed: 0 }],
        }
        expect(frameAtTick(50, map, 1000)).toBe(Infinity)
    })
})
