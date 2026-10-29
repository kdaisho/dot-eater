import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import { gameOf } from "../../src/flow"
import type { Recording } from "../../src/replay"
import { SfxId } from "../../src/sfx"
import { drawTime } from "./camera"
import { cueFrame } from "./cues"
import {
    CLOSE_CALL,
    DURATION,
    END_CARD,
    FPS,
    GAMEPLAY,
    pickCloseCall,
    promoClip,
    RUN,
    TITLE,
} from "./plan"
import { nearMisses, replayerFor, runOf } from "./replayers"
import { sfxTimeline } from "./soundtrack"
import { gameTimeFor } from "./time"

// The run, read from disk (recordings/index.ts needs the bundler).
const recording = (name: string) =>
    JSON.parse(
        readFileSync(
            new URL(`recordings/${name}.json`, import.meta.url),
            "utf8"
        )
    ) as Recording

describe("plan", () => {
    it("lays the scenes end to end over the whole video", () => {
        expect(TITLE.from).toBe(0)
        expect(GAMEPLAY.from).toBe(TITLE.from + TITLE.duration)
        expect(END_CARD.from).toBe(GAMEPLAY.from + GAMEPLAY.duration)
        expect(END_CARD.from + END_CARD.duration).toBe(DURATION)
    })

    it("lands the close call on the drop", () => {
        const run = recording(RUN)
        const clip = promoClip(run)
        const ticks = nearMisses(run).map((m) => m.tick)
        expect(GAMEPLAY.from + CLOSE_CALL).toBe(cueFrame("drop", FPS))
        expect(ticks).toContain(gameTimeFor(CLOSE_CALL, clip.time).tick)
        // Not clamped to the recording's start.
        expect(clip.time.startTick).toBeGreaterThan(0)
    })
})

describe("pickCloseCall", () => {
    const miss = (tick: number, distance: number) => ({ tick, distance })

    it("picks the closest call late enough to land where asked", () => {
        const misses = [miss(100, 0.5), miss(900, 1), miss(700, 1.2)]
        expect(pickCloseCall(misses, 600)).toEqual(miss(900, 1))
        expect(pickCloseCall(misses, 50)).toEqual(miss(100, 0.5))
    })

    it("falls back to the closest, or none", () => {
        expect(pickCloseCall([miss(100, 0.5)], 600)).toEqual(miss(100, 0.5))
        expect(pickCloseCall([], 600)).toBeUndefined()
    })
})

describe("the promo's sound effects", () => {
    it("play each dot's blip on the frame the dot vanishes", () => {
        const run = recording(RUN)
        const clip = promoClip(run)
        const replayer = replayerFor(run)
        const { track, ticks } = runOf(run)
        // Frames (of the composition) on which a dot is drawn eaten.
        const eaten: number[] = []
        let before = -1
        for (let frame = 0; frame < clip.duration; frame++) {
            const { tick } = drawTime(frame, clip.time, track)
            const dots = gameOf(replayer.at(tick))?.players[0]?.dots ?? 0
            if (before >= 0 && dots > before) eaten.push(clip.from + frame)
            before = dots
        }
        const blips = sfxTimeline(clip, ticks)
            .filter((cue) => cue.id === SfxId.dot)
            .map((cue) => Math.round(cue.at * FPS))
        expect(eaten.length).toBeGreaterThan(10)
        expect(blips).toEqual(eaten)
    })
})
