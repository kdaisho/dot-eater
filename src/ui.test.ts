// @vitest-environment happy-dom
import confetti from "canvas-confetti"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { celebrate, displayMessage, hideMessage } from "./ui"

// canvas-confetti touches a 2D canvas context on import, which happy-dom
// doesn't provide.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

describe("displayMessage", () => {
    afterEach(() => {
        document.body.innerHTML = ""
    })

    it("shows the game-over message with a backdrop", () => {
        displayMessage(true)
        expect(document.querySelector("#msg")?.textContent).toBe(
            "💀 Press Space to restart."
        )
        expect(document.querySelector("#backdrop")).not.toBeNull()
    })

    it("shows the win message", () => {
        displayMessage(false)
        expect(document.querySelector("#msg")?.textContent).toBe(
            "Congrats! Press Space to restart."
        )
    })

    it("replaces a message that is still showing", () => {
        displayMessage(true)
        displayMessage(false)
        displayMessage(true)
        expect(document.querySelectorAll("#msg")).toHaveLength(1)
        expect(document.querySelectorAll("#backdrop")).toHaveLength(1)
        expect(document.querySelector("#msg")?.textContent).toBe(
            "💀 Press Space to restart."
        )
    })
})

describe("hideMessage", () => {
    it("removes the message and backdrop", () => {
        displayMessage(true)
        hideMessage()
        expect(document.querySelector("#msg")).toBeNull()
        expect(document.querySelector("#backdrop")).toBeNull()
    })

    it("does nothing when no message is showing", () => {
        expect(() => hideMessage()).not.toThrow()
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
