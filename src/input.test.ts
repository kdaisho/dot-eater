import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import {
    ACTIONS,
    directionStep,
    InputState,
    isDirection,
    KeyboardSource,
    PLAYER_1_KEYS,
    PLAYER_2_KEYS,
    type Action,
} from "./input"
import { vec2 } from "./vec2"

describe("directionStep", () => {
    it("maps direction actions to unit steps", () => {
        expect(directionStep("up")).toEqual(vec2(0, -1))
        expect(directionStep("down")).toEqual(vec2(0, 1))
        expect(directionStep("left")).toEqual(vec2(-1, 0))
        expect(directionStep("right")).toEqual(vec2(1, 0))
    })

    it("only treats the four directions as directions", () => {
        expect(ACTIONS.filter(isDirection)).toEqual([
            "up",
            "down",
            "left",
            "right",
        ])
    })
})

describe("PlayerInput", () => {
    let input: InputState
    beforeEach(() => {
        input = new InputState()
    })

    it("tracks held and pressed separately", () => {
        const p = input.player(0)
        p.press("breath", "a")
        expect(p.isDown("breath")).toBe(true)
        expect(p.wasPressed("breath")).toBe(true)

        input.endTick()
        expect(p.isDown("breath")).toBe(true)
        expect(p.wasPressed("breath")).toBe(false)

        p.release("breath", "a")
        expect(p.isDown("breath")).toBe(false)
    })

    it("keeps a tap shorter than a tick until endTick", () => {
        const p = input.player(0)
        p.press("confirm", "a")
        p.release("confirm", "a")
        expect(p.isDown("confirm")).toBe(false)
        expect(p.wasPressed("confirm")).toBe(true)
        input.endTick()
        expect(p.wasPressed("confirm")).toBe(false)
    })

    it("only presses on the edge", () => {
        const p = input.player(0)
        expect(p.press("up", "a")).toBe(true)
        input.endTick()
        expect(p.press("up", "a")).toBe(false)
        expect(p.press("up", "b")).toBe(false)
        expect(p.wasPressed("up")).toBe(false)
    })

    it("stays held until every control on the action is released", () => {
        const p = input.player(0)
        p.press("pause", "a")
        p.press("pause", "b")
        p.release("pause", "a")
        expect(p.isDown("pause")).toBe(true)
        p.release("pause", "b")
        expect(p.isDown("pause")).toBe(false)
    })

    it("steps toward the most recently pressed held direction", () => {
        const p = input.player(0)
        expect(p.step()).toEqual(vec2(0, 0))
        p.press("left", "a")
        expect(p.step()).toEqual(vec2(-1, 0))
        p.press("up", "b")
        expect(p.step()).toEqual(vec2(0, -1))
        input.endTick()
        p.release("up", "b")
        expect(p.step()).toEqual(vec2(-1, 0))
        p.release("left", "a")
        expect(p.step()).toEqual(vec2(0, 0))
    })

    it("steps for a direction tapped within the tick", () => {
        const p = input.player(0)
        p.press("right", "a")
        p.release("right", "a")
        expect(p.step()).toEqual(vec2(1, 0))
        input.endTick()
        expect(p.step()).toEqual(vec2(0, 0))
    })

    it("keeps players separate", () => {
        input.player(1).press("up", "a")
        expect(input.player(0).isDown("up")).toBe(false)
        expect(input.player(1).isDown("up")).toBe(true)
    })

    it("rejects unknown players", () => {
        expect(() => input.player(2)).toThrow(RangeError)
    })

    it("notifies press listeners on edges only, until unsubscribed", () => {
        const listener = vi.fn()
        const off = input.onPress(listener)
        input.player(1).press("confirm", "a")
        input.player(1).press("confirm", "b")
        expect(listener.mock.calls).toEqual([[1, "confirm"]])
        off()
        input.player(0).press("up", "a")
        expect(listener).toHaveBeenCalledTimes(1)
    })
})

describe("KeyboardSource", () => {
    let target: EventTarget
    let input: InputState
    let source: KeyboardSource

    // Plain events: the default (node) environment has no KeyboardEvent.
    function key(
        type: "keydown" | "keyup",
        code: string,
        init: { repeat?: boolean; ctrlKey?: boolean } = {}
    ) {
        const event = Object.assign(new Event(type, { cancelable: true }), {
            code,
            repeat: false,
            ctrlKey: false,
            metaKey: false,
            altKey: false,
            ...init,
        })
        target.dispatchEvent(event)
        return event
    }

    const p1 = () => input.player(0)
    const p2 = () => input.player(1)

    beforeEach(() => {
        target = new EventTarget()
        input = new InputState()
        source = new KeyboardSource([PLAYER_1_KEYS, PLAYER_2_KEYS], target)
        source.attach(input)
    })

    it("maps player 1 to arrows and player 2 to WASD by default", () => {
        const expected: [string, Action][] = [
            ["ArrowUp", "up"],
            ["ArrowDown", "down"],
            ["ArrowLeft", "left"],
            ["ArrowRight", "right"],
            ["ShiftRight", "breath"],
            ["KeyP", "pause"],
            ["Escape", "pause"],
            ["Space", "confirm"],
        ]
        expect(Object.entries(PLAYER_1_KEYS)).toEqual(expected)
        expect(Object.entries(PLAYER_2_KEYS)).toEqual([
            ["KeyW", "up"],
            ["KeyS", "down"],
            ["KeyA", "left"],
            ["KeyD", "right"],
            ["ShiftLeft", "breath"],
            ["KeyQ", "pause"],
            ["KeyE", "confirm"],
        ])
    })

    it("feeds each player from its own keys", () => {
        key("keydown", "ArrowUp")
        key("keydown", "KeyD")
        expect(p1().isDown("up")).toBe(true)
        expect(p1().isDown("right")).toBe(false)
        expect(p2().isDown("right")).toBe(true)
        expect(p2().isDown("up")).toBe(false)
    })

    it("presses on keydown and releases on keyup", () => {
        key("keydown", "Space")
        expect(p1().isDown("confirm")).toBe(true)
        expect(p1().wasPressed("confirm")).toBe(true)
        key("keyup", "Space")
        expect(p1().isDown("confirm")).toBe(false)
        expect(p1().wasPressed("confirm")).toBe(true)
        input.endTick()
        expect(p1().wasPressed("confirm")).toBe(false)
    })

    it("ignores auto-repeat of a held key", () => {
        key("keydown", "Space")
        input.endTick()
        key("keydown", "Space", { repeat: true })
        expect(p1().isDown("confirm")).toBe(true)
        expect(p1().wasPressed("confirm")).toBe(false)
    })

    it("presses again on a fresh keydown whose keyup was missed", () => {
        key("keydown", "ArrowLeft")
        input.endTick()
        // No keyup (macOS sends none for other keys while Cmd is held).
        key("keydown", "ArrowLeft")
        expect(p1().wasPressed("left")).toBe(true)
        expect(p1().isDown("left")).toBe(true)
        key("keyup", "ArrowLeft")
        expect(p1().isDown("left")).toBe(false)
    })

    it("keeps another source's hold when re-pressing after a missed keyup", () => {
        p1().press("left", "pad:0")
        key("keydown", "ArrowLeft")
        key("keydown", "ArrowLeft")
        key("keyup", "ArrowLeft")
        expect(p1().isDown("left")).toBe(true)
    })

    it("counts auto-repeat of a key whose keydown was missed as a press", () => {
        // Pressed with Ctrl held, then Ctrl released while the key stays down.
        key("keydown", "ArrowUp", { ctrlKey: true })
        expect(p1().isDown("up")).toBe(false)
        key("keydown", "ArrowUp", { repeat: true })
        expect(p1().isDown("up")).toBe(true)
        expect(p1().wasPressed("up")).toBe(true)
        // Further repeats don't press again.
        input.endTick()
        key("keydown", "ArrowUp", { repeat: true })
        expect(p1().wasPressed("up")).toBe(false)
    })

    it("picks up a key held while the window regains focus", () => {
        key("keydown", "ArrowRight")
        target.dispatchEvent(new Event("blur"))
        expect(p1().isDown("right")).toBe(false)
        key("keydown", "ArrowRight", { repeat: true })
        expect(p1().isDown("right")).toBe(true)
    })

    it("keeps an action held while another key on it is down", () => {
        key("keydown", "KeyP")
        key("keydown", "Escape")
        key("keyup", "KeyP")
        expect(p1().isDown("pause")).toBe(true)
        key("keyup", "Escape")
        expect(p1().isDown("pause")).toBe(false)
    })

    it("prevents the default action of mapped keys only", () => {
        expect(key("keydown", "ArrowDown").defaultPrevented).toBe(true)
        expect(
            key("keydown", "ArrowDown", { repeat: true }).defaultPrevented
        ).toBe(true)
        expect(key("keydown", "KeyZ").defaultPrevented).toBe(false)
    })

    it("leaves keys with Ctrl, Meta or Alt to the browser", () => {
        const event = key("keydown", "KeyP", { ctrlKey: true })
        expect(event.defaultPrevented).toBe(false)
        expect(p1().isDown("pause")).toBe(false)
    })

    it("releases everything on blur", () => {
        key("keydown", "ArrowLeft")
        key("keydown", "KeyW")
        target.dispatchEvent(new Event("blur"))
        expect(p1().isDown("left")).toBe(false)
        expect(p2().isDown("up")).toBe(false)
        // The next keydown is a fresh press.
        input.endTick()
        key("keydown", "ArrowLeft")
        expect(p1().wasPressed("left")).toBe(true)
    })

    it("releases held keys and stops listening on detach", () => {
        key("keydown", "ArrowRight")
        source.detach()
        expect(p1().isDown("right")).toBe(false)
        input.endTick()
        key("keydown", "ArrowUp")
        expect(p1().isDown("up")).toBe(false)
        expect(key("keydown", "ArrowUp").defaultPrevented).toBe(false)
    })

    it("does not release holds from other sources", () => {
        p1().press("left", "pad:0")
        key("keydown", "ArrowLeft")
        key("keyup", "ArrowLeft")
        expect(p1().isDown("left")).toBe(true)
        key("keydown", "ArrowLeft")
        target.dispatchEvent(new Event("blur"))
        expect(p1().isDown("left")).toBe(true)
    })

    it("only drives player 1 with the default mapping", () => {
        const solo = new InputState()
        const defaults = new KeyboardSource(undefined, target)
        source.detach()
        defaults.attach(solo)
        key("keydown", "KeyW")
        key("keydown", "ArrowUp")
        expect(solo.player(0).isDown("up")).toBe(true)
        expect(solo.player(1).isDown("up")).toBe(false)
        defaults.detach()
    })
})
