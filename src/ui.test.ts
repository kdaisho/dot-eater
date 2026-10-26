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
import type { StageSlot } from "./progress"
import { rateClear } from "./stars"
import { START_LIVES, TICK_RATE } from "./constants"

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

// A stage clear view: 2 stars (no lives lost, over a 60 s par) in 1:02.5.
const clearView = (choice: 0 | 1, score = 0) => ({
    ...endView(choice, score),
    rating: rateClear({ ticks: 62.5 * TICK_RATE, lives: START_LIVES }, 60),
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
    const open = (name: string): StageSlot => ({ kind: "open", name })
    const slots: StageSlot[] = [
        open("Level 1"),
        open("Level 2"),
        { kind: "locked", name: "Level 3" },
        { kind: "comingSoon" },
        { kind: "comingSoon" },
    ]
    const locked = () =>
        [...(overlay()?.querySelectorAll("li.locked") ?? [])].map(
            (li) => li.textContent
        )

    it("lists the stages with the selected one marked", () => {
        showStageSelect(slots, 1)
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("stage-select")
        expect(items()).toEqual([
            "Level 1",
            "Level 2",
            "🔒 Level 3",
            "Coming soon",
            "Coming soon",
        ])
        expect(selected()).toEqual(["Level 2"])
        expect(
            overlay()
                ?.querySelector("li.selected")
                ?.getAttribute("aria-current")
        ).toBe("true")
    })

    it("greys out locked stages and placeholders, and only those", () => {
        showStageSelect(slots, 0)
        expect(locked()).toEqual(["🔒 Level 3", "Coming soon", "Coming soon"])
        const disabled = [
            ...(overlay()?.querySelectorAll("li[aria-disabled=true]") ?? []),
        ]
        expect(disabled).toHaveLength(3)
    })

    it("marks a locked slot as selected when the cursor is on it", () => {
        showStageSelect(slots, 3)
        const li = overlay()?.querySelector("li.selected")
        expect(li?.textContent).toBe("Coming soon")
        expect(li?.classList.contains("locked")).toBe(true)
        expect(selected()).toEqual(["Coming soon"])
    })

    it("shows the best stars and best time of cleared stages", () => {
        showStageSelect(
            [
                {
                    kind: "open",
                    name: "Classic",
                    stars: 2,
                    bestTime: 42 * 60 + 18,
                },
                { kind: "open", name: "Wrap", stars: 3 },
                { kind: "open", name: "Ice" },
                { kind: "locked", name: "Fog" },
                { kind: "comingSoon" },
            ],
            0
        )
        expect(items()).toEqual([
            "Classic  ★★☆  0:42.3",
            "Wrap  ★★★",
            "Ice",
            "🔒 Fog",
            "Coming soon",
        ])
        expect(selected()).toEqual(["Classic  ★★☆  0:42.3"])
    })

    it("moves the mark when shown again", () => {
        showStageSelect(slots, 0)
        showStageSelect(slots, 1)
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
    it("shows the clear screen with the score, time, stars and menu", () => {
        showStageClear(clearView(0, 340))
        expectSingle()
        expect(overlay()?.dataset.screen).toBe("stage-clear")
        expect(title()).toBe("Stage clear!")
        expect(lines()).toEqual([
            "Score 340",
            "Time 1:02.5",
            "★ Cleared",
            "★ No lives lost",
            "☆ Under par (1:00)",
        ])
        expect(items()).toEqual(["Retry", "Stage select"])
        expect(selected()).toEqual(["Retry"])
    })

    it("marks every star earned on a perfect clear", () => {
        showStageClear({
            ...endView(0),
            rating: rateClear({ ticks: 600, lives: START_LIVES }, 45),
        })
        expect(lines()).toEqual([
            "Score 0",
            "Time 0:10.0",
            "★ Cleared",
            "★ No lives lost",
            "★ Under par (0:45)",
        ])
    })

    it("marks only the clear star on a slow clear with lives lost", () => {
        showStageClear({
            ...endView(0),
            rating: rateClear({ ticks: 3601, lives: 1 }, 60),
        })
        expect(lines().slice(1)).toEqual([
            "Time 1:00.1",
            "★ Cleared",
            "☆ No lives lost",
            "☆ Under par (1:00)",
        ])
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
        showStageSelect([{ kind: "open", name: "Level 1" }], 0)
        showPause()
        showGameOver(endView(0))
        showStageClear(clearView(0))
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
