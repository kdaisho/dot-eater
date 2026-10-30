import { beforeEach, describe, expect, it } from "vite-plus/test"
import { PLAYER_SPEED, TICK_RATE } from "./constants"
import { step, type MoveInput } from "./game"
import {
    InputState,
    KeyboardSource,
    PLAYER_1_KEYS,
    type DirectionAction,
} from "./input"
import { fixedRandom, makeState } from "./test/helpers"
import {
    isTouchDevice,
    isTouchFirst,
    SWIPE_DISTANCE,
    dragHeld,
    swipeDirection,
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

describe("dragHeld", () => {
    it("keeps the way held behind a turn", () => {
        expect(dragHeld(undefined, undefined, "up")).toEqual({
            direction: "up",
        })
        expect(dragHeld("right", undefined, "up")).toEqual({
            direction: "up",
            fallback: "right",
        })
        expect(dragHeld("up", "right", "left")).toEqual({
            direction: "left",
            fallback: "up",
        })
    })

    it("drops the way held on a reversal, keeping an older fallback", () => {
        expect(dragHeld("right", undefined, "left")).toEqual({
            direction: "left",
        })
        expect(dragHeld("up", "right", "down")).toEqual({
            direction: "down",
            fallback: "right",
        })
    })
})

describe("isTouchFirst", () => {
    it("goes by the primary pointer only", () => {
        const media = (coarse: readonly string[]) => (query: string) => ({
            matches: coarse.includes(query),
        })
        expect(isTouchFirst({ matchMedia: media(["(pointer: coarse)"]) })).toBe(
            true
        )
        // A laptop's touch screen: a coarse pointer, but not the primary.
        expect(
            isTouchFirst({ matchMedia: media(["(any-pointer: coarse)"]) })
        ).toBe(false)
        expect(isTouchFirst({})).toBe(false)
        const matchMedia = () => {
            throw new Error("no")
        }
        expect(isTouchFirst({ matchMedia })).toBe(false)
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

    beforeEach(() => {
        target = new EventTarget()
        input = new InputState()
        source = new TouchSource(target)
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

    const down = (x: number, y: number, id = 1) =>
        pointer("pointerdown", x, y, id)
    const move = (x: number, y: number, id = 1) =>
        pointer("pointermove", x, y, id)
    const up = (x: number, y: number, id = 1) => pointer("pointerup", x, y, id)

    const p1 = () => input.player(0)
    const p2 = () => input.player(1)
    const held = (): DirectionAction[] =>
        (["up", "down", "left", "right"] as const).filter((a) => p1().isDown(a))

    it("holds the dragged direction while the finger is down, and lets go on the lift", () => {
        down(100, 100)
        move(140, 105)
        expect(p1().wasPressed("right")).toBe(true)
        expect(p1().heldSteps()).toEqual([vec2(1, 0)])
        input.endTick()
        // Still held, with nothing pressed, while the finger stays down.
        move(141, 104)
        expect(p1().heldSteps()).toEqual([vec2(1, 0)])
        expect(p1().wasPressed("right")).toBe(false)
        up(141, 104)
        expect(held()).toEqual([])
        expect(p1().heldSteps()).toEqual([])
    })

    it("steers once the finger is SWIPE_DISTANCE from where it touched down", () => {
        down(100, 100)
        move(100, 100 - SWIPE_DISTANCE + 1)
        expect(held()).toEqual([])
        expect(p1().wasPressed("up")).toBe(false)
        move(100, 100 - SWIPE_DISTANCE)
        expect(held()).toEqual(["up"])
    })

    it("presses only when the direction changes, not while dragging on", () => {
        down(0, 0)
        move(40, 0)
        input.endTick()
        move(120, 0)
        move(300, 10)
        expect(p1().wasPressed("right")).toBe(false)
        expect(held()).toEqual(["right"])
    })

    it("re-steers without lifting, measuring from where the finger last went the held way", () => {
        down(0, 0)
        move(40, 0)
        move(200, 0)
        input.endTick()
        // Up but not far enough yet: still right.
        move(200, -SWIPE_DISTANCE + 1)
        expect(held()).toEqual(["right"])
        // SWIPE_DISTANCE up from (200, 0), however long the drag right
        // was: up is held, freshly pressed, with right behind it.
        move(200, -SWIPE_DISTANCE)
        expect(p1().wasPressed("up")).toBe(true)
        expect(p1().heldSteps()).toEqual([vec2(0, -1), vec2(1, 0)])
        // Back the way it came: SWIPE_DISTANCE down from where it last
        // went up.
        move(200, -60)
        input.endTick()
        move(200, -60 + SWIPE_DISTANCE - 1)
        expect(held()).toEqual(["up", "right"])
        move(200, -60 + SWIPE_DISTANCE)
        expect(p1().wasPressed("down")).toBe(true)
        // Up goes; right stays behind (see the fallback).
        expect(p1().heldSteps()).toEqual([vec2(0, 1), vec2(1, 0)])
    })

    it("forgets a wobble across the held way once the finger moves on", () => {
        down(0, 0)
        move(40, 0)
        // 15 px down, then on to the right: the wobble is gone...
        move(42, 15)
        move(70, 15)
        // ...so 15 px more down doesn't add up to a turn.
        move(70, 30)
        expect(held()).toEqual(["right"])
        move(70, 15 + SWIPE_DISTANCE)
        expect(p1().heldSteps()[0]).toEqual(vec2(0, 1))
    })

    describe("the fallback", () => {
        it("keeps the direction held before the latest turn behind it, and only that one", () => {
            down(0, 0)
            move(40, 0)
            move(40, -40)
            expect(p1().heldSteps()).toEqual([vec2(0, -1), vec2(1, 0)])
            // Another turn: up stays behind left, right goes.
            move(0, -40)
            expect(p1().heldSteps()).toEqual([vec2(-1, 0), vec2(0, -1)])
        })

        it("presses the fallback afresh when the finger turns back to it", () => {
            down(0, 0)
            move(40, 0)
            move(40, -40)
            input.endTick()
            move(80, -40)
            expect(p1().wasPressed("right")).toBe(true)
            expect(p1().heldSteps()).toEqual([vec2(1, 0), vec2(0, -1)])
        })

        it("is dropped by a reversal of the way the player goes", () => {
            down(0, 0)
            move(40, 0)
            // Left, back the way it was going: right goes.
            move(0, 0)
            expect(p1().heldSteps()).toEqual([vec2(-1, 0)])
        })

        // Regression (PR #79 review): moving right, an early up then down
        // dropped right too, so the player stopped mid-corridor, while
        // holding → and pressing ↑ then ↓ keeps going right.
        it("stays behind a reversal of the latest turn, as with the keys", () => {
            down(0, 0)
            move(40, 0)
            move(40, -40)
            // Down, back from the turn up: up goes, right stays behind.
            move(40, 0)
            expect(p1().heldSteps()).toEqual([vec2(0, 1), vec2(1, 0)])
            // Another reversal: up again, right still behind.
            move(40, -40)
            expect(p1().heldSteps()).toEqual([vec2(0, -1), vec2(1, 0)])
        })

        it("is let go of on the lift, with the direction", () => {
            down(0, 0)
            move(40, 0)
            move(40, -40)
            up(40, -40)
            expect(held()).toEqual([])
        })
    })

    it("counts a flick whose movement only shows on the lift as a tap of that way", () => {
        down(0, 0)
        up(0, 50)
        // Pressed for this tick (so it moves a cell), held no more.
        expect(p1().wasPressed("down")).toBe(true)
        expect(p1().pressedStep()).toEqual(vec2(0, 1))
        expect(held()).toEqual([])
    })

    it("doesn't breathe or press anything on a tap", () => {
        down(50, 50)
        move(55, 52)
        up(55, 52)
        for (const action of ["breath", "punch", "up", "right"] as const) {
            expect(p1().wasPressed(action)).toBe(false)
        }
    })

    describe("with two fingers on the board", () => {
        // Regression (PR #79 review): a thumb that missed Punch and tapped
        // the board stopped the player, and the steering finger was dead
        // until it lifted.
        it("ignores a stray tap: the steering finger keeps steering", () => {
            down(100, 100, 1)
            move(140, 100, 1)
            down(300, 700, 2)
            expect(held()).toEqual(["right"])
            up(300, 700, 2)
            expect(held()).toEqual(["right"])
            // Finger 1 still steers, turns included.
            move(200, 100, 1)
            move(200, 40, 1)
            expect(p1().heldSteps()[0]).toEqual(vec2(0, -1))
        })

        it("lets another finger take over once it drags SWIPE_DISTANCE", () => {
            down(0, 0, 1)
            move(40, 0, 1)
            down(300, 300, 2)
            move(300, 300 + SWIPE_DISTANCE - 1, 2)
            expect(held()).toEqual(["right"])
            move(300, 300 + SWIPE_DISTANCE, 2)
            // Down alone: the first finger's directions are let go of...
            expect(p1().heldSteps()).toEqual([vec2(0, 1)])
            // ...and its small moves don't steer.
            move(50, 0, 1)
            expect(held()).toEqual(["down"])
        })

        it("gives the steering back to the older finger on the lift, from where it is", () => {
            down(0, 0, 1)
            move(40, 0, 1)
            down(300, 300, 2)
            move(300, 340, 2)
            // Finger 1 wandered a little meanwhile (not enough to steer).
            move(40, 20, 1)
            expect(held()).toEqual(["down"])
            up(300, 340, 2)
            // Nothing held: no jump to where finger 1 went.
            expect(held()).toEqual([])
            // Measured from where it is now: 20 px more down isn't enough.
            move(40, 40, 1)
            expect(held()).toEqual([])
            move(40 - SWIPE_DISTANCE, 20, 1)
            expect(held()).toEqual(["left"])
            up(40 - SWIPE_DISTANCE, 20, 1)
            expect(held()).toEqual([])
        })

        it("lets the older finger take back over by dragging", () => {
            down(0, 0, 1)
            move(40, 0, 1)
            down(300, 300, 2)
            move(300, 340, 2)
            move(40, -SWIPE_DISTANCE, 1)
            expect(p1().heldSteps()).toEqual([vec2(0, -1)])
        })

        it("takes the older finger back when the newer one lifts first without steering", () => {
            down(0, 0, 1)
            down(300, 300, 2)
            up(300, 300, 2)
            move(40, 0, 1)
            expect(held()).toEqual(["right"])
        })

        // Regression (PR #79 re-review): release re-anchored only the
        // steering finger, so a resting finger that had drifted 23 px took
        // over with a 1 px move.
        it("measures every finger afresh on release, not only the steering one", () => {
            down(0, 0, 1)
            move(40, 0, 1)
            down(300, 300, 2)
            move(300, 300 - SWIPE_DISTANCE + 1, 2)
            source.release()
            move(300, 300 - SWIPE_DISTANCE, 2)
            expect(held()).toEqual([])
            move(300, 277 - SWIPE_DISTANCE, 2)
            expect(held()).toEqual(["up"])
        })

        it("measures the fingers left afresh when the steering one lifts", () => {
            down(0, 0, 1)
            move(40, 0, 1)
            down(300, 300, 2)
            down(500, 500, 3)
            // Finger 2 drifts, short of taking over.
            move(300, 300 - SWIPE_DISTANCE + 1, 2)
            up(40, 0, 1)
            // Finger 3 steers now; finger 2's drift is forgotten too.
            move(300, 300 - SWIPE_DISTANCE, 2)
            expect(held()).toEqual([])
        })
    })

    describe("pointer capture", () => {
        // A board that records the captures asked of it.
        class Board extends EventTarget {
            captured: number[] = []
            setPointerCapture(id: number) {
                this.captured.push(id)
            }
        }

        it("captures each finger on the board, so it keeps its moves and lift off it", () => {
            const board = new Board()
            source.detach()
            source = new TouchSource(board)
            source.attach(input)
            board.dispatchEvent(
                Object.assign(new Event("pointerdown", { cancelable: true }), {
                    pointerId: 7,
                    pointerType: "pen",
                    clientX: 0,
                    clientY: 0,
                })
            )
            expect(board.captured).toEqual([7])
        })

        it("lets go when a finger's capture is lost", () => {
            down(0, 0)
            move(40, 0)
            pointer("lostpointercapture", 40, 0)
            expect(held()).toEqual([])
            // Forgotten: its moves don't steer.
            move(80, 0)
            expect(held()).toEqual([])
        })
    })

    it("drives player 1 only", () => {
        down(0, 0)
        move(40, 0)
        expect(p2().isDown("right")).toBe(false)
    })

    it("ignores the mouse by default", () => {
        pointer("pointerdown", 0, 0, 1, "mouse")
        pointer("pointermove", 40, 0, 1, "mouse")
        expect(held()).toEqual([])
    })

    it("lets go on a cancelled touch", () => {
        down(0, 0)
        move(40, 0)
        pointer("pointercancel", 40, 0)
        expect(held()).toEqual([])
        move(80, 0)
        expect(held()).toEqual([])
    })

    it("keeps the touch from scrolling or zooming the page", () => {
        expect(down(0, 0).defaultPrevented).toBe(true)
    })

    it("lets go on release, steering again only once the finger drags anew", () => {
        down(0, 0)
        move(40, 0)
        source.release()
        expect(held()).toEqual([])
        // Still down: on the way it went, but measured from where it was
        // let go.
        move(40 + SWIPE_DISTANCE - 1, 0)
        expect(held()).toEqual([])
        move(40 + SWIPE_DISTANCE, 0)
        expect(held()).toEqual(["right"])
    })

    it("lets go on detach, and listens no more", () => {
        down(0, 0)
        move(0, 40)
        source.detach()
        expect(held()).toEqual([])
        down(0, 0)
        move(40, 0)
        expect(held()).toEqual([])
    })

    // Regression (PR #79 review): a page sent to the background without a
    // pointercancel kept the drag's direction held.
    describe("when the page loses focus or is hidden", () => {
        let view: EventTarget
        let doc: EventTarget & { hidden: boolean }

        beforeEach(() => {
            source.detach()
            view = new EventTarget()
            doc = Object.assign(new EventTarget(), { hidden: false })
            source = new TouchSource(target, { view, doc })
            source.attach(input)
        })

        it("lets go on the window's blur, and forgets the finger", () => {
            down(0, 0)
            move(40, 0)
            move(40, -40)
            view.dispatchEvent(new Event("blur"))
            expect(held()).toEqual([])
            // Its lift never came: the next finger steers at once.
            down(100, 100, 2)
            move(100, 140, 2)
            expect(held()).toEqual(["down"])
        })

        it("lets go when the page is hidden, not when it shows", () => {
            down(0, 0)
            move(40, 0)
            doc.dispatchEvent(new Event("visibilitychange"))
            expect(held()).toEqual(["right"])
            doc.hidden = true
            doc.dispatchEvent(new Event("visibilitychange"))
            expect(held()).toEqual([])
        })
    })

    describe("with the keyboard", () => {
        const keys = new EventTarget()
        beforeEach(() =>
            new KeyboardSource([PLAYER_1_KEYS], keys).attach(input)
        )
        const key = (type: string, code: string) =>
            keys.dispatchEvent(Object.assign(new Event(type), { code }))

        it("lets a newer key press win over the drag and its fallback, and stop on release", () => {
            down(0, 0)
            move(40, 0)
            move(40, -40)
            expect(held()).toEqual(["up", "right"])
            input.endTick()
            key("keydown", "ArrowLeft")
            expect(p1().pressedStep()).toEqual(vec2(-1, 0))
            expect(p1().heldSteps()).toEqual([vec2(-1, 0)])
            key("keyup", "ArrowLeft")
            // Nothing holds anything now, the finger still down: the
            // player stops.
            expect(held()).toEqual([])
            // Dragging on the same way a little doesn't take back over...
            move(40, -50)
            expect(held()).toEqual([])
            // ...a whole SWIPE_DISTANCE does: the newest input wins again,
            // with no fallback left over.
            move(40, -40 - SWIPE_DISTANCE)
            expect(held()).toEqual(["up"])
        })

        it("lets a newer drag win over a held key", () => {
            key("keydown", "ArrowRight")
            input.endTick()
            down(0, 0)
            move(0, 40)
            expect(p1().pressedStep()).toEqual(vec2(0, 1))
            expect(p1().heldSteps()[0]).toEqual(vec2(0, 1))
            key("keyup", "ArrowRight")
        })

        it("doesn't drop the drag for a breath, punch or pause key", () => {
            down(0, 0)
            move(40, 0)
            key("keydown", "ShiftRight")
            key("keydown", "Slash")
            key("keydown", "KeyP")
            expect(held()).toEqual(["right"])
        })
    })

    // Regression (PR #56 review): after a swipe left and a restart
    // (ignoreHeld), ArrowLeft couldn't move left: the swipe still held
    // left, so it stayed set aside. main releases the drag whenever a game
    // starts or ends.
    it("frees a released drag's direction for the keys after a restart", () => {
        const keys = new EventTarget()
        new KeyboardSource([PLAYER_1_KEYS], keys).attach(input)
        down(0, 0)
        move(-40, 0)
        input.endTick()
        source.release()
        input.ignoreHeld()
        keys.dispatchEvent(
            Object.assign(new Event("keydown"), { code: "ArrowLeft" })
        )
        expect(p1().pressedStep()).toEqual(vec2(-1, 0))
        expect(p1().heldSteps()).toEqual([vec2(-1, 0)])
    })

    // The drag in a game: as main builds player 1's MoveInput each tick.
    describe("steering the player", () => {
        // A corridor along row 1 with one side opening north at x = 2.
        const junction = [
            [1, 1, 2, 1, 1, 1],
            [2, 2, 2, 2, 2, 2],
            [1, 1, 1, 1, 1, 1],
        ] as const
        const ticksPerCell = TICK_RATE / PLAYER_SPEED

        function run(state: ReturnType<typeof makeState>, ticks: number) {
            for (let i = 0; i < ticks; i++) {
                const move: MoveInput = {
                    held: p1().heldSteps(),
                    pressed: p1().pressedStep(),
                }
                step(state, 1 / TICK_RATE, move, fixedRandom(0))
                input.endTick()
            }
        }
        const at = (state: ReturnType<typeof makeState>) =>
            state.players[0].character.pos

        it("moves while the finger is down and stops at the next cell on the lift", () => {
            const state = makeState(junction, { x: 0, y: 1 })
            down(0, 0)
            move(40, 0)
            run(state, ticksPerCell)
            expect(at(state)).toEqual(vec2(1, 1))
            run(state, ticksPerCell)
            expect(at(state)).toEqual(vec2(2, 1))
            up(40, 0)
            // It finishes the glide into (2, 1) and stops there.
            run(state, ticksPerCell * 3)
            expect(at(state)).toEqual(vec2(2, 1))
        })

        it("buffers a turn dragged just before a junction, like a key tap", () => {
            const state = makeState(junction, { x: 1, y: 1 })
            down(0, 0)
            move(40, 0)
            run(state, ticksPerCell)
            // Gliding into the junction at (2, 1).
            expect(at(state)).toEqual(vec2(2, 1))
            run(state, 3)
            // Up, before it gets there.
            move(40, -40)
            run(state, 1)
            expect(state.players[0].bufferedStep).toEqual(vec2(0, -1))
            run(state, ticksPerCell - 5)
            expect(at(state)).toEqual(vec2(2, 1))
            run(state, 1)
            expect(at(state)).toEqual(vec2(2, 0))
        })

        it("keeps going on an early turn until its junction, then takes it", () => {
            const state = makeState(junction, { x: 0, y: 1 })
            down(0, 0)
            move(40, 0)
            run(state, ticksPerCell)
            expect(at(state)).toEqual(vec2(1, 1))
            // Up, a cell before the junction: north of (1, 1) is a wall, so
            // the player carries on right on the fallback...
            move(40, -40)
            run(state, ticksPerCell)
            expect(at(state)).toEqual(vec2(2, 1))
            // ...and turns up at (2, 1).
            run(state, ticksPerCell)
            expect(at(state)).toEqual(vec2(2, 0))
        })

        it("stops on the lift even with a fallback held", () => {
            const state = makeState(junction, { x: 0, y: 1 })
            down(0, 0)
            move(40, 0)
            run(state, ticksPerCell)
            move(40, -40)
            up(40, -40)
            // The glide into (1, 1) finishes; neither up nor right moves it.
            run(state, ticksPerCell * 3)
            expect(at(state)).toEqual(vec2(1, 1))
        })

        // Regression (PR #79 review): changing an early turn from up to
        // down dropped right as well, so the player stopped at (1, 1).
        it("keeps going when an early turn is changed to the other side, like the keys", () => {
            // A corridor on row 1, opening north at x = 2, south at x = 4.
            const crossing = [
                [1, 1, 2, 1, 1, 1],
                [2, 2, 2, 2, 2, 2],
                [1, 1, 1, 1, 2, 1],
            ] as const
            const state = makeState(crossing, { x: 0, y: 1 })
            down(0, 0)
            move(40, 0)
            run(state, ticksPerCell)
            expect(at(state)).toEqual(vec2(1, 1))
            move(40, -40)
            move(40, 0)
            run(state, ticksPerCell * 4)
            expect(at(state)).toEqual(vec2(4, 2))
        })
    })
})
