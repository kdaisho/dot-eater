import { describe, expect, it } from "vite-plus/test"
import { START_LIVES, TICK_RATE } from "./constants"
import {
    formatSeconds,
    formatTicks,
    rateClear,
    starList,
    starText,
} from "./stars"

const PAR = 60
const parTicks = PAR * TICK_RATE

describe("rateClear", () => {
    it("gives 3 stars for no lives lost and under par", () => {
        expect(rateClear({ ticks: 100, lives: START_LIVES }, PAR)).toEqual({
            ticks: 100,
            parTime: PAR,
            noLivesLost: true,
            underPar: true,
            stars: 3,
        })
    })

    it("gives 1 star just for clearing", () => {
        const rating = rateClear({ ticks: parTicks + 1, lives: 1 }, PAR)
        expect(rating).toMatchObject({
            noLivesLost: false,
            underPar: false,
            stars: 1,
        })
    })

    it("gives the no-lives-lost star only with every life left", () => {
        const at = (lives: number) =>
            rateClear({ ticks: parTicks + 1, lives }, PAR)
        expect(at(START_LIVES)).toMatchObject({ noLivesLost: true, stars: 2 })
        expect(at(START_LIVES - 1)).toMatchObject({
            noLivesLost: false,
            stars: 1,
        })
    })

    it("counts a time exactly at par as under par, one tick more as not", () => {
        const at = (ticks: number) => rateClear({ ticks, lives: 1 }, PAR)
        expect(at(parTicks)).toMatchObject({ underPar: true, stars: 2 })
        expect(at(parTicks + 1)).toMatchObject({ underPar: false, stars: 1 })
        expect(at(1)).toMatchObject({ underPar: true, stars: 2 })
    })

    it("works with a par time that isn't whole seconds", () => {
        // 0.5 s is 30 ticks.
        expect(rateClear({ ticks: 30, lives: 1 }, 0.5).underPar).toBe(true)
        expect(rateClear({ ticks: 31, lives: 1 }, 0.5).underPar).toBe(false)
    })
})

describe("starList", () => {
    it("lists the three stars in order, with the par time in the label", () => {
        const rating = rateClear(
            { ticks: parTicks + 1, lives: START_LIVES },
            PAR
        )
        expect(starList(rating)).toEqual([
            { label: "Cleared", earned: true },
            { label: "No lives lost", earned: true },
            { label: "Under par (1:00)", earned: false },
        ])
    })
})

describe("starText", () => {
    it("fills earned stars and leaves the rest hollow", () => {
        expect(starText(1)).toBe("★☆☆")
        expect(starText(2)).toBe("★★☆")
        expect(starText(3)).toBe("★★★")
    })

    it("stays three stars long for out-of-range counts", () => {
        expect(starText(0)).toBe("☆☆☆")
        expect(starText(5)).toBe("★★★")
    })
})

describe("formatTicks", () => {
    it("shows m:ss.s", () => {
        expect(formatTicks(0)).toBe("0:00.0")
        expect(formatTicks(6)).toBe("0:00.1")
        expect(formatTicks(42 * TICK_RATE + 18)).toBe("0:42.3")
        expect(formatTicks(parTicks)).toBe("1:00.0")
        expect(formatTicks(10 * parTicks + 5 * TICK_RATE)).toBe("10:05.0")
    })

    it("rounds up to the tenth, so a time over par never reads as par", () => {
        expect(formatTicks(1)).toBe("0:00.1")
        expect(formatTicks(parTicks + 1)).toBe("1:00.1")
        expect(formatTicks(parTicks - 1)).toBe("1:00.0")
    })
})

describe("formatSeconds", () => {
    it("shows m:ss, with tenths only when there are any", () => {
        expect(formatSeconds(60)).toBe("1:00")
        expect(formatSeconds(45)).toBe("0:45")
        expect(formatSeconds(45.5)).toBe("0:45.5")
        expect(formatSeconds(125)).toBe("2:05")
    })
})
