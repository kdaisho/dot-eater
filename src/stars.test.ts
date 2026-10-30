import { describe, expect, it } from "vite-plus/test"
import { MAX_HEALTH, TICK_RATE } from "./constants"
import {
    formatSeconds,
    formatTicks,
    rateClear,
    starList,
    starText,
} from "./stars"

const PAR = 60
const parTicks = PAR * TICK_RATE

// A finished solo game of `ticks` with `health` left (just a sliver by
// default).
const game = (ticks: number, health = 1) => ({ ticks, players: [{ health }] })

describe("rateClear", () => {
    it("gives 3 stars for at least half health and under par", () => {
        expect(rateClear(game(100, MAX_HEALTH), PAR)).toEqual({
            ticks: 100,
            parTime: PAR,
            healthy: true,
            underPar: true,
            stars: 3,
        })
    })

    it("gives 1 star just for clearing", () => {
        const rating = rateClear(game(parTicks + 1), PAR)
        expect(rating).toMatchObject({
            healthy: false,
            underPar: false,
            stars: 1,
        })
    })

    it("gives the health star for clearing with at least half health", () => {
        const at = (health: number) =>
            rateClear(game(parTicks + 1, health), PAR)
        expect(at(MAX_HEALTH)).toMatchObject({ healthy: true, stars: 2 })
        expect(at(MAX_HEALTH / 2)).toMatchObject({ healthy: true, stars: 2 })
        expect(at(MAX_HEALTH / 2 - 1)).toMatchObject({
            healthy: false,
            stars: 1,
        })
    })

    it("counts a time exactly at par as under par, one tick more as not", () => {
        const at = (ticks: number) => rateClear(game(ticks), PAR)
        expect(at(parTicks)).toMatchObject({ underPar: true, stars: 2 })
        expect(at(parTicks + 1)).toMatchObject({ underPar: false, stars: 1 })
        expect(at(1)).toMatchObject({ underPar: true, stars: 2 })
    })

    // Regression: 16.4 * 60 is 983.9999999999999, so a clear exactly at par
    // (984 ticks, shown as 0:16.4) missed the star.
    it("counts a clear exactly at a tenths par as under par", () => {
        expect(rateClear(game(984), 16.4).underPar).toBe(true)
        expect(rateClear(game(985), 16.4).underPar).toBe(false)
        expect(rateClear(game(246), 4.1).underPar).toBe(true)
    })

    it("works with a par time that isn't whole seconds", () => {
        // 0.5 s is 30 ticks.
        expect(rateClear(game(30), 0.5).underPar).toBe(true)
        expect(rateClear(game(31), 0.5).underPar).toBe(false)
    })
})

describe("starList", () => {
    it("lists the three stars in order, with the par time in the label", () => {
        const rating = rateClear(game(parTicks + 1, MAX_HEALTH), PAR)
        expect(starList(rating)).toEqual([
            { label: "Cleared", earned: true },
            { label: "At least half health", earned: true },
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
