// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"

// main's tutorial (KDA-319) on a touch device: six pages, the Touch page
// last, turned with Prev and Next or a swipe; Done returns to the main
// menu. (A separate file, since main is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// A touch device, as main tells one (isTouchDevice).
vi.mock("./touch", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./touch")>()
    return { ...actual, isTouchDevice: () => true }
})

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const title = () => overlay()?.querySelector("h1")?.textContent
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
const buttons = () => [
    ...(overlay()?.querySelectorAll<HTMLElement>(".tut-button") ?? []),
]

function tap(element: HTMLElement | undefined) {
    if (!element) throw new Error("Nothing to tap")
    element.click()
    vi.advanceTimersByTime(100)
}

function swipe(dx: number, dy = 0) {
    const at = (type: string, x: number, y: number) =>
        document.body.dispatchEvent(
            new PointerEvent(type, {
                bubbles: true,
                pointerId: 7,
                pointerType: "touch",
                clientX: x,
                clientY: y,
            })
        )
    at("pointerdown", 200, 300)
    at("pointerup", 200 + dx, 300 + dy)
    vi.advanceTimersByTime(100)
}

describe("main's tutorial on touch", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        vi.advanceTimersByTime(100)
    })

    it("turns the pages with Next and Prev, and Done goes back", () => {
        tap(
            document.querySelector<HTMLElement>(
                "#overlay li[data-index='2']"
            ) ?? undefined
        )
        expect(title()).toBe("How to play")
        tap(buttons()[1])
        expect(title()).toBe("Keyboard")
        tap(buttons()[0])
        expect(title()).toBe("How to play")
        for (const next of [
            "Keyboard",
            "Controller",
            "Breath",
            "Health",
            "Touch",
        ]) {
            tap(buttons()[1])
            expect(title()).toBe(next)
        }
        expect(buttons()[1]?.textContent).toBe("Done")
        tap(buttons()[1])
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("Tutorial")
    })

    it("turns the pages with a swipe, not an up or down one", () => {
        tap(
            document.querySelector<HTMLElement>(
                "#overlay li[data-index='2']"
            ) ?? undefined
        )
        swipe(-80)
        expect(title()).toBe("Keyboard")
        swipe(-80)
        expect(title()).toBe("Controller")
        swipe(80)
        expect(title()).toBe("Keyboard")
        swipe(0, -80)
        expect(title()).toBe("Keyboard")
        swipe(5)
        expect(title()).toBe("Keyboard")
    })
})
