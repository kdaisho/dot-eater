// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vite-plus/test"
import { createMuteButton, MUTE_ICONS, pixelSvg } from "./muteButton"

describe("MUTE_ICONS", () => {
    it("are 11x9 grids with a colour for every letter", () => {
        for (const art of Object.values(MUTE_ICONS)) {
            expect(art.grid).toHaveLength(9)
            for (const row of art.grid) {
                expect(row).toHaveLength(11)
                for (const letter of row.replaceAll(".", ""))
                    expect(art.palette[letter]).toBeDefined()
            }
        }
    })
})

describe("pixelSvg", () => {
    it("draws a crisp one-unit square per dot, in its colour", () => {
        const svg = pixelSvg(document, {
            palette: { A: "#111111", B: "#222222" },
            grid: ["A..", ".B."],
        })
        expect(svg.getAttribute("viewBox")).toBe("0 0 3 2")
        expect(svg.getAttribute("shape-rendering")).toBe("crispEdges")
        const dots = [...svg.querySelectorAll("rect")].map((r) =>
            ["x", "y", "fill"].map((a) => r.getAttribute(a)).join(" ")
        )
        expect(dots).toEqual(["0 0 #111111", "1 1 #222222"])
    })
})

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

    it("shows a pixel speaker, not an emoji, and swaps it when muted", () => {
        const { button } = setUp()
        expect(button.textContent).toBe("")
        const reds = () =>
            button.querySelectorAll(
                `rect[fill="${MUTE_ICONS.muted.palette.R}"]`
            ).length
        expect(button.querySelectorAll("svg")).toHaveLength(1)
        expect(reds()).toBe(0)
        expect(button.classList.contains("muted")).toBe(false)
        button.click()
        expect(button.querySelectorAll("svg")).toHaveLength(1)
        expect(reds()).toBe(9)
        expect(button.classList.contains("muted")).toBe(true)
        button.click()
        expect(reds()).toBe(0)
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
