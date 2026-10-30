import type {
    Action,
    DirectionAction,
    InputSource,
    InputState,
    PlayerInput,
} from "./input"

// On-screen touch buttons for player 1: pause, punch and breath (on touch
// screens, during play) and a D-pad (optional, off by default). They are
// DOM buttons rather than drawn on the canvas: each gets its own pointer
// events, CSS places them beside or below the maze by orientation (see
// controlsSpace in layout.ts), and the renderer stays as it is. Dragging on
// the board steers too (touch.ts), with or without the D-pad.
//
// The D-pad works like the keyboard: a direction is held while a finger is
// on it, and sliding the finger round the pad changes direction without
// lifting, as on a stick. The pause, punch and breath buttons press on
// touch and release on lift, so holding one presses it once (no
// auto-repeat); a button looks pressed (the "pressed" class) while held.
// Each finger is tracked on its own, so one can steer while another
// presses. Which controls show is set on the body's data attributes
// (setControls), which the CSS reads.

// How far (CSS pixels) from the D-pad's centre a finger must be before it
// points anywhere, so a thumb resting in the middle holds nothing.
export const DPAD_DEAD_ZONE = 10

// The direction a finger at (dx, dy) from the D-pad's centre points, by its
// stronger axis, or undefined inside the dead zone. Screen y grows
// downwards.
export function padDirection(
    dx: number,
    dy: number,
    deadZone = DPAD_DEAD_ZONE
): DirectionAction | undefined {
    if (Math.hypot(dx, dy) < deadZone) return undefined
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right"
    return dy < 0 ? "up" : "down"
}

// Build the touch controls into `doc`'s body (once; an existing one is
// returned as it is). Returns their container, which DpadSource attaches to.
export function createTouchControls(doc: Document = document): HTMLElement {
    const existing = doc.getElementById("touch-controls")
    if (existing) return existing
    const root = doc.createElement("div")
    root.id = "touch-controls"
    root.className = "touch-controls"

    const pause = button(doc, "pause", "Pause", "⏸")
    pause.classList.add("touch-pause")

    const pad = doc.createElement("div")
    pad.className = "dpad"
    pad.setAttribute("role", "group")
    pad.setAttribute("aria-label", "Direction pad")
    for (const [direction, arrow] of [
        ["up", "▲"],
        ["down", "▼"],
        ["left", "◀"],
        ["right", "▶"],
    ] as const) {
        const span = doc.createElement("span")
        span.className = `dpad-arrow dpad-${direction}`
        span.textContent = arrow
        pad.appendChild(span)
    }

    const breath = button(doc, "breath", "Breath", "💨")
    breath.classList.add("touch-breath")

    const punch = button(doc, "punch", "Punch", "👊")
    punch.classList.add("touch-punch")

    root.append(pause, pad, breath, punch)
    doc.body.appendChild(root)
    return root
}

function button(
    doc: Document,
    action: Action,
    label: string,
    text: string
): HTMLButtonElement {
    const el = doc.createElement("button")
    el.type = "button"
    el.dataset.action = action
    el.setAttribute("aria-label", label)
    el.textContent = text
    return el
}

export type ControlFlags = {
    // A touch screen: the pause button shows during play.
    touch?: boolean
    // The punch and breath buttons show during play (and the maze makes
    // room for them): touch is the main input, or the D-pad shows.
    buttons?: boolean
    // The D-pad shows (and the maze makes a bigger band for it).
    dpad?: boolean
    // A game is being played (not a menu or pause).
    playing?: boolean
}

// Set which touch controls show, as "on"/"off" data attributes on the body
// (data-touch, data-buttons, data-dpad, data-playing). Flags left out stay as they are.
export function setControls(doc: Document, flags: ControlFlags): void {
    for (const [name, on] of Object.entries(flags)) {
        if (on !== undefined) doc.body.dataset[name] = on ? "on" : "off"
    }
}

// Mark `root`'s breath button ready (the "ready" class) while player 1 can
// breathe, as the HUD meter's amber does (energyHud's `ready`).
export function setBreathReady(root: ParentNode, ready: boolean): void {
    for (const el of root.querySelectorAll("[data-action=breath]")) {
        el.classList.toggle("ready", ready)
    }
}

// The parts of a PointerEvent the source reads.
type Pointer = { pointerId: number; clientX: number; clientY: number }

type Press =
    // A finger on the D-pad and the direction it holds, if any.
    | { pad: Element; direction?: DirectionAction | undefined }
    // A finger on a button.
    | { action: Action; button: Element }

// Feeds player 1 from the touch controls. Listens on their container
// (injected), and finds the control from the event's target.
export class DpadSource implements InputSource {
    private input: InputState | undefined
    private readonly presses = new Map<number, Press>()

    constructor(private readonly root: EventTarget) {}

    attach(input: InputState): void {
        this.detach()
        this.input = input
        this.root.addEventListener("pointerdown", this.onDown)
        this.root.addEventListener("pointermove", this.onMove)
        this.root.addEventListener("pointerup", this.onUp)
        this.root.addEventListener("pointercancel", this.onUp)
        this.root.addEventListener("lostpointercapture", this.onUp)
    }

    detach(): void {
        if (!this.input) return
        for (const id of this.presses.keys()) this.end(id)
        this.root.removeEventListener("pointerdown", this.onDown)
        this.root.removeEventListener("pointermove", this.onMove)
        this.root.removeEventListener("pointerup", this.onUp)
        this.root.removeEventListener("pointercancel", this.onUp)
        this.root.removeEventListener("lostpointercapture", this.onUp)
        this.input = undefined
    }

    private player(): PlayerInput | undefined {
        return this.input?.players[0]
    }

    private readonly onDown = (event: Event) => {
        const p = pointer(event)
        const target = event.target
        if (!p || !this.input || !(target instanceof Element)) return
        // Only a control inside the container: the body has data attributes
        // of its own (setControls).
        const control = target.closest(".dpad, [data-action]")
        if (!control || !(this.root as Node).contains?.(control)) return
        // No scrolling, zooming, focus or emulated mouse click.
        event.preventDefault()
        this.end(p.pointerId)
        // Keep getting this finger's moves and lift even once it leaves the
        // control (touch does this by itself; a mouse doesn't).
        try {
            control.setPointerCapture?.(p.pointerId)
        } catch {
            // Not an active pointer (a synthetic event): nothing to capture.
        }
        if (control instanceof HTMLElement && control.dataset.action) {
            const action = control.dataset.action as Action
            this.presses.set(p.pointerId, { action, button: control })
            control.classList.add("pressed")
            this.player()?.press(action, buttonControl(action, p.pointerId))
            return
        }
        this.presses.set(p.pointerId, { pad: control })
        this.aim(p)
    }

    private readonly onMove = (event: Event) => {
        const p = pointer(event)
        if (p) this.aim(p)
    }

    private readonly onUp = (event: Event) => {
        const p = pointer(event)
        if (p) this.end(p.pointerId)
    }

    // Point a finger on the D-pad where it now is.
    private aim(p: Pointer) {
        const press = this.presses.get(p.pointerId)
        if (!press || !("pad" in press)) return
        const rect = press.pad.getBoundingClientRect()
        const direction = padDirection(
            p.clientX - (rect.left + rect.width / 2),
            p.clientY - (rect.top + rect.height / 2)
        )
        if (direction === press.direction) return
        const player = this.player()
        const id = padControl(p.pointerId)
        if (press.direction) player?.release(press.direction, id)
        press.direction = direction
        if (direction) player?.press(direction, id)
    }

    // A finger lifted: release what it held.
    private end(pointerId: number) {
        const press = this.presses.get(pointerId)
        if (!press) return
        this.presses.delete(pointerId)
        const player = this.player()
        if ("action" in press) {
            player?.release(
                press.action,
                buttonControl(press.action, pointerId)
            )
            // It looks pressed while any finger is still on it.
            const held = [...this.presses.values()].some(
                (other) => "button" in other && other.button === press.button
            )
            if (!held) press.button.classList.remove("pressed")
        } else if (press.direction) {
            player?.release(press.direction, padControl(pointerId))
        }
    }
}

function pointer(event: Event): Pointer | undefined {
    const e = event as Partial<Pointer>
    return typeof e.pointerId === "number" ? (e as Pointer) : undefined
}

function padControl(pointerId: number): string {
    return `dpad:${pointerId}`
}

function buttonControl(action: Action, pointerId: number): string {
    return `dpad:${action}:${pointerId}`
}
