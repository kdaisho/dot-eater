import { vec2, type Vec2 } from "./vec2"

// Abstract actions the game reads, per player. Input sources (keyboard now,
// gamepad and touch later) translate their raw events into these.
export type Action =
    | "up"
    | "down"
    | "left"
    | "right"
    | "breath"
    | "pause"
    | "confirm"

export const ACTIONS: readonly Action[] = [
    "up",
    "down",
    "left",
    "right",
    "breath",
    "pause",
    "confirm",
]

export type DirectionAction = "up" | "down" | "left" | "right"

export const DIRECTION_ACTIONS: readonly DirectionAction[] = [
    "up",
    "down",
    "left",
    "right",
]

const steps: Record<DirectionAction, Vec2> = {
    up: vec2(0, -1),
    down: vec2(0, 1),
    left: vec2(-1, 0),
    right: vec2(1, 0),
}

export function isDirection(action: Action): action is DirectionAction {
    return action in steps
}

// The unit step for a direction action.
export function directionStep(action: DirectionAction): Vec2 {
    const { x, y } = steps[action]
    return vec2(x, y)
}

// One player's actions. Sources call press/release; the game polls isDown,
// wasPressed and step each tick, then calls endTick (via InputState).
export class PlayerInput {
    // Who is holding each action: an opaque id per physical control (e.g.
    // "key:ArrowUp"), so two controls on one action release independently.
    private readonly holders = new Map<Action, Set<string>>()
    private readonly pressed = new Set<Action>()
    // Press order, so the most recently pressed direction wins.
    private readonly pressedAt = new Map<Action, number>()
    private seq = 0
    // Directions held through ignoreHeld: they don't move the player until
    // they're released and pressed again.
    private readonly stale = new Set<Action>()

    constructor(
        private readonly onPress: (action: Action) => void = () => {}
    ) {}

    // Returns true on a press edge (the action wasn't held before).
    press(action: Action, control: string): boolean {
        let holders = this.holders.get(action)
        if (!holders) {
            holders = new Set()
            this.holders.set(action, holders)
        }
        if (holders.has(control)) return false
        const edge = holders.size === 0
        holders.add(control)
        if (!edge) return false
        this.pressed.add(action)
        this.pressedAt.set(action, ++this.seq)
        this.onPress(action)
        return true
    }

    release(action: Action, control: string): void {
        const holders = this.holders.get(action)
        holders?.delete(control)
        if (!holders?.size) this.stale.delete(action)
    }

    // Ignore the directions held right now until they're released, so a
    // direction held while confirming a menu doesn't carry into play.
    ignoreHeld(): void {
        for (const action of DIRECTION_ACTIONS) {
            if (this.isDown(action)) this.stale.add(action)
        }
    }

    // Held right now, by any control.
    isDown(action: Action): boolean {
        return (this.holders.get(action)?.size ?? 0) > 0
    }

    // Pressed since the last endTick, even if already released. Holding a
    // control doesn't press again, so auto-repeat never counts.
    wasPressed(action: Action): boolean {
        return this.pressed.has(action)
    }

    // The step the player is asking for: the most recently pressed direction
    // that is held or was pressed since the last endTick (so a tap shorter
    // than a tick still counts). Zero when there is none.
    step(): Vec2 {
        return this.newestStep(
            (action) =>
                !this.stale.has(action) &&
                (this.isDown(action) || this.wasPressed(action))
        )
    }

    // Every held direction's step, most recently pressed first. Taps that
    // are no longer held don't count (pressedStep covers those), nor do
    // directions held through ignoreHeld. Empty when nothing is held.
    heldSteps(): Vec2[] {
        return DIRECTION_ACTIONS.filter(
            (action) => this.isDown(action) && !this.stale.has(action)
        )
            .sort(
                (a, b) =>
                    (this.pressedAt.get(b) ?? 0) - (this.pressedAt.get(a) ?? 0)
            )
            .map(directionStep)
    }

    // The most recently pressed direction since the last endTick, even if
    // already released. Zero when none was. Holding doesn't count, so this
    // marks a fresh press the game can remember for a moment (a tap buffer).
    pressedStep(): Vec2 {
        return this.newestStep((action) => this.wasPressed(action))
    }

    // The step for the most recently pressed direction matching `include`.
    private newestStep(include: (action: DirectionAction) => boolean): Vec2 {
        let best: DirectionAction | undefined
        let bestAt = -1
        for (const action of DIRECTION_ACTIONS) {
            if (!include(action)) continue
            const at = this.pressedAt.get(action) ?? 0
            if (at > bestAt) {
                best = action
                bestAt = at
            }
        }
        return best ? directionStep(best) : vec2(0, 0)
    }

    endTick(): void {
        this.pressed.clear()
    }
}

export type PressListener = (player: number, action: Action) => void

// Action state for every player, shared by all input sources.
export class InputState {
    readonly players: readonly PlayerInput[]
    private readonly listeners = new Set<PressListener>()

    constructor(playerCount = 2) {
        this.players = Array.from(
            { length: playerCount },
            (_, i) =>
                new PlayerInput((action) => {
                    for (const listener of this.listeners) listener(i, action)
                })
        )
    }

    player(index: number): PlayerInput {
        const player = this.players[index]
        if (!player) throw new RangeError(`No player ${index}`)
        return player
    }

    // Called on every press edge. Returns an unsubscribe function. For
    // event-driven consumers; a tick loop polls instead.
    onPress(listener: PressListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    // Every player ignores the directions held right now until they're
    // released (see PlayerInput.ignoreHeld).
    ignoreHeld(): void {
        for (const player of this.players) player.ignoreHeld()
    }

    // Clear the wasPressed edges of every player. Call once per tick, after
    // the game has read its input.
    endTick(): void {
        for (const player of this.players) player.endTick()
    }
}

// Something that feeds an InputState: keyboard, and later gamepad or touch.
export interface InputSource {
    attach(input: InputState): void
    detach(): void
}

// KeyboardEvent.code to action. Codes are layout independent, so WASD stays
// in place on AZERTY, and Shift doesn't change them between keydown and keyup.
export type KeyMap = Readonly<Record<string, Action>>

export const PLAYER_1_KEYS: KeyMap = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    ShiftRight: "breath",
    KeyP: "pause",
    Escape: "pause",
    Space: "confirm",
}

// Player 2, for 2-player play (main attaches both maps).
export const PLAYER_2_KEYS: KeyMap = {
    KeyW: "up",
    KeyS: "down",
    KeyA: "left",
    KeyD: "right",
    ShiftLeft: "breath",
    KeyQ: "pause",
    KeyE: "confirm",
}

// Keyboard source. keyMaps[i] drives player i.
export class KeyboardSource implements InputSource {
    private input: InputState | undefined
    // Codes currently held, so blur and detach can release them.
    private readonly held = new Set<string>()

    constructor(
        private readonly keyMaps: readonly KeyMap[] = [PLAYER_1_KEYS],
        private readonly target: EventTarget = globalThis
    ) {}

    attach(input: InputState): void {
        this.detach()
        this.input = input
        this.target.addEventListener("keydown", this.onKeyDown)
        this.target.addEventListener("keyup", this.onKeyUp)
        this.target.addEventListener("blur", this.onBlur)
    }

    detach(): void {
        if (!this.input) return
        this.releaseAll()
        this.target.removeEventListener("keydown", this.onKeyDown)
        this.target.removeEventListener("keyup", this.onKeyUp)
        this.target.removeEventListener("blur", this.onBlur)
        this.input = undefined
    }

    private bindings(code: string): [PlayerInput, Action][] {
        const input = this.input
        if (!input) return []
        const found: [PlayerInput, Action][] = []
        this.keyMaps.forEach((map, i) => {
            const action = Object.hasOwn(map, code) ? map[code] : undefined
            if (action && input.players[i]) {
                found.push([input.players[i], action])
            }
        })
        return found
    }

    private readonly onKeyDown = (event: Event) => {
        const e = event as KeyboardEvent
        // Leave browser shortcuts (Ctrl+R, Cmd+W, ...) alone.
        if (e.ctrlKey || e.metaKey || e.altKey) return
        const bindings = this.bindings(e.code)
        if (bindings.length === 0) return
        // Stop arrows and Space from scrolling the page.
        e.preventDefault()
        const held = this.held.has(e.code)
        // Auto-repeat of a key we already hold never presses again. An
        // auto-repeat for a key we don't hold means its first keydown was
        // missed (made with Ctrl/Alt/Meta held, or before the window had
        // focus), so it counts as the press.
        if (e.repeat && held) return
        if (held) {
            // A fresh keydown for a key we think is held: its keyup was
            // missed (e.g. macOS sends none while Cmd is held). Release it
            // first so this is a press edge again.
            for (const [player, action] of bindings) {
                player.release(action, control(e.code))
            }
        }
        this.held.add(e.code)
        for (const [player, action] of bindings) {
            player.press(action, control(e.code))
        }
    }

    private readonly onKeyUp = (event: Event) => {
        const { code } = event as KeyboardEvent
        this.held.delete(code)
        for (const [player, action] of this.bindings(code)) {
            player.release(action, control(code))
        }
    }

    // Keyups are lost while the window is unfocused; drop everything held.
    private readonly onBlur = () => this.releaseAll()

    private releaseAll() {
        for (const code of this.held) {
            for (const [player, action] of this.bindings(code)) {
                player.release(action, control(code))
            }
        }
        this.held.clear()
    }
}

function control(code: string): string {
    return `key:${code}`
}
