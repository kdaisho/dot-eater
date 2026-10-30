// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { END_CONFIRM_DELAY } from "./flow"
import type { Outcome } from "./game"
import { levels } from "./levels"
import {
    emptyProgress,
    markCleared,
    parseProgress,
    PROGRESS_KEY,
    serializeProgress,
} from "./progress"

// main in stage mode with story-only unlocks (KDA-272), from a save made
// before story mode (stage 1 cleared): stage select plays the stages it
// opens, a stage mode win records bests but unlocks nothing and comes back
// on the stage played, and a story clear unlocks the next stage for stage
// select in every mode. (A separate file, since main is imported once per
// module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

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
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => li.textContent)
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
const saved = () => parseProgress(localStorage.getItem(PROGRESS_KEY))

function win() {
    nextOutcome = "won"
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(END_CONFIRM_DELAY * 1000)
}

// From the title on 1 player, Stage select.
function toStageSelect() {
    expect(screen()).toBe("title")
    pressAndTick("Space")
    pressAndTick("ArrowDown")
    pressAndTick("Space")
    expect(screen()).toBe("stage-select")
}

describe("main in stage mode", () => {
    it("plays what story mode opened, and unlocks only through it", async () => {
        vi.useFakeTimers()
        localStorage.setItem(
            PROGRESS_KEY,
            serializeProgress(markCleared(emptyProgress(), 0))
        )
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")

        // The old save's clear keeps stage 2 open.
        toStageSelect()
        expect(items().slice(0, 3)).toEqual([
            levels[0].name,
            levels[1].name,
            `🔒 ${levels[2].name}`,
        ])
        // A locked stage can't be started.
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        expect(selectedItem()).toBe(`🔒 ${levels[2].name}`)

        // Stage 2 in stage mode: a win shows Retry and Stage select.
        pressAndTick("ArrowUp")
        pressAndTick("Space")
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        win()
        expect(screen()).toBe("stage-clear")
        expect(items()).toEqual(["Retry", "Stage select"])
        // Its bests are saved, but it isn't cleared: stage 3 stays locked.
        expect(saved().stages[1].cleared).toBe(false)
        expect(saved().stages[1].stars).toBeGreaterThanOrEqual(1)
        expect(saved().stages[2].cleared).toBe(false)

        // Stage select comes back on the stage just played, showing its
        // bests; stage 3 is still locked.
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        expect(selectedItem()).toMatch(new RegExp(`^${levels[1].name} · ★`))
        expect(items()[2]).toBe(`🔒 ${levels[2].name}`)

        // Story mode continues on stage 2; clearing it opens stage 3.
        pressAndTick("Escape")
        expect(screen()).toBe("play-select")
        pressAndTick("ArrowUp")
        pressAndTick("Space")
        expect(selectedItem()).toBe(`Continue (stage 2: ${levels[1].name})`)
        pressAndTick("Space")
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        win()
        expect(screen()).toBe("story-clear")
        expect(saved().stages[1].cleared).toBe(true)
        // Quit the run from the next stage's pause menu.
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        pressAndTick("Escape")
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        pressAndTick("Space")

        // Stage select shows stage 3 open now.
        toStageSelect()
        expect(items()[2]).toBe(levels[2].name)
        pressAndTick("Escape")
        pressAndTick("Escape")

        // Versus shares the unlocks: stage 3 open, stage 4 locked.
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Versus")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        expect(items()[2]).toBe(levels[2].name)
        expect(items()[3]).toBe(`🔒 ${levels[3].name}`)
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        pressAndTick("ArrowUp")
        pressAndTick("Space")
        expect(screen()).toBe("difficulty-select")
    })
})
