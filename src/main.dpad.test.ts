// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { computeLayout, controlsSpace } from "./layout"
import { levels } from "./levels"
import { defaultSettings, serializeSettings, SETTINGS_KEY } from "./settings"

// main on a touch screen with Show D-pad saved on: the D-pad shows and the
// maze is fitted into the window less the D-pad's band. (A separate file, since main is imported
// once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return { ...actual, step: vi.fn(() => null) }
})

// Watch what the D-pad presses.
const pressed = vi.hoisted(() => [] as string[])
vi.mock("./input", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./input")>()
    class Watched extends actual.InputState {
        constructor() {
            super()
            this.onPress((player, action) =>
                pressed.push(`${player}:${action}`)
            )
        }
    }
    return { ...actual, InputState: Watched }
})

const tap = (selector: string) => {
    document.querySelector<HTMLElement>(selector)?.click()
    vi.advanceTimersByTime(100)
}

describe("main with the D-pad on", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        // happy-dom's own controls, which the DOM types don't know.
        const { happyDOM } = window as unknown as {
            happyDOM: {
                setViewport(size: { width: number; height: number }): void
            }
        }
        happyDOM.setViewport({ width: 800, height: 700 })
        Object.defineProperty(navigator, "maxTouchPoints", {
            configurable: true,
            value: 5,
        })
        localStorage.setItem(
            SETTINGS_KEY,
            serializeSettings({ ...defaultSettings(), showDpad: true })
        )
        document.body.innerHTML =
            '<main id="play"><canvas id="game"></canvas></main>'
        await import("./main")
    })

    it("shows the D-pad", () => {
        expect(document.body.dataset.dpad).toBe("on")
    })

    it("fits the maze beside the D-pad's bands in landscape", () => {
        tap("#overlay li[data-index='0']")
        tap("#overlay li[data-index='0']")
        tap("#overlay li.card[data-index='0']")
        expect(document.querySelector("#overlay")).toBeNull()
        const map = levels[0]
        const cols = map.cells[0].length
        const rows = map.cells.length
        const room = controlsSpace(800, 700, "dpad")
        expect(room.width).toBeGreaterThan(0)
        const fitted = computeLayout(800 - room.width, 700, cols, rows)
        const whole = computeLayout(800, 700, cols, rows)
        // The band costs the maze some size here, so the test can tell.
        expect(fitted.cell).toBeLessThan(whole.cell)
        const canvas = document.querySelector("canvas")
        expect(canvas?.style.width).toBe(`${fitted.width}px`)
    })

    it("steers player 1 from the D-pad", () => {
        const pad = document.querySelector(".dpad")
        pad?.dispatchEvent(
            Object.assign(new Event("pointerdown", { bubbles: true }), {
                pointerId: 7,
                clientX: 40,
                clientY: 0,
            })
        )
        expect(pressed).toContain("0:right")
    })
})
