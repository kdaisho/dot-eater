import { beforeEach, describe, expect, it } from "vite-plus/test"
import {
    GamepadSource,
    padControls,
    stickAction,
    STICK_DEAD_ZONE,
    type Pad,
    type PadChange,
} from "./gamepad"
import { InputState, KeyboardSource, type Action } from "./input"
import { vec2 } from "./vec2"

// A fake pad holding the given standard-mapping buttons, with the left stick
// at (x, y).
function pad(index: number, buttons: number[] = [], x = 0, y = 0): Pad {
    return {
        index,
        buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: buttons.includes(i),
        })),
        axes: [x, y, 0, 0],
    }
}

const A = 0
const START = 9
const UP = 12
const DOWN = 13
const LEFT = 14
const RIGHT = 15

function connectEvent(type: string, index: number): Event {
    return Object.assign(new Event(type), { gamepad: { index } })
}

describe("stickAction", () => {
    it("ignores the stick inside the dead zone", () => {
        expect(stickAction(0, 0)).toBeUndefined()
        expect(stickAction(0.49, -0.49)).toBeUndefined()
        expect(stickAction(-STICK_DEAD_ZONE + 0.01, 0)).toBeUndefined()
    })

    it("maps each direction past the dead zone", () => {
        expect(stickAction(0, -STICK_DEAD_ZONE)).toBe("up")
        expect(stickAction(0, 1)).toBe("down")
        expect(stickAction(-0.8, 0)).toBe("left")
        expect(stickAction(0.6, 0)).toBe("right")
    })

    it("takes only the dominant axis", () => {
        expect(stickAction(0.9, -0.6)).toBe("right")
        expect(stickAction(-0.55, 0.7)).toBe("down")
        expect(stickAction(0.3, -0.8)).toBe("up")
    })
})

describe("padControls", () => {
    it("maps the D-pad, A and Start of the standard mapping", () => {
        const held = padControls(pad(1, [UP, DOWN, LEFT, RIGHT, A, START]))
        expect(Object.fromEntries(held)).toEqual({
            "pad:1:12": ["up"],
            "pad:1:13": ["down"],
            "pad:1:14": ["left"],
            "pad:1:15": ["right"],
            "pad:1:0": ["breath", "confirm"],
            "pad:1:9": ["pause"],
        })
    })

    it("ignores unmapped buttons", () => {
        expect(padControls(pad(0, [1, 2, 3, 16])).size).toBe(0)
    })

    // Regression: a malformed pad entry threw, stopping the frame loop.
    it("reads a pad missing buttons or axes as holding nothing", () => {
        expect(padControls({ index: 0 }).size).toBe(0)
        expect(padControls({ index: 0, buttons: [null], axes: [] }).size).toBe(
            0
        )
    })

    it("adds the stick as one control", () => {
        expect(Object.fromEntries(padControls(pad(2, [], -1, 0)))).toEqual({
            "pad:2:stick": ["left"],
        })
    })
})

describe("GamepadSource", () => {
    let pads: (Pad | null)[]
    let target: EventTarget
    let changes: PadChange[]
    let input: InputState
    let source: GamepadSource

    beforeEach(() => {
        pads = []
        target = new EventTarget()
        changes = []
        input = new InputState()
        source = new GamepadSource(
            () => pads,
            target,
            (change) => changes.push(change)
        )
        source.attach(input)
    })

    const p1 = () => input.player(0)
    const p2 = () => input.player(1)
    // Poll, then read what player `who` saw this tick, then end the tick.
    function tick(who = p1) {
        source.poll()
        const seen = {
            pressed: ACTIONS_SEEN.filter((a) => who().wasPressed(a)),
            down: ACTIONS_SEEN.filter((a) => who().isDown(a)),
        }
        input.endTick()
        return seen
    }
    // List `count` idle pads (indexes 0 up) once, so what they hold next
    // counts: a button held when a pad is first listed doesn't press.
    function plugIn(count = 1) {
        pads = Array.from({ length: count }, (_, i) => pad(i))
        source.poll()
    }
    const ACTIONS_SEEN: Action[] = [
        "up",
        "down",
        "left",
        "right",
        "breath",
        "confirm",
        "pause",
    ]

    it("presses on the frame a button goes down", () => {
        plugIn()
        pads = [pad(0, [UP])]
        expect(tick()).toEqual({ pressed: ["up"], down: ["up"] })
    })

    // Regression: Chrome and Safari list a pad only after a button on it is
    // pressed, and that press (often A, confirm) went straight through.
    it.each([
        ["by polling", () => {}],
        [
            "after its connect event",
            () => target.dispatchEvent(connectEvent("gamepadconnected", 0)),
        ],
    ])(
        "doesn't press a button held when the pad is first listed (%s)",
        (_, announce) => {
            announce()
            pads = [pad(0, [A], 1, 0)]
            expect(tick()).toEqual({ pressed: [], down: [] })
            expect(tick()).toEqual({ pressed: [], down: [] })
            pads = [pad(0)]
            tick()
            pads = [pad(0, [A], 1, 0)]
            expect(tick().pressed).toEqual(["right", "breath", "confirm"])
        }
    )

    it("A is breath and confirm, Start is pause", () => {
        plugIn()
        pads = [pad(0, [A, START])]
        expect(tick().pressed).toEqual(["breath", "confirm", "pause"])
    })

    it("holding never presses again", () => {
        plugIn()
        pads = [pad(0, [A])]
        tick()
        for (let i = 0; i < 5; i++) {
            expect(tick()).toEqual({ pressed: [], down: ["breath", "confirm"] })
        }
    })

    it("releases on the frame a button goes up, and presses again after", () => {
        plugIn()
        pads = [pad(0, [RIGHT])]
        tick()
        pads = [pad(0)]
        expect(tick()).toEqual({ pressed: [], down: [] })
        pads = [pad(0, [RIGHT])]
        expect(tick().pressed).toEqual(["right"])
    })

    it("lets the stick through only past the dead zone", () => {
        pads = [pad(0, [], 0.4, 0)]
        expect(tick().down).toEqual([])
        pads = [pad(0, [], 0.7, 0)]
        expect(tick()).toEqual({ pressed: ["right"], down: ["right"] })
        // Leaning harder is still the same hold.
        pads = [pad(0, [], 1, 0)]
        expect(tick().pressed).toEqual([])
    })

    it("swings the stick from one direction to another", () => {
        plugIn()
        pads = [pad(0, [], 0, -1)]
        tick()
        pads = [pad(0, [], -1, -0.3)]
        expect(tick()).toEqual({ pressed: ["left"], down: ["left"] })
        expect(p1().step()).toEqual(vec2(-1, 0))
    })

    it("holds a direction from both the D-pad and the stick", () => {
        plugIn()
        pads = [pad(0, [UP], 0, -1)]
        tick()
        pads = [pad(0, [], 0, -1)]
        expect(tick().down).toEqual(["up"])
        pads = [pad(0)]
        expect(tick().down).toEqual([])
    })

    it("holds an action independently of the keyboard", () => {
        plugIn()
        const keys = new EventTarget()
        new KeyboardSource(undefined, keys).attach(input)
        keys.dispatchEvent(
            Object.assign(new Event("keydown"), { code: "ArrowUp" })
        )
        pads = [pad(0, [UP])]
        // Already held by the key, so the pad adds no second press.
        expect(tick().pressed).toEqual(["up"])
        expect(tick().pressed).toEqual([])
        keys.dispatchEvent(
            Object.assign(new Event("keyup"), { code: "ArrowUp" })
        )
        expect(tick().down).toEqual(["up"])
        pads = [pad(0)]
        expect(tick().down).toEqual([])
    })

    it("releases a pad's hold without touching the keyboard's", () => {
        plugIn()
        const keys = new EventTarget()
        new KeyboardSource(undefined, keys).attach(input)
        pads = [pad(0, [A])]
        tick()
        keys.dispatchEvent(
            Object.assign(new Event("keydown"), { code: "Space" })
        )
        pads = [pad(0)]
        expect(tick().down).toEqual(["confirm"])
    })

    describe("shared assignment (the default)", () => {
        it("lets every pad drive player 1", () => {
            plugIn(2)
            pads = [pad(0, [UP]), pad(1, [LEFT])]
            expect(tick()).toEqual({
                pressed: ["up", "left"],
                down: ["up", "left"],
            })
            expect(p2().isDown("up")).toBe(false)
            expect(p2().isDown("left")).toBe(false)
        })

        it("keeps player 1 held until both pads let go", () => {
            plugIn(2)
            pads = [pad(0, [A]), pad(1, [A])]
            tick()
            pads = [pad(0), pad(1, [A])]
            expect(tick().down).toEqual(["breath", "confirm"])
        })
    })

    describe("perPad assignment", () => {
        beforeEach(() => source.setAssignment("perPad"))

        it("gives the first pad player 1 and the second player 2", () => {
            plugIn(2)
            pads = [pad(0, [UP]), pad(1, [LEFT])]
            source.poll()
            expect(p1().isDown("up")).toBe(true)
            expect(p1().isDown("left")).toBe(false)
            expect(p2().isDown("left")).toBe(true)
            expect(p2().isDown("up")).toBe(false)
        })

        it("follows connection order, not the pad index", () => {
            target.dispatchEvent(connectEvent("gamepadconnected", 3))
            target.dispatchEvent(connectEvent("gamepadconnected", 1))
            pads = [null, pad(1), null, pad(3)]
            source.poll()
            pads = [null, pad(1, [DOWN]), null, pad(3, [RIGHT])]
            source.poll()
            expect(p1().isDown("right")).toBe(true)
            expect(p2().isDown("down")).toBe(true)
        })

        it("gives a reconnecting pad the free player", () => {
            pads = [pad(0), pad(1)]
            source.poll()
            target.dispatchEvent(connectEvent("gamepaddisconnected", 0))
            pads = [null, pad(1)]
            source.poll()
            target.dispatchEvent(connectEvent("gamepadconnected", 2))
            pads = [null, pad(1), pad(2)]
            source.poll()
            pads = [null, pad(1), pad(2, [A])]
            source.poll()
            expect(p1().isDown("breath")).toBe(true)
        })

        it("ignores a pad beyond the players", () => {
            input = new InputState(2)
            source.attach(input)
            pads = [pad(0), pad(1), pad(2, [A])]
            source.poll()
            expect(input.players.some((p) => p.isDown("breath"))).toBe(false)
        })
    })

    it("hands held buttons over only after they're released", () => {
        plugIn(2)
        pads = [pad(0), pad(1, [A])]
        tick()
        expect(p1().isDown("confirm")).toBe(true)
        source.setAssignment("perPad")
        // Released from player 1 at once; not pressed for player 2.
        expect(p1().isDown("confirm")).toBe(false)
        expect(tick(p2)).toEqual({ pressed: [], down: [] })
        pads = [pad(0), pad(1)]
        tick(p2)
        pads = [pad(0), pad(1, [A])]
        expect(tick(p2).pressed).toEqual(["breath", "confirm"])
    })

    // Regression: a pad with no player in perPad holds nothing for anyone,
    // so its A, held through the switch to shared, pressed confirm.
    it("doesn't press a button a pad without a player held through a switch", () => {
        input = new InputState(1)
        source.attach(input)
        source.setAssignment("perPad")
        plugIn(2)
        pads = [pad(0), pad(1, [A])]
        tick()
        source.setAssignment("shared")
        expect(tick()).toEqual({ pressed: [], down: [] })
        pads = [pad(0), pad(1)]
        tick()
        pads = [pad(0), pad(1, [A])]
        expect(tick().pressed).toEqual(["breath", "confirm"])
    })

    describe("connect and disconnect", () => {
        it("reports a connect event once, even when the poll sees it too", () => {
            target.dispatchEvent(connectEvent("gamepadconnected", 0))
            pads = [pad(0)]
            source.poll()
            source.poll()
            expect(changes).toEqual([{ kind: "connected", index: 0 }])
        })

        it("reports a pad first seen by polling", () => {
            pads = [null, pad(1)]
            source.poll()
            expect(changes).toEqual([{ kind: "connected", index: 1 }])
        })

        it("releases everything a pad held when it disconnects", () => {
            plugIn()
            pads = [pad(0, [A, UP], 1, 0)]
            tick()
            target.dispatchEvent(connectEvent("gamepaddisconnected", 0))
            expect(p1().isDown("breath")).toBe(false)
            expect(p1().isDown("up")).toBe(false)
            expect(p1().isDown("right")).toBe(false)
            expect(changes.at(-1)).toEqual({
                kind: "disconnected",
                index: 0,
                wasUsed: true,
            })
        })

        it("leaves other pads' holds alone", () => {
            plugIn(2)
            pads = [pad(0, [UP]), pad(1, [UP])]
            tick()
            target.dispatchEvent(connectEvent("gamepaddisconnected", 0))
            expect(p1().isDown("up")).toBe(true)
        })

        it("treats a pad gone from the list as disconnected", () => {
            plugIn()
            pads = [pad(0, [A])]
            tick()
            pads = [{ ...pad(0, [A]), connected: false }]
            source.poll()
            expect(p1().isDown("breath")).toBe(false)
            expect(changes.at(-1)).toEqual({
                kind: "disconnected",
                index: 0,
                wasUsed: true,
            })
            pads = []
            source.poll()
            expect(changes).toHaveLength(2)
        })

        // Regression: main paused play for every disconnect, even an idle
        // second pad going to sleep.
        it("says whether a pad drove a player before it disconnected", () => {
            pads = [pad(0), pad(1)]
            tick()
            pads = [pad(0, [A]), pad(1)]
            tick()
            pads = [pad(0), pad(1)]
            tick()
            target.dispatchEvent(connectEvent("gamepaddisconnected", 1))
            target.dispatchEvent(connectEvent("gamepaddisconnected", 0))
            expect(changes.slice(-2)).toEqual([
                { kind: "disconnected", index: 1, wasUsed: false },
                { kind: "disconnected", index: 0, wasUsed: true },
            ])
        })

        it("doesn't count a pad without a player as used", () => {
            input = new InputState(1)
            source.attach(input)
            source.setAssignment("perPad")
            pads = [pad(0), pad(1, [A])]
            tick()
            target.dispatchEvent(connectEvent("gamepaddisconnected", 1))
            expect(changes.at(-1)).toEqual({
                kind: "disconnected",
                index: 1,
                wasUsed: false,
            })
        })

        // Regression: a connect event for a pad the list didn't show yet was
        // reported as a disconnect on the next poll.
        it("waits for the list to show a pad announced by its event", () => {
            target.dispatchEvent(connectEvent("gamepadconnected", 0))
            pads = []
            source.poll()
            source.poll()
            expect(changes).toEqual([{ kind: "connected", index: 0 }])
            pads = [pad(0)]
            source.poll()
            pads = []
            source.poll()
            expect(changes).toEqual([
                { kind: "connected", index: 0 },
                { kind: "disconnected", index: 0, wasUsed: false },
            ])
        })

        it("ignores a disconnect for a pad it never saw", () => {
            target.dispatchEvent(connectEvent("gamepaddisconnected", 4))
            expect(changes).toEqual([])
        })

        it("stops listening and releases on detach", () => {
            pads = [pad(0, [A])]
            tick()
            source.detach()
            expect(p1().isDown("breath")).toBe(false)
            target.dispatchEvent(connectEvent("gamepadconnected", 1))
            source.poll()
            expect(p1().isDown("breath")).toBe(false)
            expect(changes).toHaveLength(1)
        })
    })
})
