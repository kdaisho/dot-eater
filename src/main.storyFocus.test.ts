// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { END_CONFIRM_DELAY, STORY_CARD_SECONDS } from "./flow"
import { step, type Outcome } from "./game"
import type { Pad } from "./gamepad"

// main in story mode with the window losing focus (KDA-271 review): auto-
// pause only pauses `playing`, so a blur during the ending outro or the
// clear card used to leave the card to start the next stage, unpaused, in
// a window nobody was looking at. Now the card waits while the window is
// unfocused, and a stage that starts meanwhile starts paused. (A separate
// file, since main is imported once per module graph.)

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

// A pad, whose presses (unlike a key's or a pointer's) don't mean the
// window has focus.
let pads: Pad[] = []
function pad(buttons: number[] = []): Pad {
    return {
        index: 0,
        buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: buttons.includes(i),
        })),
        axes: [0, 0, 0, 0],
    }
}
const A = 0
function padTap(button: number) {
    pads = [pad([button])]
    vi.advanceTimersByTime(100)
    pads = [pad()]
    vi.advanceTimersByTime(100)
}

const screen = () =>
    document.querySelector<HTMLElement>("#overlay")?.dataset.screen ?? "playing"
const steps = () => vi.mocked(step).mock.calls.length

// Win the stage on the next step, and let the outro run for `ms`.
function win(ms: number) {
    nextOutcome = "won"
    vi.advanceTimersByTime(ms)
}

describe("main's story card in an unfocused window", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        Object.defineProperty(navigator, "getGamepads", {
            configurable: true,
            value: () => pads,
        })
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        // A new story, into play.
        pressAndTick("Space")
        pressAndTick("Space")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("playing")
    })

    it("doesn't start the next stage while the window is blurred", () => {
        win(1000)
        expect(screen()).toBe("story-clear")
        dispatchEvent(new Event("blur"))
        const before = steps()
        vi.advanceTimersByTime((STORY_CARD_SECONDS + 1) * 1000)
        expect(screen()).toBe("story-clear")
        expect(steps()).toBe(before)
    })

    it("starts a stage confirmed meanwhile paused", () => {
        pads = [pad()]
        vi.advanceTimersByTime(100)
        padTap(A)
        expect(screen()).toBe("pause")
        const before = steps()
        vi.advanceTimersByTime(1000)
        expect(steps()).toBe(before)
        // Back in focus, the player resumes it.
        dispatchEvent(new Event("focus"))
        pressAndTick("Escape")
        expect(screen()).toBe("playing")
        expect(steps()).toBeGreaterThan(before)
    })

    it("waits out a blur during the outro too, and goes on once focused", () => {
        nextOutcome = "won"
        vi.advanceTimersByTime(20)
        dispatchEvent(new Event("blur"))
        vi.advanceTimersByTime(1000)
        expect(screen()).toBe("story-clear")
        vi.advanceTimersByTime((STORY_CARD_SECONDS + 1) * 1000)
        expect(screen()).toBe("story-clear")
        dispatchEvent(new Event("focus"))
        vi.advanceTimersByTime((STORY_CARD_SECONDS + END_CONFIRM_DELAY) * 1000)
        expect(screen()).toBe("playing")
    })

    it("takes a key press as focus back", () => {
        nextOutcome = "won"
        vi.advanceTimersByTime(20)
        dispatchEvent(new Event("blur"))
        vi.advanceTimersByTime(1000)
        expect(screen()).toBe("story-clear")
        pressAndTick("Space")
        expect(screen()).toBe("playing")
    })

    it("does the same when the tab is hidden", () => {
        win(1000)
        expect(screen()).toBe("story-clear")
        Object.defineProperty(document, "hidden", {
            configurable: true,
            value: true,
        })
        document.dispatchEvent(new Event("visibilitychange"))
        vi.advanceTimersByTime((STORY_CARD_SECONDS + 1) * 1000)
        expect(screen()).toBe("story-clear")
    })
})
