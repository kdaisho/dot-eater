import { describe, expect, it } from "vite-plus/test"
import { DEFAULT_BINDINGS, rebind } from "./bindings"
import {
    CONTROLS_ROWS,
    controlsRowLabel,
    controlsRowValue,
    takesTarget,
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
            "Right Shift",
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

    it("shows nothing for a player that doesn't exist", () => {
        expect(values(DEFAULT_BINDINGS, 2).every((v) => v === undefined)).toBe(
            true
        )
    })
})

describe("takesTarget", () => {
    it("takes keys on key rows and buttons on pad rows only", () => {
        const [key] = CONTROLS_ROWS
        const pad = CONTROLS_ROWS.find((r) => r.kind === "pad")!
        const reset = CONTROLS_ROWS.find((r) => r.kind === "reset")!
        expect(takesTarget(key!, "KeyX")).toBe(true)
        expect(takesTarget(key!, 2)).toBe(false)
        expect(takesTarget(pad, 2)).toBe(true)
        expect(takesTarget(pad, "KeyX")).toBe(false)
        expect(takesTarget(reset, "KeyX")).toBe(false)
        expect(takesTarget(reset, 2)).toBe(false)
    })
})
