// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { displayMessage } from "./ui"

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

function press(key: string) {
    dispatchEvent(new KeyboardEvent("keydown", { key }))
}

describe("displayMessage", () => {
    afterEach(() => {
        // Make sure no message (or its handler) leaks into the next test.
        press(" ")
        document.body.innerHTML = ""
    })

    it("restarts exactly once per Space press after several game-overs", () => {
        const restarts = [vi.fn(), vi.fn(), vi.fn()]
        for (const [i, onRestart] of restarts.entries()) {
            displayMessage(i % 2 === 0, onRestart)
            expect(document.querySelectorAll("#msg")).toHaveLength(1)
            press(" ")
            expect(document.querySelector("#msg")).toBeNull()
            expect(document.querySelector("#backdrop")).toBeNull()
        }
        for (const onRestart of restarts) {
            expect(onRestart).toHaveBeenCalledTimes(1)
        }

        // The handlers are gone: Space during play restarts nothing.
        press(" ")
        for (const onRestart of restarts) {
            expect(onRestart).toHaveBeenCalledTimes(1)
        }
    })

    it("keeps waiting for Space when other keys are pressed first", () => {
        const onRestart = vi.fn()
        displayMessage(true, onRestart)
        press("ArrowUp")
        press("a")
        expect(onRestart).not.toHaveBeenCalled()
        expect(document.querySelector("#msg")).not.toBeNull()
        press(" ")
        expect(onRestart).toHaveBeenCalledTimes(1)
        press(" ")
        expect(onRestart).toHaveBeenCalledTimes(1)
    })

    it("replaces a message that is still showing", () => {
        const first = vi.fn()
        const second = vi.fn()
        displayMessage(true, first)
        displayMessage(false, second)
        expect(document.querySelectorAll("#msg")).toHaveLength(1)
        expect(document.querySelectorAll("#backdrop")).toHaveLength(1)
        press(" ")
        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
    })
})
