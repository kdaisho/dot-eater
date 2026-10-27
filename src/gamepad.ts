import type { Action, InputSource, InputState } from "./input"

// Gamepad source. The Gamepad API has no button events, so the source polls
// the pads once per frame (main.ts calls poll) and turns each change in what
// a pad holds into press and release calls. Press edges come only from those
// transitions, so holding a button never presses again (the same rule as
// keyboard auto-repeat). It has no DOM access: the pad list and the event
// target for connect and disconnect events are injected.

// The parts of a Gamepad the source reads, so tests can pass plain objects.
export type PadButton = { readonly pressed: boolean }
export type Pad = {
    readonly index: number
    // False for a pad the browser still lists after it disconnected.
    readonly connected?: boolean
    readonly buttons: readonly PadButton[]
    readonly axes: readonly number[]
}

// navigator.getGamepads, or a fake. Empty slots are null.
export type PadList = () => readonly (Pad | null)[]

// How pads map to players. "shared": every pad drives player 1, alongside
// the keyboard (one-player play). "perPad": pads take players in connection
// order, the first pad player 1, the second player 2.
export type PadAssignment = "shared" | "perPad"

export type PadChange = {
    kind: "connected" | "disconnected"
    // The pad's index in the pad list.
    index: number
}

// Buttons of the browser's "standard" mapping.
export const PAD_BUTTONS: Readonly<Record<number, readonly Action[]>> = {
    // A (Cross): breath in play, confirm in menus.
    0: ["breath", "confirm"],
    9: ["pause"], // Start (Options)
    12: ["up"], // D-pad
    13: ["down"],
    14: ["left"],
    15: ["right"],
}

// How far the left stick must lean before it counts as a direction. High,
// so the stick feels digital, like a D-pad, in a maze.
export const STICK_DEAD_ZONE = 0.5

// The direction the left stick asks for: its dominant axis only, or none
// inside the dead zone. Up is negative y in the standard mapping.
export function stickAction(x: number, y: number): Action | undefined {
    if (Math.max(Math.abs(x), Math.abs(y)) < STICK_DEAD_ZONE) return undefined
    if (Math.abs(x) >= Math.abs(y)) return x < 0 ? "left" : "right"
    return y < 0 ? "up" : "down"
}

// What a pad holds right now: control id to its actions. Ids are
// "pad:<index>:<button>" and "pad:<index>:stick", so a pad and the keyboard
// (or two buttons) hold one action independently.
export function padControls(pad: Pad): Map<string, readonly Action[]> {
    const held = new Map<string, readonly Action[]>()
    pad.buttons.forEach((button, i) => {
        const actions = PAD_BUTTONS[i]
        if (button?.pressed && actions)
            held.set(`pad:${pad.index}:${i}`, actions)
    })
    const stick = stickAction(pad.axes[0] ?? 0, pad.axes[1] ?? 0)
    if (stick) held.set(`pad:${pad.index}:stick`, [stick])
    return held
}

type Held = { player: number; actions: readonly Action[] }

export class GamepadSource implements InputSource {
    private input: InputState | undefined
    private assignment: PadAssignment = "shared"
    // Connected pads by index, each with its player slot in perPad mode (the
    // lowest slot free when it connected) and what it holds.
    private readonly pads = new Map<
        number,
        { slot: number; held: Map<string, Held> }
    >()
    // Controls held when the assignment changed. They count again only once
    // released, so a button held through the change doesn't press for the
    // new player.
    private readonly latched = new Set<string>()

    constructor(
        private readonly padList: PadList,
        private readonly target: EventTarget = globalThis,
        // Told when a pad connects or disconnects (for the toast, and to
        // pause play).
        private readonly onChange: (change: PadChange) => void = () => {}
    ) {}

    attach(input: InputState): void {
        this.detach()
        this.input = input
        this.target.addEventListener("gamepadconnected", this.onConnected)
        this.target.addEventListener("gamepaddisconnected", this.onDisconnected)
    }

    detach(): void {
        if (!this.input) return
        for (const index of this.pads.keys()) this.releasePad(index)
        this.pads.clear()
        this.latched.clear()
        this.target.removeEventListener("gamepadconnected", this.onConnected)
        this.target.removeEventListener(
            "gamepaddisconnected",
            this.onDisconnected
        )
        this.input = undefined
    }

    setAssignment(assignment: PadAssignment): void {
        if (assignment === this.assignment) return
        this.assignment = assignment
        for (const [index, pad] of this.pads) {
            for (const control of pad.held.keys()) this.latched.add(control)
            this.releasePad(index)
        }
    }

    // Read every pad once and apply what changed. Call once per frame,
    // before the game reads its input.
    poll(): void {
        if (!this.input) return
        const seen = new Set<number>()
        for (const pad of this.padList()) {
            if (!pad || pad.connected === false) continue
            seen.add(pad.index)
            // Pads plugged in before the page loaded may be listed before
            // (or without) their connect event.
            this.connect(pad.index)
            this.update(pad)
        }
        // A pad gone from the list without a disconnect event.
        for (const index of [...this.pads.keys()]) {
            if (!seen.has(index)) this.disconnect(index)
        }
    }

    // The player a pad drives, or undefined when there is no such player.
    private playerOf(index: number): number | undefined {
        const slot = this.pads.get(index)?.slot
        if (slot === undefined) return undefined
        const player = this.assignment === "shared" ? 0 : slot
        return player < (this.input?.players.length ?? 0) ? player : undefined
    }

    private update(pad: Pad) {
        const state = this.pads.get(pad.index)
        const input = this.input
        if (!state || !input) return
        const now = padControls(pad)
        for (const control of this.latched) {
            if (control.startsWith(`pad:${pad.index}:`) && !now.has(control)) {
                this.latched.delete(control)
            }
        }
        // Releases first, so a stick swinging from up to left lets go of up
        // before pressing left.
        for (const [control, { player, actions }] of state.held) {
            const next = now.get(control)
            const kept = next ? actions.filter((a) => next.includes(a)) : []
            for (const action of actions) {
                if (!kept.includes(action)) {
                    input.players[player]?.release(action, control)
                }
            }
            if (kept.length) state.held.set(control, { player, actions: kept })
            else state.held.delete(control)
        }
        const player = this.playerOf(pad.index)
        if (player === undefined) return
        for (const [control, actions] of now) {
            if (this.latched.has(control)) continue
            const before = state.held.get(control)?.actions ?? []
            const added = actions.filter((a) => !before.includes(a))
            if (!added.length) continue
            state.held.set(control, { player, actions: [...before, ...added] })
            for (const action of added) {
                input.players[player]?.press(action, control)
            }
        }
    }

    private connect(index: number) {
        if (this.pads.has(index)) return
        const used = new Set([...this.pads.values()].map((p) => p.slot))
        let slot = 0
        while (used.has(slot)) slot++
        this.pads.set(index, { slot, held: new Map() })
        this.onChange({ kind: "connected", index })
    }

    private disconnect(index: number) {
        if (!this.pads.has(index)) return
        this.releasePad(index)
        this.pads.delete(index)
        for (const control of this.latched) {
            if (control.startsWith(`pad:${index}:`))
                this.latched.delete(control)
        }
        this.onChange({ kind: "disconnected", index })
    }

    // Release everything a pad holds.
    private releasePad(index: number) {
        const state = this.pads.get(index)
        if (!state) return
        for (const [control, { player, actions }] of state.held) {
            for (const action of actions) {
                this.input?.players[player]?.release(action, control)
            }
        }
        state.held.clear()
    }

    private readonly onConnected = (event: Event) => {
        const index = padIndex(event)
        if (index !== undefined && this.input) this.connect(index)
    }

    private readonly onDisconnected = (event: Event) => {
        const index = padIndex(event)
        if (index !== undefined) this.disconnect(index)
    }
}

function padIndex(event: Event): number | undefined {
    const index = (event as Partial<GamepadEvent>).gamepad?.index
    return typeof index === "number" ? index : undefined
}
