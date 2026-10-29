// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import {
    createTouchControls,
    DPAD_DEAD_ZONE,
    DpadSource,
    padDirection,
    setControls,
} from "./dpad"
import { InputState } from "./input"

afterEach(() => {
    document.body.innerHTML = ""
    for (const name of ["touch", "dpad", "playing"]) {
        delete document.body.dataset[name]
    }
})

describe("padDirection", () => {
    it("points nowhere inside the dead zone", () => {
        expect(padDirection(0, 0)).toBeUndefined()
        expect(padDirection(DPAD_DEAD_ZONE - 1, 0)).toBeUndefined()
        expect(padDirection(DPAD_DEAD_ZONE, 0)).toBe("right")
    })

    it("goes by the stronger axis, screen y down", () => {
        expect(padDirection(-40, 10)).toBe("left")
        expect(padDirection(10, -40)).toBe("up")
        expect(padDirection(10, 40)).toBe("down")
    })
})

describe("createTouchControls", () => {
    it("adds pause, the D-pad and breath once", () => {
        const root = createTouchControls(document)
        expect(root.parentElement).toBe(document.body)
        expect(root.querySelector("[data-action=pause]")).not.toBeNull()
        expect(root.querySelector(".dpad")).not.toBeNull()
        expect(root.querySelector("[data-action=breath]")).not.toBeNull()
        expect(createTouchControls(document)).toBe(root)
        expect(document.querySelectorAll("#touch-controls")).toHaveLength(1)
    })
})

describe("setControls", () => {
    it("sets the flags given on the body, leaving the others", () => {
        setControls(document, { touch: true, dpad: false })
        expect(document.body.dataset.touch).toBe("on")
        expect(document.body.dataset.dpad).toBe("off")
        setControls(document, { playing: true })
        expect(document.body.dataset.touch).toBe("on")
        expect(document.body.dataset.playing).toBe("on")
    })
})

describe("DpadSource", () => {
    let input: InputState
    let root: HTMLElement
    let source: DpadSource

    beforeEach(() => {
        root = createTouchControls(document)
        input = new InputState()
        source = new DpadSource(root)
        source.attach(input)
    })

    const pad = () => root.querySelector<HTMLElement>(".dpad")!
    const breath = () =>
        root.querySelector<HTMLElement>("[data-action=breath]")!
    const pause = () => root.querySelector<HTMLElement>("[data-action=pause]")!
    const p1 = () => input.player(0)

    // happy-dom lays nothing out: every rect is at (0, 0) and empty, so
    // the pad's centre is the origin and x, y are offsets from it.
    function pointer(el: Element, type: string, x = 0, y = 0, id = 1): Event {
        const event = Object.assign(
            new Event(type, { bubbles: true, cancelable: true }),
            { pointerId: id, clientX: x, clientY: y }
        )
        el.dispatchEvent(event)
        return event
    }

    it("holds a direction while a finger is on it", () => {
        pointer(pad(), "pointerdown", 40, 0)
        expect(p1().wasPressed("right")).toBe(true)
        expect(p1().isDown("right")).toBe(true)
        pointer(pad(), "pointerup", 40, 0)
        expect(p1().isDown("right")).toBe(false)
    })

    it("follows the finger round the pad without lifting", () => {
        pointer(pad(), "pointerdown", 40, 0)
        pointer(pad(), "pointermove", 5, 40)
        expect(p1().isDown("right")).toBe(false)
        expect(p1().isDown("down")).toBe(true)
        // Back in the middle: nothing.
        pointer(pad(), "pointermove", 2, 2)
        expect(p1().isDown("down")).toBe(false)
        pointer(pad(), "pointermove", -40, 0)
        expect(p1().isDown("left")).toBe(true)
        pointer(pad(), "pointercancel")
        expect(p1().isDown("left")).toBe(false)
    })

    it("presses breath and pause while held", () => {
        pointer(breath(), "pointerdown")
        expect(p1().wasPressed("breath")).toBe(true)
        expect(p1().isDown("breath")).toBe(true)
        pointer(breath(), "pointerup")
        expect(p1().isDown("breath")).toBe(false)

        const down = pointer(pause(), "pointerdown", 0, 0, 2)
        expect(down.defaultPrevented).toBe(true)
        expect(p1().wasPressed("pause")).toBe(true)
        pointer(pause(), "pointerup", 0, 0, 2)
        expect(p1().isDown("pause")).toBe(false)
    })

    it("takes two fingers at once: steer and breathe", () => {
        pointer(pad(), "pointerdown", 0, -40, 1)
        pointer(breath(), "pointerdown", 0, 0, 2)
        expect(p1().isDown("up")).toBe(true)
        expect(p1().isDown("breath")).toBe(true)
        pointer(breath(), "pointerup", 0, 0, 2)
        expect(p1().isDown("up")).toBe(true)
    })

    it("drives player 1 only", () => {
        pointer(pad(), "pointerdown", 40, 0)
        expect(input.player(1).isDown("right")).toBe(false)
    })

    // Regression: the D-pad was found by a data-dpad attribute, which the
    // body also has once the D-pad shows, so a touch on the container's
    // gaps was read as one on the D-pad.
    it("ignores the container's gaps", () => {
        setControls(document, { dpad: true, touch: true, playing: true })
        pointer(root, "pointerdown", 40, 0)
        expect(p1().isDown("right")).toBe(false)
        document.body.dataset.action = "breath"
        pointer(root, "pointerdown", 40, 0, 2)
        expect(p1().isDown("breath")).toBe(false)
    })

    it("lets go of everything on detach and listens no more", () => {
        pointer(pad(), "pointerdown", 40, 0)
        source.detach()
        expect(p1().isDown("right")).toBe(false)
        pointer(breath(), "pointerdown", 0, 0, 2)
        expect(p1().isDown("breath")).toBe(false)
    })
})
