// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { displayMessage, hideMessage } from "./ui"

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
