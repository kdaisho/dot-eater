import { describe, expect, it } from "vite-plus/test"
import { STAGE_TRACKS } from "./music"
import { loopOffset, RECORDED_TRACKS } from "./recorded"

describe("loopOffset", () => {
    const track = { url: "x.mp3", loopStart: 4, loopEnd: 20 }

    it("plays straight through up to the loop end", () => {
        expect(loopOffset(track, 0)).toBe(0)
        expect(loopOffset(track, 19.5)).toBe(19.5)
    })

    it("goes round the loop after the loop end", () => {
        expect(loopOffset(track, 20)).toBe(4)
        expect(loopOffset(track, 30)).toBe(14)
        expect(loopOffset(track, 20 + 16 * 3 + 1)).toBeCloseTo(5, 9)
    })
})

describe("RECORDED_TRACKS", () => {
    it("gives every stage a file, and the title none", () => {
        for (const id of STAGE_TRACKS) expect(RECORDED_TRACKS[id]).toBeDefined()
        expect(RECORDED_TRACKS.title).toBeUndefined()
    })

    it("loops at least ten seconds, after the start", () => {
        for (const track of Object.values(RECORDED_TRACKS)) {
            expect(track.loopStart).toBeGreaterThanOrEqual(0)
            expect(track.loopEnd - track.loopStart).toBeGreaterThan(10)
        }
    })
})
