// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { ClearRating } from "./stars"
import {
    overlayTap,
    showGameOver,
    showPlaySelect,
    showStoryClear,
    showStoryEnd,
    showStoryMenu,
} from "./ui"

// Story mode's overlays (KDA-271): the choice of story or stage mode, the
// story menu, the card between stages, the ending, and game over in a run.

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
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => ({
        label: li.textContent,
        selected: li.classList.contains("selected"),
        locked: li.classList.contains("locked"),
    }))

const rating: ClearRating = {
    ticks: 75 * 60,
    parTime: 60,
    healthy: true,
    underPar: false,
    stars: 2,
}

describe("showPlaySelect", () => {
    it("offers story or stage mode under the players picked, with Back", () => {
        showPlaySelect("Co-op", [
            { label: "Story", selected: true },
            { label: "Stage select", selected: false },
        ])
        expect(overlay()?.dataset.screen).toBe("play-select")
        expect(title()).toBe("Co-op")
        expect(hints()).toEqual([
            "↑ ↓ to choose, Space to pick, Esc or B to go back",
        ])
        expect(items().map((i) => i.label)).toEqual(["Story", "Stage select"])
        expect(items()[0].selected).toBe(true)
        const back = overlay()?.querySelector("[data-back]")
        expect(back).not.toBeNull()
        expect(overlayTap(back ?? null)).toEqual({ kind: "back" })
    })
})

describe("showStoryMenu", () => {
    it("lists Continue and New story, greying out a Continue with no stage", () => {
        showStoryMenu([
            {
                label: "Continue (stage 6: coming soon)",
                selected: false,
                locked: true,
            },
            { label: "New story", selected: true },
        ])
        expect(overlay()?.dataset.screen).toBe("story-menu")
        expect(title()).toBe("Story")
        expect(items()).toEqual([
            {
                label: "Continue (stage 6: coming soon)",
                selected: false,
                locked: true,
            },
            { label: "New story", selected: true, locked: false },
        ])
        expect(overlay()?.querySelector("[data-back]")).not.toBeNull()
    })
})

describe("showStoryClear", () => {
    const view = {
        difficulty: "Hard",
        score: 340,
        runTotal: 1290,
        rating,
        next: "Stage 3: Ice",
        items: [{ label: "Next stage", selected: true }],
    }

    it("shows the stage's score, the run total, its time and stars, and what's next", () => {
        showStoryClear(view)
        expect(overlay()?.dataset.screen).toBe("story-clear")
        expect(title()).toBe("Stage clear!")
        expect(lines()).toEqual([
            "Difficulty Hard",
            "Score 340",
            "Run total 1290",
            "Time 1:15.0",
            "★ Cleared",
            "★ At least half health",
            "☆ Under par (1:00)",
            "Next: Stage 3: Ice",
        ])
        expect(items()).toEqual([
            { label: "Next stage", selected: true, locked: false },
        ])
    })

    it("says To be continued when the next stage isn't built yet", () => {
        const { next: _, ...last } = view
        showStoryClear({
            ...last,
            items: [{ label: "Title", selected: true }],
        })
        expect(title()).toBe("To be continued…")
        expect(lines().at(-1)).toBe("More stages are coming soon")
        expect(items().map((i) => i.label)).toEqual(["Title"])
    })

    it("can be tapped", () => {
        showStoryClear(view)
        const item = overlay()?.querySelector("li") ?? null
        expect(overlayTap(item)).toEqual({ kind: "item", index: 0 })
    })
})

// KDA-323: the ALL CLEAR card is a pixel canvas (storyEndView.ts draws
// it); the overlay has no text, menu or tap target of its own.
describe("showStoryEnd", () => {
    const label = "All clear. Easy. Run total 4200. Best 5000"

    it("puts up a canvas over the backdrop, saying what the card says", () => {
        const canvas = showStoryEnd(256, 224, label)
        expect(overlay()?.dataset.screen).toBe("story-end")
        expect(overlay()?.querySelector("canvas")).toBe(canvas)
        expect(document.querySelector("#backdrop")).not.toBeNull()
        expect([canvas.width, canvas.height]).toEqual([256, 224])
        expect(canvas.getAttribute("aria-label")).toBe(label)
        expect(title()).toBeUndefined()
        expect(lines()).toEqual([])
        expect(items()).toEqual([])
    })

    it("keeps the same canvas while the card plays", () => {
        const canvas = showStoryEnd(256, 224, label)
        expect(showStoryEnd(256, 224, label)).toBe(canvas)
        expect(document.querySelectorAll("#overlay")).toHaveLength(1)
    })

    it("has nothing to tap: a tap on it is on the panel", () => {
        const canvas = showStoryEnd(256, 224, label)
        expect(overlayTap(canvas)).toEqual({ kind: "panel" })
    })
})

describe("showGameOver in a story run", () => {
    it("shows the run total after the score", () => {
        showGameOver({
            difficulty: "Medium",
            score: 80,
            runTotal: 600,
            items: [
                { label: "Retry", selected: true },
                { label: "Quit", selected: false },
            ],
        })
        expect(lines()).toEqual([
            "Difficulty Medium",
            "Score 80",
            "Run total 600",
        ])
        expect(items().map((i) => i.label)).toEqual(["Retry", "Quit"])
    })
})
