import { describe, expect, it } from "vite-plus/test"
import { makeState, textMap } from "./test/helpers"
import { vec2 } from "./vec2"
import {
    CATCH_DOTS,
    loseDots,
    matchWinner,
    roundResult,
    roundWinner,
    roundWins,
    STUN_SECONDS,
    stun,
    stunned,
    tallyText,
    tickStuns,
    type RoundResult,
} from "./versus"

const hall = textMap(["#####", "#   #", "#####"]).map

function game() {
    return makeState(hall, [vec2(1, 1), vec2(3, 1)], [], { mode: "versus" })
}

const won = (winner: number | null): RoundResult => ({
    winner,
    dots: [0, 0],
    scores: [0, 0],
})

describe("stun", () => {
    it("lasts STUN_SECONDS and counts down", () => {
        const [p1] = game().players
        stun(p1)
        expect(p1.stunnedFor).toBe(STUN_SECONDS)
        tickStuns([p1], 0.5)
        expect(p1.stunnedFor).toBe(STUN_SECONDS - 0.5)
        tickStuns([p1], STUN_SECONDS)
        expect(p1.stunnedFor).toBe(0)
        expect(stunned(p1)).toBe(false)
    })

    it("doesn't reset a stun in progress", () => {
        const [p1] = game().players
        stun(p1)
        tickStuns([p1], 1)
        stun(p1)
        expect(p1.stunnedFor).toBe(STUN_SECONDS - 1)
    })

    it("leaves a player out of play alone and drops a buffered tap", () => {
        const [p1, p2] = game().players
        p1.out = true
        stun(p1)
        expect(stunned(p1)).toBe(false)
        p2.bufferedStep = vec2(1, 0)
        stun(p2)
        expect(p2.bufferedStep).toEqual(vec2(0, 0))
    })
})

describe("loseDots", () => {
    it(`takes ${CATCH_DOTS} dots, down to 0`, () => {
        const [p1] = game().players
        p1.dots = 7
        loseDots(p1)
        expect(p1.dots).toBe(7 - CATCH_DOTS)
        loseDots(p1)
        expect(p1.dots).toBe(0)
    })
})

describe("the round winner", () => {
    it("has the most dots", () => {
        expect(roundWinner([10, 12], [500, 120])).toBe(1)
        expect(roundWinner([12, 10], [0, 900])).toBe(0)
    })

    it("on a dot tie, has the higher score", () => {
        expect(roundWinner([10, 10], [100, 150])).toBe(1)
        expect(roundWinner([10, 10], [600, 150])).toBe(0)
    })

    it("is nobody on an exact tie", () => {
        expect(roundWinner([10, 10], [100, 100])).toBeNull()
    })

    it("comes from the game's players", () => {
        const state = game()
        state.players[0].dots = 4
        state.players[0].score = 40
        state.players[1].dots = 6
        state.players[1].score = 560
        expect(roundResult(state)).toEqual({
            winner: 1,
            dots: [4, 6],
            scores: [40, 560],
        })
    })
})

describe("the match", () => {
    it("tallies round wins, leaving out replayed rounds", () => {
        expect(roundWins([])).toEqual([0, 0])
        expect(roundWins([won(0), won(null), won(1), won(0)])).toEqual([2, 1])
    })

    it("is won by the first to two round wins (best of 3)", () => {
        expect(matchWinner([won(0)])).toBeNull()
        expect(matchWinner([won(0), won(1)])).toBeNull()
        expect(matchWinner([won(0), won(null), won(1)])).toBeNull()
        expect(matchWinner([won(1), won(1)])).toBe(1)
        expect(matchWinner([won(0), won(1), won(null), won(0)])).toBe(0)
    })

    it("shows the round number and tally", () => {
        expect(tallyText([])).toBe("Round 1 · 0–0")
        expect(tallyText([won(0)])).toBe("Round 2 · 1–0")
        expect(tallyText([won(0), won(null)])).toBe("Round 3 · 1–0")
    })
})
