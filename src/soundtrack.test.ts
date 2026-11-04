import { describe, expect, it } from "vite-plus/test"
import { DEFAULT_DIFFICULTY } from "./difficulty"
import { stages } from "./levels"
import { MusicTrackId, STAGE_TRACKS } from "./music"
import { RECORDED_TRACKS } from "./recorded"
import { formatClock, SOUNDTRACK } from "./soundtrack"

describe("SOUNDTRACK", () => {
    it("lists the opening, the stages in order, then the end roll", () => {
        expect(SOUNDTRACK.map((entry) => entry.track)).toEqual([
            MusicTrackId.opening,
            ...STAGE_TRACKS,
            MusicTrackId.endRoll,
        ])
        expect(SOUNDTRACK.map((entry) => entry.name)).toEqual([
            "Opening",
            "Classic",
            "Wrap Maze",
            "Ice Rink",
            "Fog",
            "Boss Lair",
            "Haunted Halls",
            "Patrol Base",
            "Frozen Fog",
            "Gauntlet",
            "Final Boss",
            "End Roll",
        ])
    })

    it("names each stage track after its stage, and says which", () => {
        stages.forEach((stage, i) => {
            const entry = SOUNDTRACK[i + 1]!
            expect(entry.name.toLowerCase()).toBe(
                stage[DEFAULT_DIFFICULTY].name.toLowerCase()
            )
            expect(entry.plays).toBe(`Stage ${i + 1}`)
        })
        expect(SOUNDTRACK[0]!.plays).toBe("The opening")
        expect(SOUNDTRACK.at(-1)!.plays).toBe("The end roll")
    })

    it("has a recorded file for every track", () => {
        for (const { track } of SOUNDTRACK) {
            expect(RECORDED_TRACKS[track]).toBeDefined()
        }
    })
})

describe("formatClock", () => {
    it("shows m:ss, rounded down", () => {
        expect(formatClock(0)).toBe("0:00")
        expect(formatClock(9.99)).toBe("0:09")
        expect(formatClock(57.7)).toBe("0:57")
        expect(formatClock(169.4)).toBe("2:49")
        expect(formatClock(-1)).toBe("0:00")
    })
})
