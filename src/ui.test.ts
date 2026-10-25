// @vitest-environment happy-dom
import confetti from "canvas-confetti"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import {
    celebrate,
    hideOverlay,
    showGameOver,
    showPause,
    showStageClear,
    showStageSelect,
    showTitle,
} from "./ui"

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
const selected = () =>
    [...(overlay()?.querySelectorAll("li.selected") ?? [])].map(
        (li) => li.textContent
    )
// Exactly one overlay and one backdrop are on screen.
const expectSingle = () => {
    expect(document.querySelectorAll("#overlay")).toHaveLength(1)
    expect(document.querySelectorAll("#backdrop")).toHaveLength(1)
}

const endView = (choice: 0 | 1, score = 0) => ({
    score,
    items: ["Retry", "Stage select"].map((label, i) => ({
        label,
        selected: i === choice,
    })),
})

describe("showTitle", () => {
    it("shows the title with a backdrop and how to start", () => {
        showTitle()
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("title")
        expect(title()).toBe("Dot Eater")
        expect(lines()).toEqual(["Press Space to start"])
        expect(items()).toEqual([])
    })
})

describe("showStageSelect", () => {
    it("lists the stages with the selected one marked", () => {
        showStageSelect(["Level 1", "Level 2", "Level 3"], 1)
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("stage-select")
        expect(items()).toEqual(["Level 1", "Level 2", "Level 3"])
        expect(selected()).toEqual(["Level 2"])
        expect(
            overlay()
                ?.querySelector("li.selected")
                ?.getAttribute("aria-current")
        ).toBe("true")
    })

    it("moves the mark when shown again", () => {
        showStageSelect(["Level 1", "Level 2"], 0)
        showStageSelect(["Level 1", "Level 2"], 1)
        expectSingle()
        expect(selected()).toEqual(["Level 2"])
    })
})

describe("showPause", () => {
    it("shows the pause screen", () => {
        showPause()
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("pause")
        expect(title()).toBe("Paused")
    })
})

describe("showStageClear", () => {
    it("shows the clear screen with the final score and its menu", () => {
        showStageClear(endView(0, 340))
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("stage-clear")
        expect(title()).toBe("Stage clear!")
        expect(lines()).toEqual(["Score 340"])
        expect(items()).toEqual(["Retry", "Stage select"])
        expect(selected()).toEqual(["Retry"])
    })
})

describe("showGameOver", () => {
    it("shows the game-over screen with the final score and its menu", () => {
        showGameOver(endView(1, 0))
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("game-over")
        expect(title()).toBe("💀 Game over")
        expect(lines()).toEqual(["Score 0"])
        expect(selected()).toEqual(["Stage select"])
    })
})

describe("overlays", () => {
    it("replace whatever overlay is showing", () => {
        showTitle()
        showStageSelect(["Level 1"], 0)
        showPause()
        showGameOver(endView(0))
        showStageClear(endView(0))
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("stage-clear")
    })
})

describe("hideOverlay", () => {
    it("removes the overlay and backdrop", () => {
        showGameOver(endView(0))
        hideOverlay()
        expect(overlay()).toBeNull()
        expect(document.querySelector("#backdrop")).toBeNull()
    })

    it("does nothing when no overlay is showing", () => {
        expect(() => hideOverlay()).not.toThrow()
    })
})

describe("celebrate", () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.mocked(confetti).mockClear()
    })

    // Burst origins, left to right, of the confetti fired so far.
    const origins = () =>
        vi.mocked(confetti).mock.calls.map(([options]) => options?.origin?.x)

    // celebrate(10) fires 11 bursts, at x = 0, 0.1, ..., 1.0.
    const sweep = Array.from({ length: 11 }, (_, i) => 0.1 * i)

    it("fires the full sweep on every win, not just the first", () => {
        vi.useFakeTimers()
        for (let win = 0; win < 2; win++) {
            vi.mocked(confetti).mockClear()
            celebrate(10)
            vi.runAllTimers()
            expect(origins()).toEqual(sweep)
        }
    })
})
