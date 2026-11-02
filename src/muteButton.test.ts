// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vite-plus/test"
import { createMuteButton } from "./muteButton"

describe("createMuteButton", () => {
    beforeEach(() => document.body.replaceChildren())

    function setUp(muted = false) {
        const state = { muted }
        const mute = createMuteButton(document, {
            isMuted: () => state.muted,
            toggle: () => {
                state.muted = !state.muted
            },
        })
        const button = document.querySelector<HTMLButtonElement>("#mute")!
        return { state, mute, button }
    }

    it("shows sound on by default and mutes on a click", () => {
        const { state, button } = setUp()
        expect(button.getAttribute("aria-label")).toBe("Mute")
        expect(button.getAttribute("aria-pressed")).toBe("false")
        button.click()
        expect(state.muted).toBe(true)
        expect(button.getAttribute("aria-label")).toBe("Unmute")
        expect(button.getAttribute("aria-pressed")).toBe("true")
        button.click()
        expect(state.muted).toBe(false)
    })

    it("keeps its clicks from the screen under it", () => {
        const { button } = setUp()
        let reached = false
        document.addEventListener("click", () => (reached = true))
        button.click()
        expect(reached).toBe(false)
    })

    it("shows a mute changed elsewhere on update", () => {
        const { state, mute, button } = setUp()
        state.muted = true
        mute.update()
        expect(button.getAttribute("aria-label")).toBe("Unmute")
    })

    it("keeps Space and Enter on it from reaching the game", () => {
        const { button } = setUp()
        const seen: string[] = []
        window.addEventListener("keydown", (e) => seen.push(e.key))
        for (const key of [" ", "Enter", "ArrowUp"])
            button.dispatchEvent(
                new KeyboardEvent("keydown", { key, bubbles: true })
            )
        expect(seen).toEqual(["ArrowUp"])
    })
})
