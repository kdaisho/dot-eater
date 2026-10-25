import { describe, expect, it } from "vite-plus/test"
import { keyToStep, shouldRestart } from "./input"
import { vec2 } from "./vec2"

describe("keyToStep", () => {
    it("maps arrow keys to unit steps and anything else to zero", () => {
        expect(keyToStep("ArrowUp")).toEqual(vec2(0, -1))
        expect(keyToStep("ArrowDown")).toEqual(vec2(0, 1))
        expect(keyToStep("ArrowLeft")).toEqual(vec2(-1, 0))
        expect(keyToStep("ArrowRight")).toEqual(vec2(1, 0))
        expect(keyToStep(" ")).toEqual(vec2(0, 0))
    })
})

describe("shouldRestart", () => {
    const ended = { locked: true }
    const playing = { locked: false }

    it("restarts on Space once the game has ended", () => {
        expect(shouldRestart(ended, { key: " ", repeat: false })).toBe(true)
    })

    it("ignores Space during play", () => {
        expect(shouldRestart(playing, { key: " ", repeat: false })).toBe(false)
    })

    it("ignores auto-repeated Space", () => {
        expect(shouldRestart(ended, { key: " ", repeat: true })).toBe(false)
    })

    it("ignores other keys", () => {
        expect(shouldRestart(ended, { key: "Enter", repeat: false })).toBe(
            false
        )
    })
})
