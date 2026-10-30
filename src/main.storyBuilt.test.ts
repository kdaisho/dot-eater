// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { END_CONFIRM_DELAY, STORY_CARD_SECONDS } from "./flow"
import type { Outcome } from "./game"
import { levels } from "./levels"
import {
    emptyProgress,
    markCleared,
    PROGRESS_KEY,
    serializeProgress,
} from "./progress"

// main in story mode with fewer stages built than STAGE_COUNT (KDA-271):
// two here. Once both are cleared, Continue waits for stage 3, and clearing
// the last stage built says "To be continued". (A separate file, since main
// is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

vi.mock("./levels", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./levels")>()
    return {
        stages: actual.stages.slice(0, 2),
        levels: actual.levels.slice(0, 2),
    }
})

let nextOutcome: Outcome | null = null
vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return {
        ...actual,
        step: vi.fn(() => {
            const outcome = nextOutcome
            nextOutcome = null
            return outcome
        }),
    }
})

function pressAndTick(code: string) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
    vi.advanceTimersByTime(100)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const heading = () => overlay()?.querySelector("h1")?.textContent
const lines = () =>
    [...(overlay()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => ({
        label: li.textContent,
        locked: li.classList.contains("locked"),
    }))
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent

describe("main in story mode with two stages built", () => {
    it("says To be continued after the last one, and Continue waits for the next", async () => {
        vi.useFakeTimers()
        // Stage 1 cleared before story mode, in stage mode.
        localStorage.setItem(
            PROGRESS_KEY,
            serializeProgress(markCleared(emptyProgress(), 0))
        )
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")

        // The old clear counts: Continue starts on stage 2.
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("story-menu")
        expect(items()).toEqual([
            { label: `Continue (stage 2: ${levels[1].name})`, locked: false },
            { label: "New story", locked: false },
        ])
        pressAndTick("Space")
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("playing")

        nextOutcome = "won"
        vi.advanceTimersByTime(1000)
        expect(screen()).toBe("story-clear")
        expect(heading()).toBe("To be continued…")
        expect(lines().at(-1)).toBe("More stages are coming soon")
        expect(items()).toEqual([{ label: "Title", locked: false }])
        // It doesn't go on by itself.
        vi.advanceTimersByTime(STORY_CARD_SECONDS * 2000)
        expect(screen()).toBe("story-clear")
        vi.advanceTimersByTime(END_CONFIRM_DELAY * 1000)
        pressAndTick("Space")
        expect(screen()).toBe("title")

        // Stage 3 is reached but not built: Continue is greyed out and
        // does nothing.
        pressAndTick("Space")
        pressAndTick("Space")
        expect(items()).toEqual([
            { label: "Continue (stage 3: coming soon)", locked: true },
            { label: "New story", locked: false },
        ])
        pressAndTick("Space")
        expect(screen()).toBe("story-menu")
        pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("New story")
        pressAndTick("Space")
        expect(screen()).toBe("difficulty-select")
    })
})
