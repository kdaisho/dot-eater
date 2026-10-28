import {
    DEFAULT_BINDINGS,
    PAD_ACTIONS,
    PAD_DPAD,
    type Bindings,
    type PlayerBindings,
} from "./bindings"
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
    // Optional (and button slots nullable) so a malformed entry, as some
    // drivers or extensions produce, reads as holding nothing.
    readonly buttons?: readonly (PadButton | null | undefined)[]
    readonly axes?: readonly number[]
}

// navigator.getGamepads, or a fake. Empty slots are null.
export type PadList = () => readonly (Pad | null)[]

// The browser's pad list (pass navigator). getGamepads is missing in some
// browsers, and throws where a permissions policy blocks gamepads; either
// way the list is empty from then on, decided once rather than paying for a
// throw every frame. The game then runs on the keyboard alone.
export function browserPadList(nav: { getGamepads?: PadList }): PadList {
    if (typeof nav.getGamepads !== "function") return () => []
    const getGamepads = nav.getGamepads.bind(nav)
    let blocked = false
    return () => {
        if (blocked) return []
        try {
            return getGamepads()
        } catch {
            blocked = true
            return []
        }
    }
}

// How pads map to players. "shared": every pad drives player 1, alongside
// the keyboard (one-player play). "perPad": pads take players in connection
// order, the first pad player 1, the second player 2.
export type PadAssignment = "shared" | "perPad"

// `index` is the pad's index in the pad list.
export type PadChange =
    | { kind: "connected"; index: number }
    | {
          kind: "disconnected"
          index: number
          // Whether the pad drove a player since it connected (held any
          // control while it had one), so main pauses only for a pad in use,
          // not for an idle one going to sleep.
          wasUsed: boolean
      }

// Button index (of the browser's "standard" mapping) to its actions.
export type PadButtonMap = Readonly<Record<number, readonly Action[]>>

// The fixed D-pad directions, in PAD_DPAD order.
const DPAD_ACTIONS: readonly Action[] = ["up", "down", "left", "right"]

// One player's pad buttons: the bound breath, confirm and pause buttons
// (breath and confirm may share one), plus the fixed D-pad.
export function padButtonsFor(player: PlayerBindings): PadButtonMap {
    const map: Record<number, Action[]> = {}
    for (const action of PAD_ACTIONS) {
        const button = player.pad[action]
        ;(map[button] ??= []).push(action)
    }
    PAD_DPAD.forEach((button, i) => {
        map[button] = [DPAD_ACTIONS[i]!]
    })
    return map
}

// The default buttons: A (Cross) breath in play and confirm in menus, Start
// (Options) pause, and the D-pad.
export const PAD_BUTTONS: PadButtonMap = padButtonsFor(
    DEFAULT_BINDINGS.players[0]
)

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

// The indexes of the buttons a pad holds right now, bound or not (for a
// remap prompt; see captureButton in bindings.ts).
export function pressedButtons(pad: Pad): number[] {
    const pressed: number[] = []
    pad.buttons?.forEach((button, i) => {
        if (button?.pressed) pressed.push(i)
    })
    return pressed
}

// What a pad holds right now with `buttons`: control id to its actions. Ids
// are "pad:<index>:<button>" and "pad:<index>:stick", so a pad and the
// keyboard (or two buttons) hold one action independently.
export function padControls(
    pad: Pad,
    buttons: PadButtonMap = PAD_BUTTONS
): Map<string, readonly Action[]> {
    const held = new Map<string, readonly Action[]>()
    for (const i of pressedButtons(pad)) {
        const actions = buttons[i]
        if (actions) held.set(buttonControl(pad.index, i), actions)
    }
    const stick = stickAction(pad.axes?.[0] ?? 0, pad.axes?.[1] ?? 0)
    if (stick) held.set(stickControl(pad.index), [stick])
    return held
}

// Every control a pad has down, bound or not.
function downControls(pad: Pad): Set<string> {
    const down = new Set(
        pressedButtons(pad).map((i) => buttonControl(pad.index, i))
    )
    if (stickAction(pad.axes?.[0] ?? 0, pad.axes?.[1] ?? 0)) {
        down.add(stickControl(pad.index))
    }
    return down
}

function buttonControl(index: number, button: number): string {
    return `pad:${index}:${button}`
}

function stickControl(index: number): string {
    return `pad:${index}:stick`
}

type Held = { player: number; actions: readonly Action[] }

export class GamepadSource implements InputSource {
    private input: InputState | undefined
    private assignment: PadAssignment = "shared"
    // Connected pads by index, each with its player slot in perPad mode (the
    // lowest slot free when it connected), what it holds for a player, every
    // control down at the last poll (bound or not, with a player or not),
    // whether it has
    // driven a player yet, and whether a poll has listed it yet (a connect
    // event can come before the pad list shows the pad).
    private readonly pads = new Map<
        number,
        {
            slot: number
            held: Map<string, Held>
            down: ReadonlySet<string>
            used: boolean
            listed: boolean
        }
    >()
    // Controls held when the assignment or bindings changed, or when their
    // pad was first listed. They count only once released, so a button held through
    // the change doesn't press for the new player, and the press that woke
    // a pad up doesn't press at all.
    private readonly latched = new Set<string>()
    // Each player's buttons.
    private buttons: readonly PadButtonMap[]

    constructor(
        private readonly padList: PadList,
        private readonly target: EventTarget = globalThis,
        // Told when a pad connects or disconnects (for the toast, and to
        // pause play).
        private readonly onChange: (change: PadChange) => void = () => {},
        bindings: Bindings = DEFAULT_BINDINGS
    ) {
        this.buttons = bindings.players.map(padButtonsFor)
    }

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
        this.latchAll()
    }

    // Use the pad buttons of new bindings (after a remap). As with an
    // assignment change, buttons held now count only once released, so the
    // button just bound in a remap prompt doesn't fire.
    setBindings(bindings: Bindings): void {
        this.buttons = bindings.players.map(padButtonsFor)
        this.latchAll()
    }

    // Release every pad, and latch every control down.
    private latchAll() {
        for (const [index, pad] of this.pads) {
            // Every control down, not just those held for a player: a pad
            // with no player in perPad holds nothing, yet its A must not
            // confirm once it shares player 1. Unbound buttons too, since
            // new bindings may bind them.
            for (const control of pad.down) this.latched.add(control)
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
        // A pad gone from the list without a disconnect event. A pad only
        // announced by its connect event isn't gone until a poll has listed
        // it. (Deleting the current entry while iterating a Map is safe.)
        for (const [index, { listed }] of this.pads) {
            if (listed && !seen.has(index)) this.disconnect(index)
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
        const player = this.playerOf(pad.index)
        // A pad with no player reads player 1's buttons: the player it gets
        // if the assignment turns shared.
        const now = padControls(pad, this.buttons[player ?? 0])
        const down = downControls(pad)
        // Some browsers list a pad only once a button on it is pressed.
        // Whatever it holds when first listed counts only after a release,
        // like a button held through an assignment change.
        if (!state.listed) {
            for (const control of down) this.latched.add(control)
            state.listed = true
        }
        state.down = down
        for (const control of this.latched) {
            if (control.startsWith(`pad:${pad.index}:`) && !down.has(control)) {
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
        if (player === undefined) return
        if (now.size) state.used = true
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
        this.pads.set(index, {
            slot,
            held: new Map(),
            down: new Set(),
            used: false,
            listed: false,
        })
        this.onChange({ kind: "connected", index })
    }

    private disconnect(index: number) {
        const state = this.pads.get(index)
        if (!state) return
        this.releasePad(index)
        this.pads.delete(index)
        for (const control of this.latched) {
            if (control.startsWith(`pad:${index}:`))
                this.latched.delete(control)
        }
        this.onChange({ kind: "disconnected", index, wasUsed: state.used })
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
