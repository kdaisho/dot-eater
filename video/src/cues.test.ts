import { describe, expect, it } from "vite-plus/test"
import {
    BAR,
    BEAT_SECONDS,
    BPM,
    beatFrames,
    CUES,
    cueFrame,
    framesBetween,
    type Cue,
} from "./cues"

describe("cues", () => {
    it("puts a cue on the nearest frame", () => {
        expect(cueFrame("drop", 30)).toBe(Math.round(CUES.drop * 30))
        expect(cueFrame("intro", 30)).toBe(0)
    })

    it("counts frames between cues", () => {
        expect(framesBetween("play", "outro", 30)).toBe(
            cueFrame("outro", 30) - cueFrame("play", 30)
        )
    })

    it("lists cues in time order", () => {
        const times = (Object.keys(CUES) as Cue[]).map((cue) => CUES[cue])
        expect(times).toEqual([...times].sort((a, b) => a - b))
    })

    it("puts every cue on a downbeat", () => {
        for (const time of Object.values(CUES)) {
            const bars = time / BAR
            expect(bars).toBeCloseTo(Math.round(bars), 9)
        }
    })

    it("keeps the bar, the beat and the tempo in step", () => {
        expect(240 / BPM).toBeCloseTo(BAR, 4)
        expect(BEAT_SECONDS * 4).toBe(BAR)
        expect(beatFrames(30)).toBeCloseTo(18.47, 2)
    })
})
