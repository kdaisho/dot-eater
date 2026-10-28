import { describe, expect, it } from "vite-plus/test"
import {
    bindingName,
    buttonName,
    captureButton,
    captureKey,
    DEFAULT_BINDINGS,
    isBindableButton,
    isBindableKey,
    keyName,
    PAD_A,
    PAD_START,
    parseBindings,
    rebind,
    type Bindings,
} from "./bindings"
import { ACTIONS } from "./input"

const X = 2
const Y = 3
const SELECT = 8

const p1 = (b: Bindings) => b.players[0]
const p2 = (b: Bindings) => b.players[1]

// Every key in use, both players.
function allKeys(b: Bindings): string[] {
    return b.players.flatMap((p) => ACTIONS.map((a) => p.keys[a]))
}

describe("DEFAULT_BINDINGS", () => {
    it("binds every action of both players to a distinct key", () => {
        const keys = allKeys(DEFAULT_BINDINGS)
        expect(keys).toHaveLength(14)
        expect(new Set(keys).size).toBe(14)
        expect(keys).not.toContain("Escape")
    })

    it("puts breath and confirm on A and pause on Start for both pads", () => {
        for (const player of DEFAULT_BINDINGS.players) {
            expect(player.pad).toEqual({
                breath: PAD_A,
                confirm: PAD_A,
                pause: PAD_START,
            })
        }
    })
})

describe("rebind keys", () => {
    it("binds a free key", () => {
        const b = rebind(DEFAULT_BINDINGS, 0, "breath", "KeyX")
        expect(p1(b).keys.breath).toBe("KeyX")
        expect(new Set(allKeys(b)).size).toBe(14)
    })

    it("never changes its input", () => {
        const before = JSON.stringify(DEFAULT_BINDINGS)
        rebind(DEFAULT_BINDINGS, 0, "up", "ArrowDown")
        rebind(DEFAULT_BINDINGS, 1, "pause", PAD_A)
        expect(JSON.stringify(DEFAULT_BINDINGS)).toBe(before)
    })

    it("swaps with another action of the same player", () => {
        const b = rebind(DEFAULT_BINDINGS, 0, "up", "ArrowDown")
        expect(p1(b).keys.up).toBe("ArrowDown")
        expect(p1(b).keys.down).toBe("ArrowUp")
        expect(p2(b)).toBe(p2(DEFAULT_BINDINGS))
    })

    it("swaps across players", () => {
        const b = rebind(DEFAULT_BINDINGS, 1, "confirm", "ArrowUp")
        expect(p2(b).keys.confirm).toBe("ArrowUp")
        expect(p1(b).keys.up).toBe("KeyE")
        expect(new Set(allKeys(b)).size).toBe(14)
    })

    it("keeps every action on exactly one key through many rebinds", () => {
        let b = DEFAULT_BINDINGS
        const codes = ["KeyW", "ArrowLeft", "Space", "KeyZ", "ShiftLeft"]
        let n = 0
        for (const player of [0, 1]) {
            for (const action of ACTIONS) {
                b = rebind(b, player, action, codes[n++ % codes.length]!)
                expect(new Set(allKeys(b)).size).toBe(14)
            }
        }
    })

    it("returns the same bindings when nothing changes", () => {
        expect(rebind(DEFAULT_BINDINGS, 0, "up", "ArrowUp")).toBe(
            DEFAULT_BINDINGS
        )
    })

    it.each(["Escape", "ControlLeft", "AltRight", "MetaLeft", "CapsLock", ""])(
        "rejects %j",
        (code) => {
            expect(rebind(DEFAULT_BINDINGS, 0, "pause", code)).toBe(
                DEFAULT_BINDINGS
            )
        }
    )

    it("rejects a player that doesn't exist", () => {
        expect(rebind(DEFAULT_BINDINGS, 2, "up", "KeyZ")).toBe(DEFAULT_BINDINGS)
        expect(rebind(DEFAULT_BINDINGS, -1, "up", "KeyZ")).toBe(
            DEFAULT_BINDINGS
        )
    })
})

describe("rebind pad buttons", () => {
    const pad = (b: Bindings, player = 0) => b.players[player]!.pad

    it("splits breath off the shared A, leaving confirm on it", () => {
        const b = rebind(DEFAULT_BINDINGS, 0, "breath", X)
        expect(pad(b)).toEqual({ breath: X, confirm: PAD_A, pause: PAD_START })
    })

    it("lets breath and confirm share a button again", () => {
        let b = rebind(DEFAULT_BINDINGS, 0, "breath", X)
        b = rebind(b, 0, "confirm", X)
        expect(pad(b)).toEqual({ breath: X, confirm: X, pause: PAD_START })
    })

    it("swaps A and Start whole when confirm moves onto pause's button", () => {
        const b = rebind(DEFAULT_BINDINGS, 0, "confirm", PAD_START)
        expect(pad(b)).toEqual({
            breath: PAD_START,
            confirm: PAD_START,
            pause: PAD_A,
        })
    })

    it("swaps A and Start whole when pause moves onto the shared A", () => {
        const b = rebind(DEFAULT_BINDINGS, 0, "pause", PAD_A)
        expect(pad(b)).toEqual({
            breath: PAD_START,
            confirm: PAD_START,
            pause: PAD_A,
        })
    })

    it("swaps only the clashing action when breath and confirm are apart", () => {
        let b = rebind(DEFAULT_BINDINGS, 0, "breath", X)
        b = rebind(b, 0, "pause", PAD_A)
        expect(pad(b)).toEqual({ breath: X, confirm: PAD_START, pause: PAD_A })
        b = rebind(b, 0, "breath", PAD_A)
        expect(pad(b)).toEqual({ breath: PAD_A, confirm: PAD_START, pause: X })
    })

    it("never leaves pause sharing a button", () => {
        let b = DEFAULT_BINDINGS
        const moves: [string, number][] = [
            ["confirm", PAD_START],
            ["breath", X],
            ["pause", X],
            ["confirm", Y],
            ["pause", Y],
            ["breath", PAD_A],
            ["pause", PAD_A],
        ]
        for (const [action, button] of moves) {
            b = rebind(b, 0, action as "breath", button)
            const { breath, confirm, pause } = pad(b)
            expect(pause).not.toBe(breath)
            expect(pause).not.toBe(confirm)
        }
    })

    it("only changes the player it binds for", () => {
        const b = rebind(DEFAULT_BINDINGS, 1, "pause", SELECT)
        expect(pad(b, 1).pause).toBe(SELECT)
        expect(p1(b)).toBe(p1(DEFAULT_BINDINGS))
    })

    it("rejects the D-pad, out-of-range buttons and non-pad actions", () => {
        for (const button of [12, 13, 14, 15, -1, 17, 1.5, NaN]) {
            expect(rebind(DEFAULT_BINDINGS, 0, "breath", button)).toBe(
                DEFAULT_BINDINGS
            )
        }
        expect(rebind(DEFAULT_BINDINGS, 0, "up", X)).toBe(DEFAULT_BINDINGS)
    })
})

describe("parseBindings", () => {
    const stored = rebind(
        rebind(DEFAULT_BINDINGS, 0, "breath", "KeyX"),
        1,
        "pause",
        SELECT
    )

    it("round-trips bindings through JSON", () => {
        expect(parseBindings(JSON.parse(JSON.stringify(stored)))).toEqual(
            stored
        )
    })

    it.each([undefined, null, 42, "x", [], {}, { players: "no" }])(
        "gives the defaults for %j",
        (value) => {
            expect(parseBindings(value)).toEqual(DEFAULT_BINDINGS)
        }
    )

    it("falls back per entry for missing or invalid values", () => {
        const value = JSON.parse(JSON.stringify(stored))
        delete value.players[0].keys.up
        value.players[0].keys.down = 7
        value.players[1].pad.breath = "A"
        value.players[1].pad.confirm = 13 // D-pad
        const b = parseBindings(value)
        expect(p1(b).keys.up).toBe("ArrowUp")
        expect(p1(b).keys.down).toBe("ArrowDown")
        expect(p1(b).keys.breath).toBe("KeyX")
        expect(p2(b).pad).toEqual({
            breath: PAD_A,
            confirm: PAD_A,
            pause: SELECT,
        })
    })

    it("falls back for a missing player", () => {
        const b = parseBindings({ players: [stored.players[0]] })
        expect(p1(b)).toEqual(p1(stored))
        expect(p2(b)).toEqual(p2(DEFAULT_BINDINGS))
    })

    it("rejects Escape and modifiers as stored keys", () => {
        const value = JSON.parse(JSON.stringify(DEFAULT_BINDINGS))
        value.players[0].keys.pause = "Escape"
        value.players[1].keys.breath = "ControlLeft"
        expect(parseBindings(value)).toEqual(DEFAULT_BINDINGS)
    })

    it("resets every key when two actions share one", () => {
        const value = JSON.parse(JSON.stringify(stored))
        value.players[1].keys.up = "ArrowUp"
        const b = parseBindings(value)
        expect(p1(b).keys).toEqual(p1(DEFAULT_BINDINGS).keys)
        expect(p2(b).keys).toEqual(p2(DEFAULT_BINDINGS).keys)
        // Pads were fine, so they're kept.
        expect(p2(b).pad.pause).toBe(SELECT)
    })

    it("resets every key when a fallback collides with a stored key", () => {
        // P2 up missing falls back to KeyW, which P1's up already uses.
        const value = JSON.parse(JSON.stringify(DEFAULT_BINDINGS))
        value.players[0].keys.up = "KeyW"
        delete value.players[1].keys.up
        expect(parseBindings(value)).toEqual(DEFAULT_BINDINGS)
    })

    it("resets a player's pad when pause shares a button", () => {
        const value = JSON.parse(JSON.stringify(stored))
        value.players[1].pad.pause = PAD_A
        const b = parseBindings(value)
        expect(p2(b).pad).toEqual(p2(DEFAULT_BINDINGS).pad)
        expect(p1(b).pad).toEqual(p1(DEFAULT_BINDINGS).pad)
    })

    it("drops unknown fields and ignores inherited ones", () => {
        const value = JSON.parse(JSON.stringify(stored))
        value.players[0].keys.jump = "KeyJ"
        value.extra = true
        const b = parseBindings(value)
        expect(b).toEqual(stored)
        expect(
            parseBindings(Object.create({ players: stored.players }))
        ).toEqual(DEFAULT_BINDINGS)
    })
})

describe("isBindableKey and isBindableButton", () => {
    it("allows Shift keys but not Escape or other modifiers", () => {
        expect(isBindableKey("ShiftLeft")).toBe(true)
        expect(isBindableKey("KeyQ")).toBe(true)
        expect(isBindableKey("Escape")).toBe(false)
        expect(isBindableKey("MetaRight")).toBe(false)
        expect(isBindableKey(3)).toBe(false)
    })

    it("allows face, shoulder and menu buttons but not the D-pad", () => {
        for (const b of [0, 1, 4, 7, 8, 9, 10, 16]) {
            expect(isBindableButton(b)).toBe(true)
        }
        for (const b of [12, 15, 17, -1, "0"]) {
            expect(isBindableButton(b)).toBe(false)
        }
    })
})

describe("captureKey", () => {
    it("takes a plain keydown's code", () => {
        expect(captureKey({ code: "KeyZ" })).toBe("KeyZ")
        expect(captureKey({ code: "ShiftRight" })).toBe("ShiftRight")
    })

    it("ignores repeats, shortcuts, Escape and unbindable keys", () => {
        expect(captureKey({ code: "KeyZ", repeat: true })).toBeUndefined()
        expect(captureKey({ code: "KeyZ", ctrlKey: true })).toBeUndefined()
        expect(captureKey({ code: "KeyZ", altKey: true })).toBeUndefined()
        expect(captureKey({ code: "KeyZ", metaKey: true })).toBeUndefined()
        expect(captureKey({ code: "Escape" })).toBeUndefined()
        expect(captureKey({ code: "ControlLeft" })).toBeUndefined()
        expect(captureKey({ code: "" })).toBeUndefined()
    })
})

describe("captureButton", () => {
    it("takes the first newly pressed bindable button", () => {
        expect(captureButton([], [X])).toBe(X)
        expect(captureButton([PAD_A], [PAD_A, Y, X])).toBe(Y)
    })

    it("ignores held buttons and the D-pad", () => {
        expect(captureButton([X], [X])).toBeUndefined()
        expect(captureButton([], [12, 13])).toBeUndefined()
        expect(captureButton([], [14, PAD_START])).toBe(PAD_START)
        expect(captureButton([], [])).toBeUndefined()
    })
})

describe("display names", () => {
    it.each([
        ["ShiftRight", "Right Shift"],
        ["ShiftLeft", "Left Shift"],
        ["KeyP", "P"],
        ["Digit1", "1"],
        ["Numpad4", "Num 4"],
        ["ArrowUp", "↑"],
        ["Space", "Space"],
        ["Slash", "/"],
        ["Escape", "Esc"],
        ["F5", "F5"],
    ])("names key %s %j", (code, name) => {
        expect(keyName(code)).toBe(name)
    })

    it("names pad buttons", () => {
        expect(buttonName(PAD_A)).toBe("A")
        expect(buttonName(1)).toBe("B")
        expect(buttonName(PAD_START)).toBe("Start")
        expect(buttonName(SELECT)).toBe("Back")
        expect(buttonName(20)).toBe("Button 20")
    })

    it("names either kind of target", () => {
        expect(bindingName("KeyE")).toBe("E")
        expect(bindingName(X)).toBe("X")
    })

    it("names every default binding readably", () => {
        const names = DEFAULT_BINDINGS.players.flatMap((p) =>
            ACTIONS.map((a) => keyName(p.keys[a]))
        )
        expect(names).toEqual([
            "↑",
            "↓",
            "←",
            "→",
            "Right Shift",
            "P",
            "Space",
            "W",
            "S",
            "A",
            "D",
            "Left Shift",
            "Q",
            "E",
        ])
    })
})
