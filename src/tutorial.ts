import {
    buttonName,
    effectiveBindings,
    FIXED_PAUSE_KEY,
    keyName,
    PAD_B,
    type Bindings,
} from "./bindings"
import type { Action } from "./input"

// The tutorial (KDA-319): the pages the main menu's Tutorial entry steps
// through, what each says, and the little scenes they play, in the "Pixel
// kit" look the user picked. Pure: the words come from the bindings, and
// every scene is a function of the time, so the view (tutorialView.ts)
// only draws what these say. main moves the time on with its ticks.

export type TutorialPage =
    | "goal"
    | "keyboard"
    | "controller"
    | "breath"
    | "health"
    | "touch"

// The pages in order. Touch devices (isTouchDevice in touch.ts, as for the
// touch controls) get the Touch page last.
const PAGES: readonly TutorialPage[] = [
    "goal",
    "keyboard",
    "controller",
    "breath",
    "health",
]

export function tutorialPages(touch: boolean): readonly TutorialPage[] {
    return touch ? [...PAGES, "touch"] : PAGES
}

export const TUTORIAL_TITLES: Readonly<Record<TutorialPage, string>> = {
    goal: "How to play",
    keyboard: "Keyboard",
    controller: "Controller",
    breath: "Breath",
    health: "Health",
    touch: "Touch",
}

export const GOAL_LINES: readonly string[] = [
    "Eat every dot in the maze to clear the stage.",
    "Enemies roam the corridors. Keep away from them, or blast them with your breath.",
    "On a boss stage, defeat the boss to clear it. Dots there are your energy, and they grow back.",
]

export const HEALTH_LINES: readonly string[] = [
    "Your health bar shows how much you have left.",
    "An enemy's touch takes some health and knocks you back. You blink for a moment, and nothing can hurt you while you do.",
    "Run out of health and the stage is lost. In a 2-player game you're out, and the stage is lost once both players are.",
    "In a 2-player game your breath never hurts your partner. It makes them panic for 1.5 s instead.",
]

// ---- Keys ----

// A player's keys as the Keyboard page names them.
export type KeyLegend = {
    move: readonly string[]
    breath: string
    pause: string
    confirm: string
}

export function keyLegend(bindings: Bindings, player: number): KeyLegend {
    const keys = bindings.players[player]!.keys
    return {
        move: [keys.up, keys.down, keys.left, keys.right].map(keyName),
        breath: keyName(keys.breath),
        pause: keyName(keys.pause),
        confirm: keyName(keys.confirm),
    }
}

// The name of the key 1P breathes with in a 1-player game when it isn't
// 1P's as bound (KDA-322: a 1-player game moves 1P's default Right Shift
// to Left Shift; see effectiveBindings), for the line "1 Player: breathe
// with Left Shift"; undefined when it is.
export function soloBreathKey(bindings: Bindings): string | undefined {
    const bound = bindings.players[0].keys.breath
    const solo = soloKeys(bindings).breath
    return solo === bound ? undefined : keyName(solo)
}

// Player 1's keys in a 1-player game: what the Breath page shows.
export function soloKeys(bindings: Bindings) {
    return effectiveBindings(bindings, 1).players[0].keys
}

// The pages' hint (keyboards): 1P's left and right turn pages, confirm
// (a key or pad A as bound) goes on, and Esc or B go back.
export function navHint(bindings: Bindings, last: boolean): string {
    const { keys, pad } = bindings.players[0]
    const next = last ? "done" : "next"
    return `${keyName(keys.left)} ${keyName(keys.right)} to turn pages, ${keyName(keys.confirm)} or ${buttonName(pad.confirm)} for ${next}, Esc or B to go back`
}

// One key on the drawn keyboard: its code, its label, and where it is, in
// key widths from the top left.
export type KeyCap = {
    code: string
    label: string
    x: number
    y: number
    w: number
}

// The drawn keyboard: a US layout's main block and the arrows, 18.5 keys
// by 6.25.
export const KEYBOARD_WIDTH = 18.5
export const KEYBOARD_HEIGHT = 6.25

export const KEY_CAPS: readonly KeyCap[] = (() => {
    const letters = (s: string) =>
        s.split("").map((c): [string, string] => [`Key${c}`, c])
    const rows: (readonly [string, string, number?])[][] = [
        [
            ["Backquote", "`"],
            ..."1234567890"
                .split("")
                .map((d): [string, string] => [`Digit${d}`, d]),
            ["Minus", "-"],
            ["Equal", "="],
            ["Backspace", "⌫", 2],
        ],
        [
            ["Tab", "Tab", 1.5],
            ...letters("QWERTYUIOP"),
            ["BracketLeft", "["],
            ["BracketRight", "]"],
            ["Backslash", "\\", 1.5],
        ],
        [
            ["CapsLock", "Caps", 1.75],
            ...letters("ASDFGHJKL"),
            ["Semicolon", ";"],
            ["Quote", "'"],
            ["Enter", "Enter", 2.25],
        ],
        [
            ["ShiftLeft", "Shift", 2.25],
            ...letters("ZXCVBNM"),
            ["Comma", ","],
            ["Period", "."],
            ["Slash", "/"],
            ["ShiftRight", "Shift", 2.75],
        ],
        [
            ["ControlLeft", "Ctrl", 1.25],
            ["AltLeft", "Alt", 1.25],
            ["MetaLeft", "⌘", 1.25],
            ["Space", "Space", 6.25],
            ["MetaRight", "⌘", 1.25],
            ["AltRight", "Alt", 1.25],
        ],
    ]
    const caps: KeyCap[] = [
        { code: "Escape", label: "Esc", x: 0, y: 0, w: 1.25 },
    ]
    rows.forEach((row, i) => {
        let x = 0
        for (const [code, label, w = 1] of row) {
            caps.push({ code, label, x, y: i + 1.25, w })
            x += w
        }
    })
    caps.push(
        { code: "ArrowUp", label: "↑", x: 16.5, y: 4.25, w: 1 },
        { code: "ArrowLeft", label: "←", x: 15.5, y: 5.25, w: 1 },
        { code: "ArrowDown", label: "↓", x: 16.5, y: 5.25, w: 1 },
        { code: "ArrowRight", label: "→", x: 17.5, y: 5.25, w: 1 }
    )
    return caps
})()

// Who a key belongs to: a player (0 or 1) and its action, or Escape.
export type KeyOwner = { player: number; action: Action } | { esc: true }

// Every bound key's owner, both players' and Escape's, by code.
export function keyOwners(bindings: Bindings): ReadonlyMap<string, KeyOwner> {
    const owners = new Map<string, KeyOwner>([[FIXED_PAUSE_KEY, { esc: true }]])
    bindings.players.forEach(({ keys }, player) => {
        for (const [action, code] of Object.entries(keys)) {
            owners.set(code, { player, action: action as Action })
        }
    })
    return owners
}

// The bound keys the drawn keyboard hasn't got (Home, F5, the numpad), in
// player order: listed under it.
export function offLayoutKeys(
    bindings: Bindings
): readonly { code: string; name: string; player: number }[] {
    const drawn = new Set(KEY_CAPS.map((c) => c.code))
    const off: { code: string; name: string; player: number }[] = []
    for (const [code, owner] of keyOwners(bindings)) {
        if (drawn.has(code) || "esc" in owner) continue
        off.push({ code, name: keyName(code), player: owner.player })
    }
    return off
}

// ---- Pads ----

// A row of the Controller page's legend: the buttons, and what they do.
// B is `back`, fixed to go back on every menu.
export type PadRow = {
    buttons: readonly string[]
    label: string
    back?: true
}

export function padLegend(bindings: Bindings, player: number): PadRow[] {
    const pad = bindings.players[player]!.pad
    const rows: PadRow[] = [{ buttons: ["D-pad", "L stick"], label: "Move" }]
    if (pad.breath === pad.confirm) {
        rows.push({
            buttons: [buttonName(pad.breath)],
            label: "Breathe, and confirm in menus",
        })
    } else {
        rows.push({ buttons: [buttonName(pad.breath)], label: "Breathe" })
        rows.push({
            buttons: [buttonName(pad.confirm)],
            label: "Confirm in menus",
        })
    }
    rows.push({ buttons: [buttonName(PAD_B)], label: "Go back", back: true })
    rows.push({ buttons: [buttonName(pad.pause)], label: "Pause" })
    return rows
}

// ---- Scenes ----

// What a scene shows at a moment: a corridor of cells (x from the left),
// the character at `x` (walking or standing), the dots from `dotsFrom` to
// `dotsTo` (those it has passed eaten), the fire on `fire`'s cells, a ghost
// enemy, the HUD meter and a finger (in map pixels, CELL a cell, and how
// opaque).
export type SceneState = {
    x: number
    walking?: boolean
    faceRight?: boolean
    dotsFrom?: number
    dotsTo?: number
    fire?: readonly number[]
    fireAlpha?: number
    ghost?: number
    meter?: {
        energy: number
        max: number
        cost: number
        ready: boolean
        charge?: number
    }
    finger?: { x: number; y: number; alpha: number }
    // The part of its loop, for captions and keys that light in step.
    phase?: string
}

// Time `t` (seconds) as a place in a `cycle` second loop, `offset` ahead.
export function loopTime(t: number, cycle: number, offset = 0): number {
    return (((t + offset) % cycle) + cycle) % cycle
}

// Whether the dot at cell `x` has been eaten by a character at `at`.
export function dotEaten(x: number, at: number): boolean {
    return x <= at + 0.45
}

// The Keyboard and Controller pages' loop: walk two cells (the right key
// lit), then breathe (the breath key lit), then rest. 2P runs half a loop
// behind (ACT_OFFSET).
export const ACT_CYCLE = 2.4
export const ACT_OFFSET = 1.2
// Each scene's still frame, shown with reduced motion.
export const ACT_STILL = 1.3

export type ActPhase = "move" | "breath" | "idle"

export function actPhase(u: number): ActPhase {
    return u < 0.9 ? "move" : u < 1.9 ? "breath" : "idle"
}

export function actScene(u: number): SceneState {
    const phase = actPhase(u)
    const x = phase === "move" ? 1 + (u / 0.9) * 2 : 3
    const fires =
        phase === "breath" ? Math.min(3, 1 + Math.floor((u - 0.9) / 0.15)) : 0
    return {
        x,
        walking: phase === "move",
        dotsFrom: 2,
        dotsTo: 7,
        fire: Array.from({ length: fires }, (_, i) => 4 + i),
        ...(fires >= 3 || phase === "idle" ? {} : { ghost: 6 }),
        phase,
    }
}

// The Breath page's 6 s loop: walk and eat (the meter fills 5 a dot), hold
// to charge (a level every 0.25 s), let go (a big fire, the meter empty and
// grey), then the cooldown.
export const BREATH_CYCLE = 6
export const BREATH_STILL = 2.9

export type BreathPhase = "walk" | "hold" | "fire" | "after"

export const BREATH_CAPTIONS: Readonly<Record<BreathPhase, string>> = {
    walk: "Eat dots: each one adds 5 energy.",
    hold: "Hold to charge: one level every 0.25 s, up to 5.",
    fire: "Let go: a bigger breath. Then a 1 s cooldown.",
    after: "The meter is grey until you can breathe again.",
}

export function breathScene(u: number): SceneState & { phase: BreathPhase } {
    const meter = { max: 100, cost: 20, energy: 85, ready: true, charge: 0 }
    const base = { dotsFrom: 2, dotsTo: 4, meter }
    if (u < 1.8) {
        const x = 1 + (u / 1.8) * 3
        const eaten = Math.max(0, Math.min(3, Math.floor(x + 0.45) - 1))
        meter.energy = 85 + 5 * eaten
        return { ...base, x, walking: true, ghost: 9, phase: "walk" }
    }
    if (u < 3.05) {
        meter.energy = 100
        meter.charge = Math.min(5, 1 + Math.floor((u - 1.8) / 0.25))
        return { ...base, x: 4, ghost: 9, phase: "hold" }
    }
    meter.energy = 0
    meter.ready = false
    const fires = Math.min(6, Math.ceil((u - 3.05) / 0.06))
    return {
        ...base,
        x: 4,
        fire: Array.from({ length: fires }, (_, j) => 5 + j),
        fireAlpha: u > 5.05 ? Math.max(0, 1 - (u - 5.05) * 2) : 1,
        ...(fires >= 5 ? {} : { ghost: 9 }),
        phase: u < 4.05 ? "fire" : "after",
    }
}

// The Touch page's loop: a flick right, the Dragon running on with the
// finger up, a flick back that stops it at the next cell, a tap that
// breathes.
export const TOUCH_CYCLE = 4.6
export const TOUCH_STILL = 1.2

export type TouchPhase = "flick" | "run" | "stop" | "tap"

export const TOUCH_CAPTIONS: Readonly<Record<TouchPhase, string>> = {
    flick: "Flick to run.",
    run: "You keep running, finger up.",
    stop: "Flick back to stop.",
    tap: "Tap the board to breathe.",
}

export function touchScene(u: number): SceneState & { phase: TouchPhase } {
    const base = { x: 1, dotsFrom: 2, dotsTo: 7, faceRight: true }
    if (u < 0.3) {
        const finger = { x: 24 + u * 120, y: 30, alpha: 0.9 }
        return { ...base, ghost: 8, finger, phase: "flick" }
    }
    if (u < 2.2) {
        const x = Math.min(6, 1 + (u - 0.3) * 3)
        return { ...base, x, walking: x < 6, ghost: 8, phase: "run" }
    }
    if (u < 3.2) {
        const finger = {
            x: Math.max(90, 150 - (u - 2.2) * 200),
            y: 30,
            alpha: u < 2.6 ? 0.9 : 0,
        }
        return { ...base, x: 6, ghost: 8, finger, phase: "stop" }
    }
    const fires = Math.min(2, Math.ceil((u - 3.3) / 0.1))
    return {
        ...base,
        x: 6,
        ...(u < 3.45 ? { finger: { x: 180, y: 30, alpha: 0.9 } } : {}),
        ...(u > 3.3
            ? { fire: Array.from({ length: fires }, (_, j) => 7 + j) }
            : { ghost: 8 }),
        phase: "tap",
    }
}
