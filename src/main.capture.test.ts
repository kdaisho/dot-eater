// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { DEFAULT_BINDINGS } from "./bindings"
import type { Pad } from "./gamepad"
import { KeyboardSource } from "./input"
import { defaultSettings, SETTINGS_KEY } from "./settings"

// main's capture for the controls screen, frame by frame (KDA-215 review
// fixes): animation frames and the clock are driven by hand here, so a
// frame can poll the pads without a tick, as a real fast display does.
// (A separate file, since main is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

let pads: (Pad | null)[] = []
let now = 0
let frames: FrameRequestCallback[] = []

function pad(buttons: number[] = []): Pad {
    return {
        index: 0,
        buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: buttons.includes(i),
        })),
        axes: [0, 0, 0, 0],
    }
}

// Run one animation frame `ms` after the last.
function frame(ms: number) {
    now += ms
    const due = frames
    frames = []
    for (const callback of due) callback(now)
}

// A frame long enough for exactly one tick.
const tickFrame = () => frame(1000 / 60 + 0.01)

function key(code: string) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
}

function pressAndTick(code: string) {
    key(code)
    tickFrame()
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const lines = () =>
    [...(overlay()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
const capturing = () => lines()[0]?.startsWith("Press a ") ?? false

const B = 1
const X = 2

describe("main's controls capture", () => {
    const setBindings = vi.spyOn(KeyboardSource.prototype, "setBindings")

    beforeAll(async () => {
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            frames.push(cb)
            return frames.length
        })
        vi.spyOn(performance, "now").mockImplementation(() => now)
        Object.defineProperty(navigator, "getGamepads", {
            configurable: true,
            value: () => pads,
        })
        // Saved bindings equal to the defaults, as a copy.
        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify({
                ...defaultSettings(),
                bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
            })
        )
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        pads = [pad()]
        tickFrame()
        // Title → Settings → Controls.
        for (let i = 0; i < 3; i++) pressAndTick("ArrowDown")
        pressAndTick("Space")
        for (let i = 0; i < 4; i++) pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(selectedItem()).toBe("Up ↑")
    })

    // Regression: a pad-only player couldn't leave a key prompt.
    it("cancels a key prompt on a pad button", () => {
        pressAndTick("Space")
        expect(capturing()).toBe(true)
        tickFrame()
        pads = [pad([B])]
        tickFrame()
        pads = [pad()]
        tickFrame()
        expect(capturing()).toBe(false)
        expect(selectedItem()).toBe("Up ↑")
    })

    // Regression: a stray button caught by a frame with no tick kept the
    // key pressed after it, before the tick, from being captured.
    it("captures a key pressed after a stray button, before the tick", () => {
        pressAndTick("Space")
        tickFrame()
        pads = [pad([B])]
        frame(1) // polls the pads, no tick
        key("KeyJ")
        tickFrame()
        pads = [pad()]
        tickFrame()
        expect(capturing()).toBe(false)
        expect(selectedItem()).toBe("Up J")
    })

    // Regression: capturing shared a try with polling, so a pad entry that
    // broke the poll also stopped the capture.
    it("captures a button even when polling the pads throws", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        for (let i = 0; i < 7; i++) pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Pad breath A")
        pressAndTick("Space")
        expect(capturing()).toBe(true)
        // The poll reads the stick and throws; the capture reads buttons.
        const broken = (buttons: number[]) =>
            Object.defineProperty(pad(buttons), "axes", {
                get(): number[] {
                    throw new Error("bad axes")
                },
            })
        pads = [broken([])]
        tickFrame()
        pads = [broken([X])]
        tickFrame()
        expect(capturing()).toBe(false)
        expect(selectedItem()).toBe("Pad breath X")
        pads = [pad()]
        tickFrame()
        error.mockRestore()
    })

    // Regression: Reset gave equal bindings as another object, which main
    // compared by reference and applied again (releasing held keys).
    it("doesn't re-apply equal bindings on Reset", () => {
        // Undo the X and the J first, then reset the (now equal) bindings.
        pressAndTick("Space")
        tickFrame()
        pads = [pad([0])]
        tickFrame()
        pads = [pad()]
        tickFrame()
        expect(selectedItem()).toBe("Pad breath A")
        // Up is on J now.
        for (let i = 0; i < 7; i++) pressAndTick("KeyJ")
        pressAndTick("Space")
        pressAndTick("ArrowUp")
        expect(selectedItem()).toBe("Up ↑")
        setBindings.mockClear()
        for (let i = 0; i < 10; i++) pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Reset to defaults")
        pressAndTick("Space")
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")
        expect(saved).not.toHaveProperty("bindings")
        expect(setBindings).not.toHaveBeenCalled()
    })
})
