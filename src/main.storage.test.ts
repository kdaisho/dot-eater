// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import type { Outcome } from "./game"
import { pick } from "./test/helpers"

// main with localStorage blocked: even reading window.localStorage throws,
// as it does when site data is disabled. The game must still run, win and
// come back to stage select. (A separate file, since main is imported once
// per module graph and reads storage on import.)

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

const screen = () =>
    document.querySelector<HTMLElement>("#overlay")?.dataset.screen ?? "playing"

describe("main with storage blocked", () => {
    it("plays, wins and returns to stage select without throwing", async () => {
        vi.useFakeTimers()
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            get() {
                throw new Error("SecurityError")
            },
        })
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")

        expect(screen()).toBe("title")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        pressAndTick("Space")
        expect(screen()).toBe("difficulty-select")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("character-select")
        expect(pick()).toBe("dragon")
        pressAndTick("ArrowRight")
        pressAndTick("Space")
        expect(screen()).toBe("playing")

        nextOutcome = "won"
        vi.advanceTimersByTime(1000)
        expect(screen()).toBe("stage-clear")

        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        // The picks couldn't be saved, but hold for the session: Hard
        // shows on stage select and difficulty select opens on it.
        expect(document.querySelector("#overlay p")?.textContent).toBe(
            "Bests on Hard"
        )
        pressAndTick("Space")
        expect(screen()).toBe("difficulty-select")
        expect(
            document.querySelector("#overlay li.selected")?.firstChild
                ?.textContent
        ).toBe("Hard")
        pressAndTick("Space")
        expect(screen()).toBe("character-select")
        expect(pick()).toBe("penguin")
        pressAndTick("Space")
        expect(screen()).toBe("playing")
    })
})
