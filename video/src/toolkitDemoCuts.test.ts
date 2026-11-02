import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import type { Recording } from "../../src/replay"
import { compileCuts, cutLength } from "./cutList"
import { excerptFrames, fallbackFor, PROMO2_EXCERPT } from "./excerpts"
import { runOf } from "./replayers"
import { SONGS } from "./songs"
import { closeCallMoment, demoCutList, eventMoment } from "./toolkitDemoCuts"

const demo = JSON.parse(
    readFileSync(new URL("recordings/demo.json", import.meta.url), "utf8")
) as Recording

describe("demoCutList", () => {
    it("fits the demo run on the song's grid, without the song", () => {
        const lift = PROMO2_EXCERPT.cues.lift
        const frames = excerptFrames(
            fallbackFor(SONGS.toolkit),
            { ...PROMO2_EXCERPT, fromBar: lift, toBar: lift + 4 },
            30
        )
        const shots = compileCuts(demoCutList(demo), frames.beats)
        expect(shots).toHaveLength(4)
        expect(cutLength(shots)).toBe(frames.duration)
        // About 10 s.
        expect(frames.duration / 30).toBeCloseTo(9.9, 1)
    })
})

describe("moments", () => {
    it("finds a kill's tick and the player's place on it", () => {
        const kill = eventMoment(demo, "enemyDefeated")
        const events = runOf(demo).ticks[kill.heroTick].events
        expect(events.some((e) => e.type === "enemyDefeated")).toBe(true)
        expect(kill.at.x).toBeGreaterThan(0)
    })

    it("picks a close call away from the kills and the run's ends", () => {
        const kills = runOf(demo).ticks.flatMap((t, k) =>
            t.events.some((e) => e.type === "enemyDefeated") ? [k] : []
        )
        const call = closeCallMoment(demo)
        expect(kills.every((k) => Math.abs(k - call.heroTick) >= 200)).toBe(
            true
        )
    })
})
