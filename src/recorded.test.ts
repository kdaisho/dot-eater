import { describe, expect, it } from "vite-plus/test"
import { STAGE_TRACKS } from "./music"
import { loopOffset, RECORDED_TRACKS, trackProgress } from "./recorded"

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

describe("trackProgress", () => {
    const track = { url: "x.mp3", loopStart: 4, loopEnd: 20 }

    it("is the place in the file, out of the loop end", () => {
        expect(trackProgress(track, 0)).toEqual({ elapsed: 0, length: 20 })
        expect(trackProgress(track, 12.5)).toEqual({
            elapsed: 12.5,
            length: 20,
        })
    })

    it("goes back to the loop start as the music loops", () => {
        expect(trackProgress(track, 20).elapsed).toBe(4)
        expect(trackProgress(track, 30).elapsed).toBe(14)
        expect(trackProgress(track, 36 + 16 * 5).elapsed).toBeCloseTo(4, 9)
    })

    it("is the start without a position", () => {
        expect(trackProgress(track, undefined)).toEqual({
            elapsed: 0,
            length: 20,
        })
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
