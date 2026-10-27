// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { showMatchResult, showRoundResult } from "./ui"

// The versus result overlays (KDA-222).

// canvas-confetti touches a 2D canvas context on import, which happy-dom
// doesn't provide.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

afterEach(() => {
    document.body.innerHTML = ""
})

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const title = () => overlay()?.querySelector("h1")?.textContent
const lines = () =>
    [...(overlay()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => li.textContent)

describe("showRoundResult", () => {
    const menu = [
        { label: "Next round", selected: true },
        { label: "Quit", selected: false },
    ]

    it("shows the winner, each player's dots and score, the tally and the menu", () => {
        showRoundResult({
            round: 1,
            winner: 1,
            dots: [12, 15],
            scores: [170, 150],
            wins: [0, 1],
            items: menu,
        })
        expect(overlay()?.dataset.screen).toBe("round-result")
        expect(title()).toBe("Round 1: 2P wins!")
        expect(lines()).toEqual([
            "Dots 1P 12 · 2P 15",
            "Score 1P 170 · 2P 150",
            "Rounds 0–1",
        ])
        expect(items()).toEqual(["Next round", "Quit"])
        expect(overlay()?.querySelector("li.selected")?.textContent).toBe(
            "Next round"
        )
    })

    it("says a draw is played again", () => {
        showRoundResult({
            round: 2,
            winner: null,
            dots: [10, 10],
            scores: [100, 100],
            wins: [1, 0],
            items: menu,
        })
        expect(title()).toBe("Round 2: a draw")
        expect(lines()).toContain("A draw doesn't count: play it again")
    })
})

describe("showMatchResult", () => {
    it("shows the winner, the tally, every round and the menu", () => {
        showMatchResult({
            winner: 0,
            rounds: [
                { winner: 0, dots: [14, 13] },
                { winner: null, dots: [9, 9] },
                { winner: 1, dots: [8, 19] },
                { winner: 0, dots: [20, 7] },
            ],
            wins: [2, 1],
            items: [
                { label: "Rematch", selected: true },
                { label: "Stage select", selected: false },
            ],
        })
        expect(overlay()?.dataset.screen).toBe("match-result")
        expect(title()).toBe("🏆 1P wins the match!")
        expect(lines()).toEqual([
            "Rounds 2–1",
            "Round 1: 1P · 14–13 dots",
            "Round 2: draw, replayed · 9–9 dots",
            "Round 3: 2P · 8–19 dots",
            "Round 4: 1P · 20–7 dots",
        ])
        expect(items()).toEqual(["Rematch", "Stage select"])
        expect(overlay()?.querySelector("li.selected")?.textContent).toBe(
            "Rematch"
        )
    })
})
