// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import {
    createTouchControls,
    DPAD_DEAD_ZONE,
    DpadSource,
    padDirection,
    setBreathReady,
    setControls,
    type ControlFlags,
} from "./dpad"
import { InputState } from "./input"
import { createMuteButton } from "./muteButton"
import css from "../css/style.css?raw"

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
        expect(
            root
                .querySelector("[data-action=breath]")
                ?.getAttribute("aria-label")
        ).toBe("Breath")
        expect(root.querySelectorAll("button")).toHaveLength(2)
        expect(createTouchControls(document)).toBe(root)
        expect(document.querySelectorAll("#touch-controls")).toHaveLength(1)
    })
})

describe("setBreathReady", () => {
    it("marks the breath button ready, and not", () => {
        const root = createTouchControls(document)
        const breath = root.querySelector("[data-action=breath]")!
        setBreathReady(root, true)
        expect(breath.classList.contains("ready")).toBe(true)
        expect(
            root
                .querySelector("[data-action=pause]")
                ?.classList.contains("ready")
        ).toBe(false)
        setBreathReady(root, false)
        expect(breath.classList.contains("ready")).toBe(false)
    })
})

// Which controls the stylesheet shows for the body's flags (setControls).
describe("touch controls' visibility", () => {
    // The controls shown with these flags. The controls are built afresh
    // each time: happy-dom keeps an element's computed style when only the
    // body's attributes change.
    function shownWith(flags: ControlFlags): string[] {
        document.getElementById("touch-controls")?.remove()
        setControls(document, flags)
        const root = createTouchControls(document)
        return [...root.children]
            .filter((el) => getComputedStyle(el).display !== "none")
            .map((el) => el.className.replace("touch-controls ", ""))
    }

    beforeEach(() => {
        const style = document.createElement("style")
        style.textContent = css
        document.head.appendChild(style)
    })
    afterEach(() => document.head.replaceChildren())

    const phone = { touch: true, buttons: true, dpad: false }

    it("shows pause and breath only on a touch screen during play", () => {
        expect(shownWith({ ...phone, playing: true })).toEqual([
            "touch-pause",
            "touch-breath",
        ])
        // Outside play (menus, pause).
        expect(shownWith({ ...phone, playing: false })).toEqual([])
        // Not a touch screen.
        expect(
            shownWith({
                touch: false,
                buttons: false,
                dpad: false,
                playing: true,
            })
        ).toEqual([])
    })

    // Regression (PR #79 review): a laptop with a touch screen got the
    // touch buttons (and their band) over its keyboard play.
    it("shows only pause on a touch screen that isn't the main input", () => {
        expect(
            shownWith({
                touch: true,
                buttons: false,
                dpad: false,
                playing: true,
            })
        ).toEqual(["touch-pause"])
    })

    it("shows the D-pad with Show D-pad on, beside breath", () => {
        expect(
            shownWith({ touch: true, buttons: true, dpad: true, playing: true })
        ).toEqual(["touch-pause", "dpad", "touch-breath"])
    })

    // A length in CSS pixels: "12px", or a calc() sum of them, a
    // safe-area env() as its fallback (no notch).
    function px(value: string): number {
        const sum = value
            .replace(/env\([^,)]+,\s*([^)]+)\)/g, "$1")
            .replace(/^calc\((.*)\)$/, "$1")
        return sum
            .split("+")
            .reduce((total, term) => total + parseFloat(term), 0)
    }

    type Box = { name: string; x: number; y: number; w: number; h: number }

    // Where the stylesheet puts a fixed element, from its insets and size
    // (happy-dom lays nothing out). Buttons are border-box, as in browsers.
    function boxOf(el: Element, width: number, height: number): Box {
        const style = getComputedStyle(el)
        const w = px(style.width)
        const h = px(style.height)
        const x =
            style.left !== "auto" && style.left !== ""
                ? px(style.left)
                : width - px(style.right) - w
        const y =
            style.top !== "auto" && style.top !== ""
                ? px(style.top)
                : height - px(style.bottom) - h
        return { name: el.id || el.className, x, y, w, h }
    }

    // Where the stylesheet puts each control shown, and the mute button
    // (muteButton.ts), over every screen.
    function boxesAt(
        width: number,
        height: number,
        flags: ControlFlags
    ): Box[] {
        const { happyDOM } = window as unknown as {
            happyDOM: {
                setViewport(size: { width: number; height: number }): void
            }
        }
        happyDOM.setViewport({ width, height })
        shownWith(flags)
        document.getElementById("mute")?.remove()
        createMuteButton(document, { isMuted: () => false, toggle: () => {} })
        const root = document.getElementById("touch-controls")!
        return [...root.children, document.getElementById("mute")!]
            .filter((el) => getComputedStyle(el).display !== "none")
            .map((el) => boxOf(el, width, height))
    }

    // Regression (PR #79 review): at 320 px in portrait, Breath overlapped
    // the D-pad by 17 px. Regression (KDA-331): pause sat right under the
    // mute button (both 8px in from the top-right corner, mute on top), so
    // a tap there muted instead of pausing.
    it.each([
        [320, 568],
        [360, 740],
        [390, 844],
        [568, 320],
        [740, 360],
        [844, 390],
    ])("keeps the controls apart and on screen at %ix%i", (width, height) => {
        for (const dpad of [false, true]) {
            const boxes = boxesAt(width, height, {
                touch: true,
                buttons: true,
                dpad,
                playing: true,
            })
            expect(boxes).toHaveLength(dpad ? 4 : 3)
            for (const a of boxes) {
                expect(a.x).toBeGreaterThanOrEqual(0)
                expect(a.y).toBeGreaterThanOrEqual(0)
                expect(a.x + a.w).toBeLessThanOrEqual(width)
                expect(a.y + a.h).toBeLessThanOrEqual(height)
                for (const b of boxes) {
                    if (a === b) continue
                    const apart =
                        a.x + a.w <= b.x ||
                        b.x + b.w <= a.x ||
                        a.y + a.h <= b.y ||
                        b.y + b.h <= a.y
                    expect(apart, `${a.name} / ${b.name}`).toBe(true)
                }
            }
        }
    })

    // KDA-331: pause is the mute button's size, 8px left of it, level with
    // it, so the two read as a pair of keys.
    it("puts pause just left of the mute button", () => {
        const boxes = boxesAt(390, 844, {
            touch: true,
            buttons: true,
            dpad: false,
            playing: true,
        })
        const pause = boxes.find((b) => b.name === "touch-pause")!
        const mute = boxes.find((b) => b.name === "mute")!
        expect(pause.y).toBe(mute.y)
        expect([pause.w, pause.h]).toEqual([mute.w, mute.h])
        expect(pause.x + pause.w).toBe(mute.x - 8)
    })

    // happy-dom matches no (pointer: coarse), so this reads the rules
    // there: the bigger finger-sized mute button moves pause further in.
    it("keeps pause clear of the bigger mute button for fingers", () => {
        const coarse = [...document.styleSheets]
            .flatMap((sheet) => [...sheet.cssRules])
            .filter(
                (rule): rule is CSSMediaRule =>
                    rule instanceof CSSMediaRule &&
                    rule.conditionText.includes("pointer: coarse")
            )
            .flatMap((rule) => [...rule.cssRules])
            .filter(
                (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule
            )
        const declared = (selector: string, property: string) =>
            coarse
                .filter((rule) => rule.selectorText.includes(selector))
                .map((rule) => rule.style.getPropertyValue(property))
                .find((value) => value !== "")
        const muteWidth = px(declared("#mute", "width")!)
        const pauseWidth = px(declared(".touch-pause", "width")!)
        const pauseRight = px(declared(".touch-pause", "right")!)
        expect(pauseWidth).toBe(muteWidth)
        // The mute button's 8px in, its width and an 8px gap.
        expect(pauseRight).toBe(8 + muteWidth + 8)
    })

    // KDA-294: breath has the corner to itself.
    it("puts breath in the band's bottom-right corner", () => {
        const at = (width: number, height: number, dpad: boolean) =>
            boxesAt(width, height, {
                touch: true,
                buttons: true,
                dpad,
                playing: true,
            }).find((b) => b.name === "touch-breath")!
        // Without the D-pad, 16 px in from the corner, portrait or not.
        for (const [width, height] of [
            [390, 844],
            [844, 390],
        ] as const) {
            const breath = at(width, height, false)
            expect(breath.x + breath.w).toBe(width - 16)
            expect(breath.y + breath.h).toBe(height - 16)
        }
        // With it, further in: up in portrait, in from the side in landscape.
        const portrait = at(390, 844, true)
        expect(portrait.x + portrait.w).toBe(390 - 16)
        expect(portrait.y + portrait.h).toBe(844 - 54)
        const landscape = at(844, 390, true)
        expect(landscape.x + landscape.w).toBe(844 - 54)
        expect(landscape.y + landscape.h).toBe(390 - 40)
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

    it("presses breath once per tap, never again while held", () => {
        for (const button of [breath()]) {
            const action = button.dataset.action as "breath"
            pointer(button, "pointerdown")
            expect(p1().wasPressed(action)).toBe(true)
            // Held over later ticks: no auto-repeat.
            for (let tick = 0; tick < 5; tick++) {
                input.endTick()
                pointer(button, "pointermove", 3, 2)
                expect(p1().wasPressed(action)).toBe(false)
            }
            pointer(button, "pointerup")
            input.endTick()
            // A second tap is a second press.
            pointer(button, "pointerdown")
            pointer(button, "pointerup")
            expect(p1().wasPressed(action)).toBe(true)
            input.endTick()
        }
    })

    it("looks pressed while a finger is on a button", () => {
        pointer(breath(), "pointerdown", 0, 0, 1)
        expect(breath().classList.contains("pressed")).toBe(true)
        // A second finger on it, then the first lifts: still pressed.
        pointer(breath(), "pointerdown", 0, 0, 2)
        pointer(breath(), "pointerup", 0, 0, 1)
        expect(breath().classList.contains("pressed")).toBe(true)
        pointer(breath(), "pointercancel", 0, 0, 2)
        expect(breath().classList.contains("pressed")).toBe(false)
        expect(p1().isDown("breath")).toBe(false)
    })

    it("takes two fingers at once: steer and breathe", () => {
        pointer(pad(), "pointerdown", 40, 0, 1)
        pointer(breath(), "pointerdown", 0, 0, 2)
        expect(p1().isDown("right")).toBe(true)
        expect(p1().wasPressed("breath")).toBe(true)
        pointer(breath(), "pointerup", 0, 0, 2)
        expect(p1().isDown("right")).toBe(true)
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
