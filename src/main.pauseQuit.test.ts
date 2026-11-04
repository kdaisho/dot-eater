// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { emptyProgress, PROGRESS_KEY, serializeProgress } from "./progress"

// main's pause menu Quit (KDA-305) outside a story run: stage mode, in
// 1 player and co-op, pauses with Quit to title, which goes to the title
// on the mode played and saves nothing for the stage. (A separate file, since main is
// imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

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

// From the game being played, pause and pick Quit to title.
function quitFromPause() {
    expect(screen()).toBe("playing")
    pressAndTick("Escape")
    expect(screen()).toBe("pause")
    expect(items()).toEqual(["Resume", "Settings", "Quit to title"])
    pressAndTick("ArrowDown")
    pressAndTick("ArrowDown")
    expect(selectedItem()).toBe("Quit to title")
    pressAndTick("Space")
}

describe("main's pause menu", () => {
    it("quits stage mode to the title, saving nothing", async () => {
        vi.useFakeTimers()
        const saved = serializeProgress(emptyProgress())
        localStorage.setItem(PROGRESS_KEY, saved)
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")

        // Stage 1 in stage mode on 1 player.
        expect(selectedItem()).toBe("1 player")
        pressAndTick("Space")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        pressAndTick("Space")
        pressAndTick("Space")
        pressAndTick("Space")
        quitFromPause()
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("1 player")

        // Stage 1 in stage mode in co-op.
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("character-select")
        pressAndTick("KeyD")
        pressAndTick("Space")
        pressAndTick("KeyE")
        quitFromPause()
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("Co-op")

        // Neither quit stage has a best or stars.
        expect(localStorage.getItem(PROGRESS_KEY)).toBe(saved)
    })
})
