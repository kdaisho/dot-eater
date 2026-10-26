// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { LAST_PICK_KEY } from "./lastPick"
import { pick } from "./test/helpers"

// main with a pick saved by an earlier visit: character select opens on it.
// (A separate file, since main is imported once per module graph and reads
// storage on import.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

function pressAndTick(code: string) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
    vi.advanceTimersByTime(100)
}

const screen = () =>
    document.querySelector<HTMLElement>("#overlay")?.dataset.screen ?? "playing"

describe("main with a saved pick", () => {
    it("opens character select on the saved character", async () => {
        vi.useFakeTimers()
        localStorage.setItem(LAST_PICK_KEY, "skunk")
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")

        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("character-select")
        expect(pick()).toBe("skunk")
    })
})
