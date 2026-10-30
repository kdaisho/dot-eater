// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { MAX_HEALTH, TICK_RATE } from "./constants"
import { rateClear } from "./stars"
import {
    overlayTap,
    showDifficultySelect,
    showGameOver,
    showMatchResult,
    showRoundResult,
    showStageClear,
    showStageSelect,
} from "./ui"

// Difficulty select, and where the other overlays name the difficulty
// (KDA-265).

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
const hints = () =>
    [...(overlay()?.querySelectorAll("p.overlay-hint") ?? [])].map(
        (p) => p.textContent
    )
const menu = [
    { label: "Retry", selected: true },
    { label: "Stage select", selected: false },
]

describe("showDifficultySelect", () => {
    const choices = [
        { label: "Easy", detail: "3 enemies, medium maze", selected: false },
        { label: "Medium", detail: "4 enemies, medium maze", selected: true },
    ]

    it("lists the difficulties, each with its description, the cursor's marked", () => {
        showDifficultySelect(choices)
        expect(overlay()?.dataset.screen).toBe("difficulty-select")
        expect(title()).toBe("Select a difficulty")
        expect(hints()).toEqual([
            "↑ ↓ to choose, Space to pick a character, Esc to go back",
        ])
        const li = [...(overlay()?.querySelectorAll("li") ?? [])]
        expect(li.map((l) => l.firstChild?.textContent)).toEqual([
            "Easy",
            "Medium",
        ])
        expect(
            li.map((l) => l.querySelector(".menu-detail")?.textContent)
        ).toEqual(["3 enemies, medium maze", "4 enemies, medium maze"])
        expect(
            overlay()?.querySelector("li.selected")?.firstChild?.textContent
        ).toBe("Medium")
    })

    it("can be tapped: each item, its description too, and Back", () => {
        showDifficultySelect(choices)
        const detail = overlay()?.querySelectorAll(".menu-detail")[1] ?? null
        expect(overlayTap(detail)).toEqual({ kind: "item", index: 1 })
        const back = overlay()?.querySelector("[data-back]") ?? null
        expect(overlayTap(back)).toEqual({ kind: "back" })
    })
})

describe("showStageSelect's difficulty", () => {
    it("says which difficulty's bests it shows, on phones too", () => {
        showStageSelect(
            [{ kind: "open", name: "Classic", stars: 3 }],
            0,
            "Hard"
        )
        expect(lines()).toEqual([
            "Bests on Hard",
            "↑ ↓ to choose, Space to pick a difficulty, Esc to go back",
        ])
        // Only the key line is a hint (hidden on phones).
        expect(hints()).toEqual([
            "↑ ↓ to choose, Space to pick a difficulty, Esc to go back",
        ])
    })
})

describe("end screens' difficulty", () => {
    it("shows it first on stage clear and game over", () => {
        const rating = rateClear(
            { ticks: 30 * TICK_RATE, players: [{ health: MAX_HEALTH }] },
            60
        )
        showStageClear({
            difficulty: "Super Hard",
            score: 40,
            items: menu,
            rating,
        })
        expect(lines().slice(0, 2)).toEqual([
            "Difficulty Super Hard",
            "Score 40",
        ])
        showGameOver({ difficulty: "Easy", score: 10, items: menu })
        expect(lines()).toEqual(["Difficulty Easy", "Score 10"])
    })

    it("shows it first on a versus round's and match's result", () => {
        showRoundResult({
            difficulty: "Hard",
            round: 1,
            winner: 0,
            dots: [12, 9],
            scores: [120, 90],
            wins: [1, 0],
            items: menu,
        })
        expect(lines()[0]).toBe("Difficulty Hard")
        showMatchResult({
            difficulty: "Hard",
            winner: 0,
            rounds: [{ winner: 0, dots: [12, 9] }],
            wins: [2, 0],
            items: menu,
        })
        expect(lines()[0]).toBe("Difficulty Hard")
    })
})
