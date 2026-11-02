import { describe, expect, it } from "vite-plus/test"
import type { GameEvent } from "../../src/events"
import type { ScreenKind } from "../../src/flow"
import { SfxId } from "../../src/sfx"
import {
    DIP,
    FADE_OUT,
    musicSections,
    musicVolume,
    sfxTimeline,
    type ClipTiming,
} from "./soundtrack"

const dot: GameEvent = { type: "dotEaten" } as GameEvent
const caught: GameEvent = { type: "playerCaught" } as GameEvent
const lost: GameEvent = { type: "gameLost" } as GameEvent

// A run log with `events` on the given ticks, `length` ticks long.
function ticks(length: number, events: Record<number, GameEvent[]>) {
    return Array.from({ length }, (_, k) => ({ events: events[k] ?? [] }))
}

// Real time at 30 fps: two ticks a frame.
const realTime = (from: number, duration: number, startTick = 0) => ({
    time: { fps: 30, startTick },
    from,
    duration,
})

describe("sfxTimeline", () => {
    it("plays a tick's sounds on the first frame that shows it", () => {
        // Tick 10 shows on clip frame 5, composition frame 105.
        const cues = sfxTimeline(realTime(100, 50), ticks(20, { 10: [dot] }))
        expect(cues).toEqual([{ at: 105 / 30, id: SfxId.dot }])
    })

    it("plays eventSounds of the tick: each once, game over over the catch", () => {
        const cues = sfxTimeline(
            realTime(0, 50),
            ticks(20, { 4: [dot, dot, caught, lost] })
        )
        expect(cues.map((c) => c.id)).toEqual([SfxId.dot, SfxId.gameOver])
    })

    it("plays nothing for ticks the clip never shows", () => {
        const log = ticks(100, { 9: [dot], 10: [dot], 11: [dot], 70: [dot] })
        // Starts showing tick 10 (already done on frame 0), ends at
        // frame 30 (tick 70 would show on frame 30).
        const cues = sfxTimeline(realTime(0, 30, 10), log)
        expect(cues).toEqual([{ at: 1 / 30, id: SfxId.dot }])
    })

    it("plays an effect once per frame", () => {
        // Ticks 3 and 4 both first show on frame 2.
        const cues = sfxTimeline(
            realTime(0, 50),
            ticks(10, { 3: [dot], 4: [dot, caught] })
        )
        expect(cues).toEqual([
            { at: 2 / 30, id: SfxId.dot },
            { at: 2 / 30, id: SfxId.caught },
        ])
    })

    it("spaces sounds out in slow motion", () => {
        const slow: ClipTiming = {
            time: { fps: 30, segments: [{ fromFrame: 0, speed: 0.25 }] },
            from: 0,
            duration: 100,
        }
        // Half a tick a frame: ticks 2 and 4 on frames 4 and 8.
        const cues = sfxTimeline(slow, ticks(10, { 2: [dot], 4: [dot] }))
        expect(cues.map((c) => c.at * 30)).toEqual([4, 8])
    })
})

describe("musicSections", () => {
    const kinds = (playing: number, rest: ScreenKind = "ending") =>
        Array.from({ length: 200 }, (_, k) => ({
            kind: k < playing ? ("playing" as const) : rest,
        }))

    it("plays the title tune, then the stage's, then the title's", () => {
        const sections = musicSections({
            fps: 30,
            clip: realTime(30, 60),
            level: 1,
            ticks: kinds(200),
            duration: 120,
        })
        expect(sections).toEqual([
            { track: "title", from: 0, to: 1 },
            { track: "stage2", from: 1, to: 3 },
            { track: "title", from: 3, to: 4 },
        ])
    })

    it("stops the stage tune where the run leaves play", () => {
        // Tick 40 (the outro) shows on clip frame 20.
        const sections = musicSections({
            fps: 30,
            clip: realTime(30, 60),
            level: 0,
            ticks: kinds(40),
            duration: 90,
        })
        expect(sections).toEqual([
            { track: "title", from: 0, to: 1 },
            { track: "stage1", from: 1, to: 50 / 30 },
        ])
    })
})

describe("musicVolume", () => {
    const clip: ClipTiming = {
        time: {
            fps: 30,
            segments: [
                { fromFrame: 10, speed: 0 },
                { fromFrame: 20, speed: 1 },
            ],
        },
        from: 100,
        duration: 50,
    }

    it("is full in real time, outside the clip and before the fade", () => {
        expect(musicVolume(0, clip, 1000)).toBe(1)
        expect(musicVolume(105, clip, 1000)).toBe(1)
        expect(musicVolume(200, clip, 1000)).toBe(1)
    })

    it("dips in slow motion", () => {
        expect(musicVolume(112, clip, 1000)).toBeCloseTo(1 - DIP)
    })

    it("fades out at the end", () => {
        expect(musicVolume(1000 - FADE_OUT, clip, 1000)).toBe(1)
        expect(musicVolume(1000 - FADE_OUT / 2, clip, 1000)).toBeCloseTo(0.5)
        expect(musicVolume(1000, clip, 1000)).toBe(0)
    })
})
