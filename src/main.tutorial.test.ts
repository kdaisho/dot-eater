// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { Pad } from "./gamepad"

// main's tutorial (KDA-319) on a desktop, end to end: the keys and a pad
// turn its five pages, confirm goes on and Done returns to the main menu
// on Tutorial, as Back does. (A separate file, since main is imported once
// per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

let pads: (Pad | null)[] = []

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
const B = 1
const LEFT = 14
const RIGHT = 15

function tapPad(...buttons: number[]) {
    pads = [pad(buttons)]
    vi.advanceTimersByTime(100)
    pads = [pad()]
    vi.advanceTimersByTime(100)
}

function pressAndTick(code: string) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
    vi.advanceTimersByTime(100)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const title = () => overlay()?.querySelector("h1")?.textContent
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
const caption = () => overlay()?.querySelector(".tut-caption")?.textContent

function openTutorial() {
    document.querySelector<HTMLElement>("#overlay li[data-index='2']")?.click()
    vi.advanceTimersByTime(100)
    expect(screen()).toBe("tutorial")
}

describe("main's tutorial", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        Object.defineProperty(navigator, "getGamepads", {
            configurable: true,
            value: () => pads,
        })
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        pads = [pad()]
        dispatchEvent(
            Object.assign(new Event("gamepadconnected"), {
                gamepad: { index: 0 },
            })
        )
        vi.advanceTimersByTime(100)
    })

    beforeEach(() => {
        if (screen() === "tutorial") pressAndTick("Escape")
        expect(screen()).toBe("title")
    })

    it("turns the pages with the arrows, and Space goes on to Done", () => {
        openTutorial()
        expect(title()).toBe("How to play")
        pressAndTick("ArrowRight")
        expect(title()).toBe("Keyboard")
        pressAndTick("ArrowLeft")
        pressAndTick("ArrowLeft")
        expect(title()).toBe("How to play")
        for (const next of ["Keyboard", "Controller", "Breath", "Health"]) {
            pressAndTick("Space")
            expect(title()).toBe(next)
        }
        // Five pages on a desktop: the last stops, and confirm is Done.
        pressAndTick("ArrowRight")
        expect(title()).toBe("Health")
        pressAndTick("Space")
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("Tutorial")
    })

    it("turns the pages with a pad's D-pad and A, and B goes back", () => {
        openTutorial()
        tapPad(RIGHT)
        expect(title()).toBe("Keyboard")
        tapPad(A)
        expect(title()).toBe("Controller")
        tapPad(LEFT)
        expect(title()).toBe("Keyboard")
        tapPad(B)
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("Tutorial")
    })

    it("plays each page's scene from its start, on main's ticks", () => {
        openTutorial()
        for (let i = 0; i < 3; i++) pressAndTick("ArrowRight")
        expect(title()).toBe("Breath")
        // Each frame draws the time the ticks have moved on.
        vi.advanceTimersByTime(100)
        expect(caption()).toBe("Eat dots: each one adds 5 energy.")
        vi.advanceTimersByTime(2000)
        expect(caption()).toBe(
            "Hold to charge: one level every 0.25 s, up to 5."
        )
        pressAndTick("ArrowLeft")
        pressAndTick("ArrowRight")
        vi.advanceTimersByTime(100)
        expect(caption()).toBe("Eat dots: each one adds 5 energy.")
    })
})
