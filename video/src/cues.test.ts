import { describe, expect, it } from "vite-plus/test"
import { CUES, cueFrame, framesBetween, type Cue } from "./cues"

describe("cues", () => {
    it("puts a cue on the nearest frame", () => {
        expect(cueFrame("drop", 30)).toBe(Math.round(CUES.drop * 30))
        expect(cueFrame("intro", 30)).toBe(12)
    })

    it("counts frames between cues", () => {
        expect(framesBetween("drop", "outro", 30)).toBe(
            cueFrame("outro", 30) - cueFrame("drop", 30)
        )
    })

    it("lists cues in time order", () => {
        const times = (Object.keys(CUES) as Cue[]).map((cue) => CUES[cue])
        expect(times).toEqual([...times].sort((a, b) => a - b))
    })
})
