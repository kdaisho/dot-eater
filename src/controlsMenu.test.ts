import { describe, expect, it } from "vite-plus/test"
import { DEFAULT_BINDINGS, rebind } from "./bindings"
import {
    CONTROLS_ROWS,
    controlsRowLabel,
    controlsRowValue,
} from "./controlsMenu"

describe("CONTROLS_ROWS", () => {
    it("lists the keys, the pad buttons, then Reset and Back", () => {
        expect(CONTROLS_ROWS.map(controlsRowLabel)).toEqual([
            "Up",
            "Down",
            "Left",
            "Right",
            "Breath",
            "Pause",
            "Confirm",
            "Pad breath",
            "Pad confirm",
            "Pad pause",
            "Reset to defaults",
            "Back",
        ])
    })
})

describe("controlsRowValue", () => {
    const values = (bindings = DEFAULT_BINDINGS, player = 0) =>
        CONTROLS_ROWS.map((row) => controlsRowValue(row, bindings, player))

    it("names player 1's default keys and buttons", () => {
        expect(values()).toEqual([
            "↑",
            "↓",
            "←",
            "→",
            "Left Shift (Right Shift in 2P games)",
            "P",
            "Space",
            "A",
            "A",
            "Start",
            undefined,
            undefined,
        ])
    })

    it("names player 2's, as bound", () => {
        const bindings = rebind(DEFAULT_BINDINGS, 1, "pause", 8)
        expect(values(bindings, 1)).toEqual([
            "W",
            "S",
            "A",
            "D",
            "Left Shift",
            "Q",
            "E",
            "A",
            "A",
            "Back",
            undefined,
            undefined,
        ])
    })

    // KDA-322: a 1-player game moves the default breath (see
    // effectiveBindings); a rebound one is the same in both.
    it("names one breath key once 1P rebinds it", () => {
        const breath = (bindings: typeof DEFAULT_BINDINGS) =>
            controlsRowValue({ kind: "key", action: "breath" }, bindings, 0)
        expect(breath(rebind(DEFAULT_BINDINGS, 0, "breath", "KeyK"))).toBe("K")
        expect(breath(rebind(DEFAULT_BINDINGS, 0, "breath", "ShiftLeft"))).toBe(
            "Left Shift"
        )
    })

    it("shows nothing for a player that doesn't exist", () => {
        expect(values(DEFAULT_BINDINGS, 2).every((v) => v === undefined)).toBe(
            true
        )
    })
})
