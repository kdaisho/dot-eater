// Control bindings: which key and pad button each player's actions are on
// (KDA-215). Pure data and rules, no DOM; KeyboardSource and GamepadSource
// read a Bindings value, and the Settings screen edits one with rebind.
//
// Rules (product decisions):
// - Each player binds one key (a KeyboardEvent.code) to each action, and a
//   pad button to breath, confirm and pause. The pad's D-pad and left stick
//   always move and can't be rebound.
// - Escape always pauses (player 1) and goes back. It can't be bound, so
//   nobody can lock themselves out of the pause menu.
// - Binding a key or button already in use swaps the two bindings, across
//   players too for keys, so every action always has exactly one key.
// - Pad buttons: breath and confirm may share a button (A does both by
//   default: breath in play, confirm in menus, never both at once). Pause
//   never shares. Pads are per player (pad 1 drives P1, pad 2 drives P2),
//   so pad bindings only swap within a player. See rebind.

import type { Action } from "./input"

// The actions a pad button can be bound to.
export type PadAction = "breath" | "confirm" | "pause"

export const PAD_ACTIONS: readonly PadAction[] = ["breath", "confirm", "pause"]

export type PlayerBindings = {
    // KeyboardEvent.code per action.
    readonly keys: Readonly<Record<Action, string>>
    // Standard-mapping button index per pad action.
    readonly pad: Readonly<Record<PadAction, number>>
}

// Player 1 first, then player 2. A plain JSON-able value, so settings can
// store it as is.
export type Bindings = {
    readonly players: readonly [PlayerBindings, PlayerBindings]
}

// A key or pad button to bind: a KeyboardEvent.code string, or a pad button
// index.
export type BindingTarget = string | number

// The key that always pauses player 1 and goes back. Never bindable.
export const FIXED_PAUSE_KEY = "Escape"

// Standard-mapping buttons.
export const PAD_A = 0
export const PAD_START = 9
// The D-pad (up, down, left, right): fixed to the directions.
export const PAD_DPAD: readonly number[] = [12, 13, 14, 15]
// Buttons of the standard mapping (0 A up to 16 Home).
const PAD_BUTTON_COUNT = 17

// Today's controls (also "Reset to defaults").
export const DEFAULT_BINDINGS: Bindings = {
    players: [
        {
            keys: {
                up: "ArrowUp",
                down: "ArrowDown",
                left: "ArrowLeft",
                right: "ArrowRight",
                breath: "ShiftRight",
                pause: "KeyP",
                confirm: "Space",
            },
            pad: { breath: PAD_A, confirm: PAD_A, pause: PAD_START },
        },
        {
            keys: {
                up: "KeyW",
                down: "KeyS",
                left: "KeyA",
                right: "KeyD",
                breath: "ShiftLeft",
                pause: "KeyQ",
                confirm: "KeyE",
            },
            pad: { breath: PAD_A, confirm: PAD_A, pause: PAD_START },
        },
    ],
}

// Action order, read off the defaults so this module needs no runtime
// import from input.ts (which imports DEFAULT_BINDINGS from here).
const KEY_ACTIONS = Object.keys(DEFAULT_BINDINGS.players[0].keys) as Action[]

// Keys that can't be bound. Escape is fixed. Control, Alt and Meta can't
// work: the keyboard source ignores keydowns with them held, to leave
// browser shortcuts alone. CapsLock and Fn send unreliable key events (no
// keyup on macOS until it toggles off; often none at all).
const UNBINDABLE_KEYS: ReadonlySet<string> = new Set([
    FIXED_PAUSE_KEY,
    "",
    "Unidentified",
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight",
    "OSLeft",
    "OSRight",
    "CapsLock",
    "Fn",
    "FnLock",
])

export function isBindableKey(code: unknown): code is string {
    return typeof code === "string" && !UNBINDABLE_KEYS.has(code)
}

export function isBindableButton(button: unknown): button is number {
    return (
        typeof button === "number" &&
        Number.isInteger(button) &&
        button >= 0 &&
        button < PAD_BUTTON_COUNT &&
        !PAD_DPAD.includes(button)
    )
}

export function isPadAction(action: Action): action is PadAction {
    return (PAD_ACTIONS as readonly Action[]).includes(action)
}

// Whether two pad actions may share a button: only breath and confirm.
function canShare(a: PadAction, b: PadAction): boolean {
    return a !== "pause" && b !== "pause"
}

// Bind `target` to `player`'s `action`: a string binds a key, a number a pad
// button. Returns new bindings; the input is never changed. Returns the
// input itself when nothing changes: an unbindable target (Escape, a
// modifier, a D-pad button), a pad button for an action pads don't bind, a
// player that doesn't exist, or the binding it already has.
//
// Keys: whatever action (of either player) holds the key takes this
// action's old key, a swap.
//
// Pad buttons, within the player: a button shared by breath and confirm
// stays shared when one of them moves to a free button or to its partner's.
// Moving onto pause's button (or pause onto theirs) swaps the two buttons
// whole: what was on the target button takes the old one, and a partner
// left behind on the old button comes along to the target. For example,
// with A on breath and confirm and Start on pause, binding confirm to Start
// gives Start to breath and confirm and A to pause, never pause sharing a
// button with breath.
export function rebind(
    bindings: Bindings,
    player: number,
    action: Action,
    target: BindingTarget
): Bindings {
    const self = bindings.players[player]
    if (!self || (player !== 0 && player !== 1)) return bindings
    if (typeof target === "string") {
        return rebindKey(bindings, player, action, target)
    }
    if (!isPadAction(action) || !isBindableButton(target)) return bindings
    const pad = rebindPad(self.pad, action, target)
    if (pad === self.pad) return bindings
    return withPlayer(bindings, player, { ...self, pad })
}

function rebindKey(
    bindings: Bindings,
    player: 0 | 1,
    action: Action,
    code: string
): Bindings {
    if (!isBindableKey(code)) return bindings
    const old = bindings.players[player].keys[action]
    if (old === code) return bindings
    let next = bindings
    // Swap: the other holder of `code` (if any) takes the old key.
    bindings.players.forEach((other, i) => {
        for (const a of KEY_ACTIONS) {
            if (other.keys[a] === code) {
                next = withKey(next, i as 0 | 1, a, old)
            }
        }
    })
    return withKey(next, player, action, code)
}

function rebindPad(
    pad: Readonly<Record<PadAction, number>>,
    action: PadAction,
    button: number
): Readonly<Record<PadAction, number>> {
    const old = pad[action]
    if (old === button) return pad
    const onTarget = PAD_ACTIONS.filter(
        (a) => a !== action && pad[a] === button
    )
    const clash = onTarget.some((a) => !canShare(a, action))
    const next = { ...pad, [action]: button }
    if (!clash) return next
    // Swap the two buttons whole.
    for (const a of PAD_ACTIONS) {
        if (a === action) continue
        if (pad[a] === button) next[a] = old
        else if (pad[a] === old) next[a] = button
    }
    return next
}

function withPlayer(
    bindings: Bindings,
    player: 0 | 1,
    value: PlayerBindings
): Bindings {
    const players = [...bindings.players] as [PlayerBindings, PlayerBindings]
    players[player] = value
    return { players }
}

function withKey(
    bindings: Bindings,
    player: 0 | 1,
    action: Action,
    code: string
): Bindings {
    const self = bindings.players[player]
    return withPlayer(bindings, player, {
        ...self,
        keys: { ...self.keys, [action]: code },
    })
}

// Read bindings from untrusted data (settings storage): never throws, and
// always returns valid bindings.
//
// Each entry falls back on its own: a missing or invalid key or button (not
// a string or number, or an unbindable one) takes its default, so a save
// from an older version with fewer actions keeps the rest. Then the whole
// is checked: when two actions end up on one key (stored duplicates, or a
// fallback default that a stored key already uses), every key falls back to
// the defaults; when a player's pause shares a pad button, that player's
// pad buttons fall back. Unknown extra fields are dropped.
export function parseBindings(value: unknown): Bindings {
    const stored = field(value, "players")
    const players = DEFAULT_BINDINGS.players.map((defaults, i) => {
        const entry = Array.isArray(stored) ? stored[i] : undefined
        return parsePlayer(entry, defaults)
    }) as [PlayerBindings, PlayerBindings]
    const codes = players.flatMap((p) => KEY_ACTIONS.map((a) => p.keys[a]))
    const keysOk = new Set(codes).size === codes.length
    return {
        players: players.map((p, i) => {
            const defaults = DEFAULT_BINDINGS.players[i as 0 | 1]
            return {
                keys: keysOk ? p.keys : defaults.keys,
                pad: padOk(p.pad) ? p.pad : defaults.pad,
            }
        }) as [PlayerBindings, PlayerBindings],
    }
}

function parsePlayer(value: unknown, defaults: PlayerBindings): PlayerBindings {
    const keys = field(value, "keys")
    const pad = field(value, "pad")
    const parsedKeys = {} as Record<Action, string>
    for (const action of KEY_ACTIONS) {
        const code = field(keys, action)
        parsedKeys[action] = isBindableKey(code) ? code : defaults.keys[action]
    }
    const parsedPad = {} as Record<PadAction, number>
    for (const action of PAD_ACTIONS) {
        const button = field(pad, action)
        parsedPad[action] = isBindableButton(button)
            ? button
            : defaults.pad[action]
    }
    return { keys: parsedKeys, pad: parsedPad }
}

function padOk(pad: Readonly<Record<PadAction, number>>): boolean {
    return pad.pause !== pad.breath && pad.pause !== pad.confirm
}

// An own field of an object, or undefined for anything else (including
// arrays' and prototypes' fields).
function field(value: unknown, name: string): unknown {
    if (typeof value !== "object" || value === null) return undefined
    return Object.hasOwn(value, name)
        ? (value as Record<string, unknown>)[name]
        : undefined
}

// The binding target a remap prompt takes from a keydown, or undefined to
// keep waiting: auto-repeat, a key pressed with Ctrl, Alt or Meta held (a
// browser shortcut), Escape (which cancels the prompt instead) and the
// other unbindable keys. Shift alone is fine (Shift keys are bindable).
export function captureKey(event: {
    readonly code: string
    readonly repeat?: boolean
    readonly ctrlKey?: boolean
    readonly altKey?: boolean
    readonly metaKey?: boolean
}): string | undefined {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
        return undefined
    }
    return isBindableKey(event.code) ? event.code : undefined
}

// The binding target a remap prompt takes from pad buttons: the first
// button pressed now that wasn't before (indexes, as from pressedButtons in
// gamepad.ts) and can be bound. The D-pad and the stick are ignored, so a
// player can still move the menu cursor. Undefined to keep waiting.
export function captureButton(
    before: readonly number[],
    now: readonly number[]
): number | undefined {
    return now.find((b) => !before.includes(b) && isBindableButton(b))
}

// Display names for keys whose code isn't self-explanatory.
const KEY_NAMES: Readonly<Record<string, string>> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    Space: "Space",
    Enter: "Enter",
    NumpadEnter: "Num Enter",
    Backspace: "Backspace",
    Tab: "Tab",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    IntlBackslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    PageUp: "Page Up",
    PageDown: "Page Down",
    NumpadAdd: "Num +",
    NumpadSubtract: "Num -",
    NumpadMultiply: "Num *",
    NumpadDivide: "Num /",
    NumpadDecimal: "Num .",
    Escape: "Esc",
}

// A key's display name: "KeyP" → "P", "Digit1" → "1", "Numpad4" → "Num 4",
// "ShiftRight" → "Right Shift", "ArrowUp" → "↑". Other codes ("F5",
// "Home", "Insert") are shown as they are.
export function keyName(code: string): string {
    if (Object.hasOwn(KEY_NAMES, code)) return KEY_NAMES[code]!
    const match = /^(Key|Digit|Numpad)(.+)$/.exec(code)
    if (match) return match[1] === "Numpad" ? `Num ${match[2]}` : match[2]!
    return code
}

// Standard-mapping button names, Xbox style.
const BUTTON_NAMES: readonly string[] = [
    "A",
    "B",
    "X",
    "Y",
    "LB",
    "RB",
    "LT",
    "RT",
    "Back",
    "Start",
    "L3",
    "R3",
    "D-pad ↑",
    "D-pad ↓",
    "D-pad ←",
    "D-pad →",
    "Home",
]

// A pad button's display name: 0 → "A", 9 → "Start".
export function buttonName(button: number): string {
    return BUTTON_NAMES[button] ?? `Button ${button}`
}

// A binding target's display name (a key or a pad button).
export function bindingName(target: BindingTarget): string {
    return typeof target === "string" ? keyName(target) : buttonName(target)
}
