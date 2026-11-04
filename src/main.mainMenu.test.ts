// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import type { Pad } from "./gamepad"

// main's main menu (KDA-318) end to end: the title's entries in order, and
// the Tutorial and Soundtrack pages opened and left with the
// keys, a pad and taps, back on its entry; the Cards page is
// main.cards.test.ts's. (A separate file, since main is imported once per
// module graph.)

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
const UP = 12
const DOWN = 13

// Hold the buttons for a few frames, then let go for a few.
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

// Tap (click) an element and let the loop tick it.
function tap(selector: string) {
    const found = document.querySelector<HTMLElement>(selector)
    if (!found) throw new Error(`No ${selector}`)
    found.click()
    vi.advanceTimersByTime(100)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const title = () => overlay()?.querySelector("h1")?.textContent
const lines = () =>
    [...(overlay()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => li.textContent)
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent

const PAGES = [
    { name: "Tutorial", screen: "tutorial", index: 2 },
    { name: "Soundtrack", screen: "soundtrack", index: 4 },
] as const

describe("main's main menu", () => {
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

    it("lists the entries in order, on 1 Player", () => {
        expect(screen()).toBe("title")
        expect(items()).toEqual([
            "1 Player",
            "2 Players",
            "Tutorial",
            "Cards",
            "Soundtrack",
            "Settings",
        ])
        expect(selectedItem()).toBe("1 Player")
    })

    it.each(PAGES)(
        "opens $name with the keys and goes back on it with Escape",
        (page) => {
            for (let i = 0; i < 5; i++) pressAndTick("ArrowUp")
            for (let i = 0; i < page.index; i++) pressAndTick("ArrowDown")
            expect(selectedItem()).toBe(page.name)
            pressAndTick("Space")
            expect(screen()).toBe(page.screen)
            expect(title()).toBe(page.name)
            expect(overlay()?.querySelector("[data-back]")).not.toBeNull()
            // Confirm does nothing on a placeholder (the soundtrack has
            // its own tests: main.soundtrack.test.ts).
            if (page.screen !== "soundtrack") {
                expect(lines()[0]).toBe("Coming soon")
                pressAndTick("Space")
                expect(screen()).toBe(page.screen)
            }
            pressAndTick("Escape")
            expect(screen()).toBe("title")
            expect(selectedItem()).toBe(page.name)
        }
    )

    it.each(PAGES)(
        "opens $name with a pad and goes back on it with B",
        (page) => {
            for (let i = 0; i < 5; i++) tapPad(UP)
            for (let i = 0; i < page.index; i++) tapPad(DOWN)
            expect(selectedItem()).toBe(page.name)
            tapPad(A)
            expect(screen()).toBe(page.screen)
            tapPad(B)
            expect(screen()).toBe("title")
            expect(selectedItem()).toBe(page.name)
        }
    )

    it.each(PAGES)(
        "opens $name on a tap and goes back on it with the Back button",
        (page) => {
            tap(`#overlay li[data-index='${page.index}']`)
            expect(screen()).toBe(page.screen)
            tap("#overlay [data-back]")
            expect(screen()).toBe("title")
            expect(selectedItem()).toBe(page.name)
        }
    )

    it("still goes on from 2 Players to the choice of story or stage mode", () => {
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("play-select")
        expect(title()).toBe("2 Players")
        pressAndTick("Escape")
        expect(selectedItem()).toBe("2 Players")
    })
})
