import { describe, expect, it } from "vite-plus/test"
import type { Recording } from "../../src/replay"
import { beatsOf, fallbackBeats } from "./beats"
import {
    compileCuts,
    cutLength,
    CutListError,
    type CutList,
    type GameShot,
} from "./cutList"
import { gameTimeFor } from "./time"

// A recording `ticks` long; compileCuts only reads its length.
function fakeRecording(ticks: number): Recording {
    return {
        version: 1,
        level: 0,
        mode: "solo",
        animals: ["dragon"],
        seed: 1,
        ticks: [{ t: [], n: ticks }],
        final: {},
    } as unknown as Recording
}

// 120 bpm from 0 s: a beat is 15 frames at 30 fps.
const beats = beatsOf(fallbackBeats({ bpm: 120, bars: 32 }), { fps: 30 })
const run = fakeRecording(5000)

const shot = (over: Partial<GameShot> = {}): GameShot => ({
    name: "Shot",
    recording: run,
    heroTick: 2000,
    at: { x: 5, y: 5 },
    durationBeats: 4,
    ...over,
})

describe("compileCuts", () => {
    it("lays shots end to end on the beat grid", () => {
        const list: CutList = {
            startBeat: 2,
            shots: [
                { kind: "card", name: "Card", animal: "owl", durationBeats: 4 },
                shot({ durationBeats: 2 }),
                shot({ durationBeats: 0.5, transition: "flash" }),
            ],
        }
        const shots = compileCuts(list, beats)
        expect(shots.map((s) => [s.from, s.duration])).toEqual([
            [30, 60],
            [90, 30],
            [120, 8],
        ])
        expect(cutLength(shots)).toBe(128)
        expect(shots[0].beats).toEqual([0, 15, 30, 45])
        expect(shots[0].game).toBeUndefined()
    })

    it("lands each hero tick exactly on its hero beat", () => {
        const shots = compileCuts(
            {
                shots: [
                    shot({ heroTick: 1500, heroBeat: 3 }),
                    shot({ heroTick: 3000 }),
                    shot({ heroTick: 800, speed: false, heroBeat: 0 }),
                ],
            },
            beats
        )
        const [a, b, c] = shots.map((s) => s.game)
        expect(a?.hero).toBe(45)
        expect(gameTimeFor(45, a!.time)).toEqual({ tick: 1500, alpha: 0 })
        // The middle beat by default.
        expect(b?.hero).toBe(30)
        expect(gameTimeFor(30, b!.time)).toEqual({ tick: 3000, alpha: 0 })
        expect(gameTimeFor(0, c!.time)).toEqual({ tick: 800, alpha: 0 })
        expect(c?.ticks.last).toBe(800 + 59 * 2)
    })

    it("takes each shot's way in, and the next shot's way out", () => {
        const shots = compileCuts(
            {
                shots: [
                    shot({ transition: "wipe" }),
                    shot({ transition: "whip" }),
                    shot({ transition: "flash" }),
                ],
            },
            beats
        )
        expect(shots.map((s) => [s.enter, s.exit])).toEqual([
            ["cut", "whip"],
            ["whip", "flash"],
            ["flash", "cut"],
        ])
    })

    it("reports every shot that runs off its recording, by name", () => {
        const short = fakeRecording(300)
        const list: CutList = {
            shots: [
                shot({ name: "Too late", recording: short, heroTick: 290 }),
                shot({ name: "Fine" }),
                shot({ name: "Too early", heroTick: 10 }),
                shot({ name: "Past the end", heroTick: 9000 }),
                shot({ name: "Bad beat", heroBeat: 4 }),
            ],
        }
        let error: unknown
        try {
            compileCuts(list, beats)
        } catch (e) {
            error = e
        }
        expect(error).toBeInstanceOf(CutListError)
        const problems = (error as CutListError).problems
        expect(problems).toHaveLength(4)
        expect(problems[0]).toMatch(
            /^Shot 1 "Too late": runs to tick \d+ but the recording ends at tick 300/
        )
        expect(problems[1]).toMatch(
            /^Shot 3 "Too early": needs \d+ ticks of play before heroTick 10/
        )
        expect(problems[2]).toMatch(/^Shot 4 "Past the end": heroTick 9000/)
        expect(problems[3]).toMatch(/^Shot 5 "Bad beat": heroBeat 4 is outside/)
        expect((error as Error).message).toContain("- Shot 1")
    })
})
