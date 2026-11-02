// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import type { Pad } from "./gamepad"
import { SETTINGS_KEY } from "./settings"

// main's controls screen end to end (KDA-215): reached from the title's
// settings, a key or pad button captured from the real keydown or pad,
// swapped, saved, applied at once to play and the hints, and the press that
// was captured never acting on the menu. (A separate file, since main is
// imported once per module graph.)

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

function pressAndTick(code: string) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
    vi.advanceTimersByTime(100)
}

// Hold the pad buttons for a few frames, then let go for a few.
function tap(...buttons: number[]) {
    pads = [pad(buttons)]
    vi.advanceTimersByTime(100)
    pads = [pad()]
    vi.advanceTimersByTime(100)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const lines = () =>
    [...(overlay()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
const saved = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null")
const capturing = () => lines()[0]?.startsWith("Press a ") ?? false

const Y = 3

describe("main's controls screen", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        Object.defineProperty(navigator, "getGamepads", {
            configurable: true,
            value: () => pads,
        })
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        // List an idle pad.
        pads = [pad()]
        vi.advanceTimersByTime(100)
    })

    it("opens from the title's settings", () => {
        for (let i = 0; i < 3; i++) pressAndTick("ArrowDown")
        pressAndTick("Space")
        for (let i = 0; i < 6; i++) pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Controls")
        pressAndTick("Space")
        expect(screen()).toBe("controls")
        expect(selectedItem()).toBe("Up ↑")
        expect(capturing()).toBe(false)
    })

    it("cancels a capture with Escape, staying on the screen", () => {
        pressAndTick("Space")
        expect(capturing()).toBe(true)
        expect(lines()[0]).toBe("Press a key for Up")
        pressAndTick("Escape")
        expect(screen()).toBe("controls")
        expect(capturing()).toBe(false)
        expect(selectedItem()).toBe("Up ↑")
    })

    // A phone has no Escape: any tap on the overlay cancels instead, and
    // the tapped row is neither picked nor run.
    it("cancels a capture on a tap, binding nothing", () => {
        const tapOn = (selector: string) => {
            overlay()?.querySelector<HTMLElement>(selector)?.click()
            vi.advanceTimersByTime(100)
        }
        for (const target of ["li:last-child", "p"]) {
            pressAndTick("Space")
            expect(capturing()).toBe(true)
            tapOn(target)
            expect(screen()).toBe("controls")
            expect(capturing()).toBe(false)
            expect(selectedItem()).toBe("Up ↑")
            expect(saved()?.bindings).toBeUndefined()
        }
    })

    // Space is confirm: captured for Up, its press must not also confirm
    // (which would open the prompt again).
    it("captures a menu key without it acting on the menu", () => {
        pressAndTick("Space")
        pressAndTick("Space")
        expect(capturing()).toBe(false)
        expect(selectedItem()).toBe("Up Space")
        // Swapped: confirm took Up's old key.
        expect(saved().bindings.players[0].keys).toMatchObject({
            up: "Space",
            confirm: "ArrowUp",
        })
    })

    it("applies new keys at once, to the menu and its hints", () => {
        // Space now moves up and ArrowUp confirms.
        pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Down ↓")
        pressAndTick("Space")
        expect(selectedItem()).toBe("Up Space")
        expect(lines()).toEqual([
            "Space ↓ to choose, ↑ to change",
            "← → for 2P's controls, Esc or B to go back",
        ])
        pressAndTick("ArrowUp")
        expect(capturing()).toBe(true)
        pressAndTick("ArrowUp")
        // Up back on ArrowUp, confirm back on Space.
        expect(selectedItem()).toBe("Up ↑")
        expect(saved().bindings.players[0].keys).toMatchObject({
            up: "ArrowUp",
            confirm: "Space",
        })
    })

    it("captures a pad button on a pad row, and the pad uses it", () => {
        for (let i = 0; i < 8; i++) pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Pad breath A")
        tap(0) // A confirms: the prompt opens
        expect(capturing()).toBe(true)
        expect(lines()[0]).toBe("Press a button for Pad breath")
        // A key doesn't do for a pad row.
        pressAndTick("KeyZ")
        expect(capturing()).toBe(true)
        tap(Y)
        expect(capturing()).toBe(false)
        expect(selectedItem()).toBe("Pad breath Y")
        expect(saved().bindings.players[0].pad).toEqual({
            breath: Y,
            punch: 2,
            confirm: 0,
            pause: 9,
        })
        // Y is breath only now: it doesn't confirm on the menu.
        tap(Y)
        expect(capturing()).toBe(false)
    })

    it("resets to the defaults and goes back to the settings", () => {
        for (let i = 0; i < 4; i++) pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Reset to defaults")
        pressAndTick("Space")
        // The bindings are dropped: the defaults, from then on.
        expect(saved()).not.toHaveProperty("bindings")
        expect(selectedItem()).toBe("Reset to defaults")
        pressAndTick("ArrowUp")
        expect(selectedItem()).toBe("Pad pause Start")
        pressAndTick("ArrowUp")
        pressAndTick("ArrowUp")
        expect(selectedItem()).toBe("Pad punch X")
        pressAndTick("ArrowUp")
        expect(selectedItem()).toBe("Pad breath A")
        for (let i = 0; i < 4; i++) pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("settings")
        expect(selectedItem()).toBe("Controls")
        pressAndTick("Escape")
        expect(screen()).toBe("title")
    })
})
