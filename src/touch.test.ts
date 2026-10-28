import { beforeEach, describe, expect, it } from "vite-plus/test"
import { InputState, type DirectionAction } from "./input"
import {
    isTap,
    isTouchDevice,
    SWIPE_DISTANCE,
    swipeDirection,
    swipeHeld,
    TAP_MAX_MS,
    TAP_SLOP,
    TouchSource,
} from "./touch"
import { vec2 } from "./vec2"

describe("swipeDirection", () => {
    it("is nothing until the finger has moved SWIPE_DISTANCE", () => {
        expect(swipeDirection(0, 0)).toBeUndefined()
        expect(swipeDirection(SWIPE_DISTANCE - 1, 0)).toBeUndefined()
        expect(swipeDirection(SWIPE_DISTANCE, 0)).toBe("right")
    })

    it("goes by the stronger axis, screen y down", () => {
        expect(swipeDirection(-30, 10)).toBe("left")
        expect(swipeDirection(30, -10)).toBe("right")
        expect(swipeDirection(10, -30)).toBe("up")
        expect(swipeDirection(-10, 30)).toBe("down")
    })

    it("counts a diagonal by its length", () => {
        // 18 px each way is 25 px along the diagonal; a tie goes sideways.
        expect(swipeDirection(18, 18)).toBe("right")
        expect(swipeDirection(-18, -18)).toBe("left")
    })
})

describe("isTap", () => {
    it("is a short touch that hardly moved", () => {
        expect(isTap(0, 0)).toBe(true)
        expect(isTap(TAP_SLOP, TAP_MAX_MS)).toBe(true)
        expect(isTap(TAP_SLOP + 1, 50)).toBe(false)
        expect(isTap(0, TAP_MAX_MS + 1)).toBe(false)
    })
})

describe("swipeHeld", () => {
    it("keeps the previous direction behind a turn", () => {
        expect(swipeHeld([], "up")).toEqual(["up"])
        expect(swipeHeld(["right"], "up")).toEqual(["up", "right"])
        expect(swipeHeld(["up", "right"], "left")).toEqual(["left", "up"])
    })

    it("drops it on a swipe back the way the player came", () => {
        expect(swipeHeld(["right", "up"], "left")).toEqual(["left"])
    })

    it("keeps one direction on a repeated swipe", () => {
        expect(swipeHeld(["right", "up"], "right")).toEqual(["right"])
    })
})

describe("isTouchDevice", () => {
    it("goes by a coarse pointer, then by touch points", () => {
        const media = (matches: boolean) => () => ({ matches })
        expect(isTouchDevice({ matchMedia: media(true) })).toBe(true)
        expect(
            isTouchDevice({
                matchMedia: media(false),
                navigator: { maxTouchPoints: 5 },
            })
        ).toBe(true)
        expect(
            isTouchDevice({
                matchMedia: media(false),
                navigator: { maxTouchPoints: 0 },
            })
        ).toBe(false)
        expect(isTouchDevice({})).toBe(false)
    })

    it("survives a matchMedia that throws", () => {
        const matchMedia = () => {
            throw new Error("no")
        }
        expect(
            isTouchDevice({ matchMedia, navigator: { maxTouchPoints: 1 } })
        ).toBe(true)
    })
})

describe("TouchSource", () => {
    let target: EventTarget
    let input: InputState
    let source: TouchSource
    let now: number

    beforeEach(() => {
        target = new EventTarget()
        input = new InputState()
        now = 0
        source = new TouchSource(target, { now: () => now })
        source.attach(input)
    })

    function pointer(
        type: string,
        x: number,
        y: number,
        id = 1,
        pointerType = "touch"
    ): Event {
        const event = Object.assign(new Event(type, { cancelable: true }), {
            pointerId: id,
            pointerType,
            clientX: x,
            clientY: y,
        })
        target.dispatchEvent(event)
        return event
    }

    // A finger down at the first point, through the others, and up at the
    // last.
    function stroke(points: [number, number][], id = 1) {
        const [first, ...rest] = points
        pointer("pointerdown", first[0], first[1], id)
        for (const [x, y] of rest) pointer("pointermove", x, y, id)
        const last = rest.at(-1) ?? first
        pointer("pointerup", last[0], last[1], id)
    }

    const p1 = () => input.player(0)
    const p2 = () => input.player(1)
    const held = (): DirectionAction[] =>
        (["up", "down", "left", "right"] as const).filter((a) => p1().isDown(a))

    it("presses the swiped direction and keeps it held after the lift", () => {
        stroke([
            [100, 100],
            [140, 105],
        ])
        expect(p1().wasPressed("right")).toBe(true)
        expect(held()).toEqual(["right"])
        expect(p1().step()).toEqual(vec2(1, 0))
        input.endTick()
        // Still going right, with nothing pressed.
        expect(p1().heldSteps()).toEqual([vec2(1, 0)])
        expect(p1().wasPressed("right")).toBe(false)
    })

    it("swipes as soon as the finger has moved far enough", () => {
        pointer("pointerdown", 100, 100)
        pointer("pointermove", 100, 100 - SWIPE_DISTANCE + 1)
        expect(held()).toEqual([])
        pointer("pointermove", 100, 100 - SWIPE_DISTANCE)
        expect(held()).toEqual(["up"])
    })

    it("keeps the previous direction behind a turn, newest first", () => {
        stroke([
            [0, 0],
            [40, 0],
        ])
        stroke([
            [0, 0],
            [0, -40],
        ])
        expect(p1().heldSteps()).toEqual([vec2(0, -1), vec2(1, 0)])
        stroke([
            [0, 0],
            [-40, 0],
        ])
        // Right is let go of; up stays behind left.
        expect(p1().heldSteps()).toEqual([vec2(-1, 0), vec2(0, -1)])
    })

    it("lets go of the old direction on a swipe back", () => {
        stroke([
            [0, 0],
            [40, 0],
        ])
        stroke([
            [0, 0],
            [-40, 0],
        ])
        expect(held()).toEqual(["left"])
    })

    it("turns again without lifting, measuring from the last swipe", () => {
        pointer("pointerdown", 0, 0)
        pointer("pointermove", 40, 0)
        expect(held()).toEqual(["right"])
        // Carrying on right isn't a new swipe.
        input.endTick()
        pointer("pointermove", 120, 0)
        expect(p1().wasPressed("right")).toBe(false)
        // 30 px down from the last anchor (120, 0) turns down.
        pointer("pointermove", 125, 30)
        expect(p1().heldSteps()).toEqual([vec2(0, 1), vec2(1, 0)])
        pointer("pointerup", 125, 30)
        expect(p1().wasPressed("breath")).toBe(false)
    })

    it("presses the held direction again on a repeated swipe", () => {
        stroke([
            [0, 0],
            [40, 0],
        ])
        input.endTick()
        // A restart sets held directions aside until pressed again.
        input.ignoreHeld()
        expect(p1().heldSteps()).toEqual([])
        stroke([
            [0, 0],
            [40, 0],
        ])
        expect(p1().wasPressed("right")).toBe(true)
        expect(p1().heldSteps()).toEqual([vec2(1, 0)])
    })

    it("counts a flick whose movement only shows on the lift", () => {
        pointer("pointerdown", 0, 0)
        pointer("pointerup", 0, 50)
        expect(held()).toEqual(["down"])
        expect(p1().wasPressed("breath")).toBe(false)
    })

    it("breathes on a tap", () => {
        pointer("pointerdown", 50, 50)
        now = 100
        pointer("pointermove", 55, 52)
        pointer("pointerup", 55, 52)
        expect(p1().wasPressed("breath")).toBe(true)
        // Pressed and released, so it is a one-tick press.
        expect(p1().isDown("breath")).toBe(false)
        expect(held()).toEqual([])
    })

    it("doesn't breathe on a long press or a wobble", () => {
        pointer("pointerdown", 50, 50)
        now = TAP_MAX_MS + 1
        pointer("pointerup", 50, 50)
        expect(p1().wasPressed("breath")).toBe(false)

        now = 0
        pointer("pointerdown", 50, 50)
        // Out past the slop and back, never a swipe.
        pointer("pointermove", 50 + TAP_SLOP + 5, 50)
        pointer("pointerup", 50, 50)
        expect(p1().wasPressed("breath")).toBe(false)
        expect(held()).toEqual([])
    })

    it("breathes on a second finger's tap while the first steers", () => {
        pointer("pointerdown", 0, 0, 1)
        pointer("pointermove", 40, 0, 1)
        pointer("pointerdown", 300, 300, 2)
        pointer("pointerup", 300, 300, 2)
        expect(p1().wasPressed("breath")).toBe(true)
        expect(held()).toEqual(["right"])
    })

    it("drives player 1 only", () => {
        stroke([
            [0, 0],
            [40, 0],
        ])
        pointer("pointerdown", 0, 0)
        pointer("pointerup", 0, 0)
        expect(p2().isDown("right")).toBe(false)
        expect(p2().wasPressed("breath")).toBe(false)
    })

    it("ignores the mouse by default, and a cancelled touch", () => {
        pointer("pointerdown", 0, 0, 1, "mouse")
        pointer("pointerup", 0, 0, 1, "mouse")
        expect(p1().wasPressed("breath")).toBe(false)

        pointer("pointerdown", 0, 0)
        pointer("pointercancel", 0, 0)
        pointer("pointerup", 0, 0)
        expect(p1().wasPressed("breath")).toBe(false)
    })

    it("keeps the touch from scrolling or zooming the page", () => {
        expect(pointer("pointerdown", 0, 0).defaultPrevented).toBe(true)
    })

    it("lets go on release and on detach, and listens no more", () => {
        stroke([
            [0, 0],
            [40, 0],
        ])
        source.release()
        expect(held()).toEqual([])

        stroke([
            [0, 0],
            [0, 40],
        ])
        source.detach()
        expect(held()).toEqual([])
        stroke([
            [0, 0],
            [40, 0],
        ])
        expect(held()).toEqual([])
    })
})
