// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import type { Pad } from "./gamepad"

// main with a gamepad: the pad drives the menus and play, a toast reports
// connects and disconnects, and losing the pad mid-game pauses. (A separate
// file, since main is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// Keep the game from ending on its own.
vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return { ...actual, step: vi.fn(() => null) }
})

let pads: (Pad | null)[] = []

function pad(buttons: number[] = [], index = 0): Pad {
    return {
        index,
        buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: buttons.includes(i),
        })),
        axes: [0, 0, 0, 0],
    }
}

function padEvent(type: string, index = 0) {
    dispatchEvent(Object.assign(new Event(type), { gamepad: { index } }))
}

const A = 0
const START = 9

// Hold the buttons for a few frames, then let go for a few.
function tap(...buttons: number[]) {
    pads = [pad(buttons)]
    vi.advanceTimersByTime(100)
    pads = [pad()]
    vi.advanceTimersByTime(100)
}

function disconnect() {
    pads = []
    padEvent("gamepaddisconnected")
}

// Connect an idle pad and let a frame list it (a button held when a pad is
// first listed doesn't press).
function connect() {
    pads = [pad()]
    padEvent("gamepadconnected")
    vi.advanceTimersByTime(20)
}

const screen = () =>
    document.querySelector<HTMLElement>("#overlay")?.dataset.screen ?? "playing"
const toast = () => document.querySelector("#toast")?.textContent

describe("main with a gamepad", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        Object.defineProperty(navigator, "getGamepads", {
            configurable: true,
            value: () => pads,
        })
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
    })

    it("shows a toast on connect that hides after about 2 s", () => {
        connect()
        expect(toast()).toBe("Controller connected")
        vi.advanceTimersByTime(1900)
        expect(toast()).toBe("Controller connected")
        vi.advanceTimersByTime(200)
        expect(toast()).toBeUndefined()
    })

    it("does not pause or leave the menu when lost on the title", () => {
        expect(screen()).toBe("title")
        disconnect()
        expect(toast()).toBe("Controller disconnected")
        expect(screen()).toBe("title")
        connect()
    })

    it("plays through the menus with A", () => {
        tap(A)
        expect(screen()).toBe("stage-select")
        tap(A)
        expect(screen()).toBe("character-select")
        tap(A)
        expect(screen()).toBe("playing")
    })

    it("pauses and resumes with Start", () => {
        tap(START)
        expect(screen()).toBe("pause")
        tap(START)
        expect(screen()).toBe("playing")
    })

    // Regression: every disconnect paused play.
    it("doesn't pause when an idle second pad disconnects", () => {
        pads = [pad(), pad([], 1)]
        padEvent("gamepadconnected", 1)
        vi.advanceTimersByTime(100)
        pads = [pad()]
        padEvent("gamepaddisconnected", 1)
        expect(toast()).toBe("Controller disconnected")
        expect(screen()).toBe("playing")
    })

    it("pauses when the pad disconnects during play", () => {
        vi.advanceTimersByTime(3000)
        expect(toast()).toBeUndefined()
        disconnect()
        expect(screen()).toBe("pause")
        expect(toast()).toBe("Controller disconnected")
        vi.advanceTimersByTime(2100)
        expect(toast()).toBeUndefined()
    })

    it("keeps a reconnect from hiding the new toast early", () => {
        connect()
        vi.advanceTimersByTime(1500)
        disconnect()
        vi.advanceTimersByTime(1000)
        // The first toast's timer was cleared; the second still shows.
        expect(toast()).toBe("Controller disconnected")
        vi.advanceTimersByTime(1100)
        expect(toast()).toBeUndefined()
    })

    // Regression: a throw from polling broke the frame chain for good.
    it("keeps running when polling the pads throws", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        connect()
        expect(screen()).toBe("pause")
        const bad = {
            get index(): number {
                throw new Error("bad pad")
            },
        }
        pads = [bad as unknown as Pad]
        vi.advanceTimersByTime(100)
        // Logged once, not every frame.
        expect(error).toHaveBeenCalledTimes(1)
        pads = [pad()]
        vi.advanceTimersByTime(100)
        tap(START)
        expect(screen()).toBe("playing")
        error.mockRestore()
    })
})
