import {
    bindingName,
    type BindingTarget,
    type Bindings,
    type PadAction,
} from "./bindings"
import type { Action } from "./input"

// The controls screen's rows (see the controls screen in flow.ts). Pure, no
// DOM. The screen shows one player's controls at a time: a row per key,
// then the pad buttons, then Reset to defaults and Back.

export type ControlsRow =
    | { kind: "key"; action: Action }
    | { kind: "pad"; action: PadAction }
    | { kind: "reset" }
    | { kind: "back" }

// Every row, in screen order.
export const CONTROLS_ROWS: readonly ControlsRow[] = [
    { kind: "key", action: "up" },
    { kind: "key", action: "down" },
    { kind: "key", action: "left" },
    { kind: "key", action: "right" },
    { kind: "key", action: "breath" },
    { kind: "key", action: "pause" },
    { kind: "key", action: "confirm" },
    { kind: "pad", action: "breath" },
    { kind: "pad", action: "confirm" },
    { kind: "pad", action: "pause" },
    { kind: "reset" },
    { kind: "back" },
]

const ACTION_LABELS: Readonly<Record<Action, string>> = {
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
    breath: "Breath",
    pause: "Pause",
    confirm: "Confirm",
}

export function controlsRowLabel(row: ControlsRow): string {
    switch (row.kind) {
        case "key":
            return ACTION_LABELS[row.action]
        case "pad":
            return `Pad ${ACTION_LABELS[row.action].toLowerCase()}`
        case "reset":
            return "Reset to defaults"
        case "back":
            return "Back"
    }
}

// What a row shows after its label: the key's or button's name for
// `player`; nothing for Reset and Back.
export function controlsRowValue(
    row: ControlsRow,
    bindings: Bindings,
    player: number
): string | undefined {
    const own = bindings.players[player]
    if (!own) return undefined
    switch (row.kind) {
        case "key":
            return bindingName(own.keys[row.action])
        case "pad":
            return bindingName(own.pad[row.action])
        default:
            return undefined
    }
}

// Whether a row takes `target` when capturing: a key row takes keys, a pad
// row pad buttons; anything else keeps the prompt waiting.
export function takesTarget(row: ControlsRow, target: BindingTarget): boolean {
    return row.kind === "key"
        ? typeof target === "string"
        : row.kind === "pad" && typeof target === "number"
}
