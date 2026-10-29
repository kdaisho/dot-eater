import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import { addStatus } from "../../src/breath"
import { FROZEN } from "../../src/breaths/penguin"
import { Cell } from "../../src/constants"
import { gameOf, type Screen } from "../../src/flow"
import type { GameState } from "../../src/game"
import { levels } from "../../src/levels"
import { verify, type Recording } from "../../src/replay"
import { makeBoss, makeEnemy, makeState, OLD_MAP } from "../../src/test/helpers"
import { playDemo } from "../scripts/bot"
import {
    boardOf,
    closeCalls,
    nearMisses,
    replayerFor,
    runOf,
    threatDistance,
    trackOf,
} from "./replayers"

// The committed demo run (read from disk: recordings/index.ts needs the
// bundler).
const demo = JSON.parse(
    readFileSync(new URL("recordings/demo.json", import.meta.url), "utf8")
) as Recording

describe("the demo recording", () => {
    it("replays to where it was recorded", () => {
        expect(verify(demo, levels)).toBe(true)
    })

    it("clears stage 1", () => {
        expect(demo.final.kind).toBe("stageClear")
        expect(demo.level).toBe(0)
    })

    it("is what the bot records now (re-run record-demo if not)", () => {
        expect(JSON.parse(JSON.stringify(playDemo()))).toEqual(demo)
    })
})

describe("replayerFor", () => {
    it("keeps one replayer per recording", () => {
        expect(replayerFor(demo)).toBe(replayerFor(demo))
    })
})

describe("trackOf", () => {
    it("has player 1's character on every tick", () => {
        const track = trackOf(demo)
        const replayer = replayerFor(demo)
        expect(track.ticks).toHaveLength(replayer.length + 1)
        expect(track.board).toEqual(boardOf(demo))
        for (const k of [0, 437, replayer.length]) {
            const player = gameOf(replayer.at(k))!.players[0]
            expect(track.ticks[k][0].pos).toEqual(player.character.pos)
            expect(track.ticks[k][0].moveProgress).toBe(
                player.character.moveProgress
            )
        }
    })

    it("is built once per recording", () => {
        expect(trackOf(demo)).toBe(trackOf(demo))
    })
})

describe("runOf", () => {
    it("logs each tick's own events, once", () => {
        const run = runOf(demo)
        expect(run.ticks).toHaveLength(replayerFor(demo).length + 1)
        expect(run.ticks[0].events).toEqual([])
        const eaten = run.ticks.flatMap((t) =>
            t.events.filter((e) => e.type === "dotEaten")
        )
        // Every dot eaten once: the outro repeats none.
        const start = gameOf(replayerFor(demo).at(0))!
        const dots = start.cells.flat().filter((c) => c === Cell.dot).length
        expect(eaten).toHaveLength(dots)
    })

    it("marks the ticks that move the effects on", () => {
        const run = runOf(demo)
        expect(run.ticks[0].moved).toBe(false)
        expect(run.ticks[1].moved).toBe(true)
        expect(run.ticks.at(-1)!.kind).toBe("stageClear")
    })
})

describe("threatDistance", () => {
    // Player 1 at (1, 1) on the old map; something two cells to its right.
    const playing = (game: GameState): Screen => ({
        kind: "playing",
        mode: "solo",
        level: 0,
        animals: ["dragon"],
        game,
    })

    it("measures to the nearest enemy that can catch", () => {
        const far = makeEnemy(7, 7)
        const near = makeEnemy(3, 1)
        const game = makeState(OLD_MAP, { x: 1, y: 1 }, [far, near])
        expect(threatDistance(playing(game))).toBeCloseTo(2)
    })

    it("ignores enemies out of play or made harmless (frozen)", () => {
        const frozen = makeEnemy(2, 1)
        const out = makeEnemy(1, 2)
        const game = makeState(OLD_MAP, { x: 1, y: 1 }, [frozen, out])
        addStatus(frozen, FROZEN, 3)
        out.respawnIn = 2
        expect(threatDistance(playing(game))).toBe(Infinity)
    })

    it("counts the boss, by its footprint", () => {
        // The boss's top-left at (3, 1): its nearest cell centre is 2 away.
        const game = makeState(OLD_MAP, { x: 1, y: 1 }, [], {
            boss: makeBoss(3, 1),
        })
        expect(threatDistance(playing(game))).toBeCloseTo(2)
        game.boss!.defeated = true
        expect(threatDistance(playing(game))).toBe(Infinity)
    })

    it("is Infinity outside play", () => {
        const game = makeState(OLD_MAP, { x: 1, y: 1 }, [makeEnemy(2, 1)])
        expect(threatDistance(playing(game))).toBeCloseTo(1)
        const ending = { ...playing(game), kind: "ending" } as Screen
        expect(threatDistance(ending)).toBe(Infinity)
    })
})

describe("closeCalls", () => {
    it("picks the closest tick of each pass with no life lost", () => {
        const threat = [9, 3, 1.2, 0.8, 1.1, 4, 9, 9]
        const ticks = threat.map((t) => ({ threat: t, lives: 3 }))
        expect(closeCalls(ticks, { grace: 2 })).toEqual([
            { tick: 3, distance: 0.8 },
        ])
        const lost = ticks.map((t, k) => ({ ...t, lives: k > 4 ? 2 : 3 }))
        expect(closeCalls(lost, { grace: 2 })).toEqual([])
    })
})

describe("nearMisses", () => {
    it("finds close calls, closest first, with no life lost", () => {
        const misses = nearMisses(demo)
        expect(misses.length).toBeGreaterThan(0)
        const distances = misses.map((m) => m.distance)
        expect(distances).toEqual([...distances].sort((a, b) => a - b))
        const replayer = replayerFor(demo)
        for (const { tick, distance } of misses) {
            expect(distance).toBeLessThanOrEqual(1.5)
            const lives = gameOf(replayer.at(tick))!.lives
            expect(gameOf(replayer.at(tick + 30))!.lives).toBe(lives)
        }
    })
})
