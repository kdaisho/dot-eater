import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"
import { gameOf } from "../../src/flow"
import { levels } from "../../src/levels"
import { verify, type Recording } from "../../src/replay"
import { boardOf, nearMisses, replayerFor, trackOf } from "./replayers"

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
