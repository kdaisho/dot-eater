import { describe, expect, it } from "vite-plus/test"
import {
    END_CONFIRM_DELAY,
    MODE_CHOICES,
    startLevel,
    update,
    type FlowDeps,
    type Match,
    type Screen,
    type TickInput,
} from "./flow"
import type { Outcome } from "./game"
import type { Action } from "./input"
import { parseLevel } from "./level"
import { emptyProgress } from "./progress"
import { AnimalId } from "./roster"
import { fixedRandom } from "./test/helpers"
import { vec2 } from "./vec2"
import type { RoundResult } from "./versus"

// The screen machine through a versus match (KDA-222): rounds on the same
// stage, a round result between them, and the match result at the end.

const levels = [
    parseLevel({
        name: "corridor",
        parTime: 60,
        map: ["######", "#PQ..#", "######"],
        enemies: [],
    }),
]

const DT = 1 / 60

function input(pressed: readonly (readonly Action[])[] = []): TickInput {
    return {
        wasPressed: (action, player = 0) =>
            pressed[player]?.includes(action) ?? false,
        move: () => ({ held: [], pressed: vec2(0, 0) }),
    }
}
const confirm = input([["confirm"]])

// Every game step ends the round at once.
function deps(outcome: Outcome | null = "won"): FlowDeps {
    return {
        levels,
        progress: emptyProgress(),
        dt: DT,
        random: fixedRandom(0),
        step: () => outcome,
    }
}

const picks = [AnimalId.owl, AnimalId.skunk] as const

function playing(match?: Match) {
    const screen = startLevel(levels, 0, [...picks], "versus", match)
    if (screen.kind !== "playing") throw new Error(screen.kind)
    return screen
}

// Play `screen` with player `winner` (0 or 1, or null for an exact tie)
// ahead on dots, through the outro, to the screen after the round.
function finishRound(
    screen: Extract<Screen, { kind: "playing" }>,
    winner: number | null
): Screen {
    screen.game.players.forEach((p, i) => {
        p.dots = winner === null ? 1 : i === winner ? 2 : 1
        p.score = p.dots * 10
    })
    let next: Screen = update(screen, input(), deps())
    expect(next.kind).toBe("ending")
    for (let i = 0; i < 60 && next.kind === "ending"; i++) {
        next = update(next, input(), deps())
    }
    return next
}

// Tick `screen` until its confirm lock is over.
function waitOut(screen: Screen): Screen {
    let s = screen
    for (let i = 0; i < Math.ceil(END_CONFIRM_DELAY / DT); i++) {
        s = update(s, input(), deps())
    }
    return s
}

const round = (winner: number | null, dots: number[]): RoundResult => ({
    winner,
    dots,
    scores: dots.map((d) => d * 10),
})

describe("versus on the title", () => {
    it("is the last mode", () => {
        expect(MODE_CHOICES.at(-1)).toBe("versus")
    })

    it("starts a new match", () => {
        const screen = playing()
        expect(screen.match).toEqual([])
        expect(screen.game.mode).toBe("versus")
    })

    it("carries the match through pause and the outro", () => {
        const match = [round(0, [2, 1])]
        const paused = update(playing(match), input([["pause"]]), deps())
        expect(paused).toMatchObject({ kind: "paused", match })
        const resumed = update(paused, input([["pause"]]), deps())
        expect(resumed).toMatchObject({ kind: "playing", match })
        const ending = update(resumed, input(), deps())
        expect(ending).toMatchObject({ kind: "ending", match })
    })

    it("doesn't give other modes a match", () => {
        expect(startLevel(levels, 0, [...picks], "coop")).not.toHaveProperty(
            "match"
        )
    })
})

describe("a versus round's end", () => {
    it("shows the round result, with the round added to the match", () => {
        const next = finishRound(playing(), 1)
        expect(next).toMatchObject({
            kind: "roundResult",
            level: 0,
            animals: picks,
            match: [round(1, [1, 2])],
        })
    })

    it("plays the next round on a fresh copy of the stage on confirm", () => {
        const first = playing()
        const result = waitOut(finishRound(first, 0))
        const next = update(result, confirm, deps())
        if (next.kind !== "playing") throw new Error(next.kind)
        expect(next.game).not.toBe(first.game)
        expect(next.game.players.map((p) => p.dots)).toEqual([0, 0])
        expect(next.animals).toEqual(picks)
        expect(next.match).toEqual([round(0, [2, 1])])
        expect(next.game.mode).toBe("versus")
    })

    it("ignores confirm until END_CONFIRM_DELAY has passed", () => {
        const result = finishRound(playing(), 0)
        let s = result
        for (let i = 0; i < Math.ceil(END_CONFIRM_DELAY / DT) - 1; i++) {
            s = update(s, confirm, deps())
            expect(s.kind).toBe("roundResult")
        }
        expect(update(s, confirm, deps()).kind).toBe("playing")
    })

    it("follows player 1 only", () => {
        const result = waitOut(finishRound(playing(), 0))
        expect(update(result, input([[], ["confirm"]]), deps())).toBe(result)
    })

    it("replays an exact tie, which doesn't count", () => {
        const match = [round(0, [2, 1])]
        const next = finishRound(playing(match), null)
        expect(next).toMatchObject({
            kind: "roundResult",
            match: [...match, round(null, [1, 1])],
        })
    })

    it("never goes to the 1-player end screens", () => {
        // Even a (never expected) lost game ends the round.
        const screen = playing()
        let next: Screen = update(screen, input(), deps("dead"))
        for (let i = 0; i < 60 && next.kind === "ending"; i++) {
            next = update(next, input(), deps())
        }
        expect(next.kind).toBe("roundResult")
    })
})

describe("the match's end", () => {
    function matchOver() {
        const match = [round(0, [2, 1]), round(1, [1, 2])]
        return finishRound(playing(match), 1)
    }

    it("comes with a player's second round win", () => {
        expect(matchOver()).toMatchObject({
            kind: "matchResult",
            winner: 1,
            choice: "retry",
            match: [round(0, [2, 1]), round(1, [1, 2]), round(1, [1, 2])],
        })
    })

    it("comes after two straight wins", () => {
        const next = finishRound(playing([round(0, [2, 1])]), 0)
        expect(next).toMatchObject({ kind: "matchResult", winner: 0 })
    })

    it("offers a rematch: a new match on the same stage", () => {
        const over = waitOut(matchOver())
        const next = update(over, confirm, deps())
        if (next.kind !== "playing") throw new Error(next.kind)
        expect(next.match).toEqual([])
        expect(next.level).toBe(0)
        expect(next.animals).toEqual(picks)
        expect(next.mode).toBe("versus")
    })

    it("offers stage select, on the same stage and mode", () => {
        let s = waitOut(matchOver())
        s = update(s, input([["down"]]), deps())
        expect(s).toMatchObject({ kind: "matchResult", choice: "stageSelect" })
        expect(update(s, confirm, deps())).toEqual({
            kind: "stageSelect",
            mode: "versus",
            selected: 0,
        })
    })

    it("ignores confirm until END_CONFIRM_DELAY, but moves the cursor", () => {
        const over = matchOver()
        expect(update(over, confirm, deps())).toBe(over)
        const moved = update(over, input([["down"]]), deps())
        expect(moved).toMatchObject({ choice: "stageSelect" })
    })
})
