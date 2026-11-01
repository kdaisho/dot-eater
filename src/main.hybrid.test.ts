// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { computeLayout } from "./layout"
import { levels } from "./levels"

// main on a laptop with a touch screen: touch points and a coarse pointer
// among others, but a fine primary pointer (its trackpad). The pause
// button shows during play, but the punch and breath buttons don't, and
// the maze keeps no band for them. (A separate file, since main is
// imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return { ...actual, step: vi.fn(() => null) }
})

const tap = (selector: string) => {
    document.querySelector<HTMLElement>(selector)?.click()
    vi.advanceTimersByTime(100)
}

describe("main on a laptop with a touch screen", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        // happy-dom's own controls, which the DOM types don't know.
        const { happyDOM } = window as unknown as {
            happyDOM: {
                setViewport(size: { width: number; height: number }): void
            }
        }
        happyDOM.setViewport({ width: 600, height: 500 })
        Object.defineProperty(navigator, "maxTouchPoints", {
            configurable: true,
            value: 10,
        })
        const media = window.matchMedia.bind(window)
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: (query: string) => {
                if (query === "(any-pointer: coarse)") {
                    return { media: query, matches: true }
                }
                if (query === "(pointer: coarse)") {
                    return { media: query, matches: false }
                }
                return media(query)
            },
        })
        document.body.innerHTML =
            '<main id="play"><canvas id="game"></canvas></main>'
        await import("./main")
    })

    // Regression (PR #79 review): a touch-screen laptop got the punch and
    // breath buttons and their 104 px band.
    it("keeps no band and shows no punch or breath buttons", () => {
        expect(document.body.dataset.touch).toBe("on")
        expect(document.body.dataset.buttons).toBe("off")
        tap("#overlay li[data-index='0']")
        // Stage select.
        tap("#overlay li[data-index='1']")
        tap("#overlay li[data-index='0']")
        // Medium.
        tap("#overlay li[data-index='1']")
        tap("#overlay li.card[data-index='0']")
        expect(document.body.dataset.playing).toBe("on")
        const map = levels[0]
        const whole = computeLayout(
            600,
            500,
            map.cells[0].length,
            map.cells.length
        )
        expect(document.querySelector("canvas")?.style.width).toBe(
            `${whole.width}px`
        )
    })
})
