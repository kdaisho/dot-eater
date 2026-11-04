// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { Pad } from "./gamepad"

// main's Cards page (KDA-320) end to end: opened from the main menu,
// browsed with the keys, a pad's D-pad and stick, taps on the arrows, the
// side cards and the dots, and swipes, and left with Escape, B or Back,
// back on Cards. (A separate file, since main is imported once per module
// graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

let pads: (Pad | null)[] = []

function pad(buttons: number[] = [], axes = [0, 0, 0, 0]): Pad {
    return {
        index: 0,
        buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: buttons.includes(i),
        })),
        axes,
    }
}

const B = 1
const UP = 12
const DOWN = 13
const LEFT = 14
const RIGHT = 15

// Hold the buttons (or lean the stick) for a few frames, then let go.
function tapPad(buttons: number[], axes?: number[]) {
    pads = [pad(buttons, axes)]
    vi.advanceTimersByTime(100)
    pads = [pad()]
    vi.advanceTimersByTime(100)
}

function pressAndTick(code: string) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
    vi.advanceTimersByTime(100)
}

function tap(selector: string) {
    const found = document.querySelector<HTMLElement>(selector)
    if (!found) throw new Error(`No ${selector}`)
    found.click()
    vi.advanceTimersByTime(100)
}

// A swipe across the page from x0 to x1, ending in the click a browser
// sends when the finger lifts on the element it went down on.
function swipe(x0: number, x1: number, on = ".cards-current", y = 300) {
    const target = document.querySelector<HTMLElement>(on)!
    const at = (type: string, x: number) =>
        target.dispatchEvent(
            new PointerEvent(type, { bubbles: true, clientX: x, clientY: y })
        )
    at("pointerdown", x0)
    at("pointerup", x1)
    target.click()
    vi.advanceTimersByTime(100)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const shown = () =>
    overlay()?.querySelector(".cards-current .tcard-name")?.textContent
const count = () => overlay()?.querySelector(".cards-count")?.textContent
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent

// Open the Cards page from the title.
function openCards() {
    tap("#overlay li[data-index='3']")
    expect(screen()).toBe("cards")
}

describe("main's Cards page", () => {
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
        if (screen() === "cards") pressAndTick("Escape")
        expect(screen()).toBe("title")
    })

    it("opens on No.01, the Dragon", () => {
        openCards()
        expect(count()).toBe("No.01/15")
        expect(shown()).toBe("DRAGON")
        expect(
            overlay()?.querySelector(".cards-current .tcard-attack")
                ?.textContent
        ).toBe("FIRE BREATH20 EN")
    })

    it("browses with the arrow keys, wrapping round, and goes back with Escape", () => {
        openCards()
        pressAndTick("ArrowRight")
        expect(shown()).toBe("PENGUIN")
        pressAndTick("ArrowDown")
        expect(shown()).toBe("OWL")
        pressAndTick("ArrowUp")
        pressAndTick("ArrowLeft")
        pressAndTick("ArrowLeft")
        expect(shown()).toBe("PHANTOM LORD")
        expect(count()).toBe("No.15/15")
        pressAndTick("Escape")
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("Cards")
    })

    it("browses with a pad's D-pad and stick, and goes back with B", () => {
        openCards()
        tapPad([RIGHT])
        tapPad([RIGHT])
        expect(shown()).toBe("OWL")
        tapPad([LEFT])
        expect(shown()).toBe("PENGUIN")
        tapPad([DOWN])
        tapPad([UP])
        expect(shown()).toBe("PENGUIN")
        tapPad([], [1, 0, 0, 0])
        expect(shown()).toBe("OWL")
        tapPad([], [-1, 0, 0, 0])
        expect(shown()).toBe("PENGUIN")
        tapPad([B])
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("Cards")
    })

    it("browses on taps on the arrows, the side cards and the dots, and goes back with Back", () => {
        openCards()
        tap(".cards-arrow.next")
        expect(shown()).toBe("PENGUIN")
        tap(".cards-peek.next .tcard-art")
        expect(shown()).toBe("OWL")
        tap(".cards-peek.prev")
        expect(shown()).toBe("PENGUIN")
        tap(".cards-arrow.prev")
        tap(".cards-arrow.prev")
        expect(shown()).toBe("PHANTOM LORD")
        tap(".cards-dot[data-index='11']")
        expect(shown()).toBe("SNAKE")
        // A tap on the card itself does nothing.
        tap(".cards-current .tcard-name")
        expect(shown()).toBe("SNAKE")
        tap(".cards-back")
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("Cards")
    })

    it("browses on swipes, a card a swipe", () => {
        openCards()
        swipe(300, 200)
        expect(shown()).toBe("PENGUIN")
        // One that starts and ends on a side card turns one card, not two:
        // its click isn't a tap on that card too.
        swipe(300, 200, ".cards-peek.next")
        expect(shown()).toBe("OWL")
        swipe(100, 250)
        expect(shown()).toBe("PENGUIN")
        // Too short to turn a card.
        swipe(200, 180)
        expect(shown()).toBe("PENGUIN")
        // A tap after a swipe still taps.
        tap(".cards-arrow.next")
        expect(shown()).toBe("OWL")
    })
})
