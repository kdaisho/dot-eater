import type {
    DirectionAction,
    InputSource,
    InputState,
    PlayerInput,
} from "./input"

// Touch source: dragging on the play area steers player 1 while the finger
// is down. Touch drives player 1 only; 2-player modes stay on keyboard and
// pads. Punch and breath are on-screen buttons (dpad.ts), so a tap on the
// board does nothing.
//
// A finger that touches the board and drags SWIPE_DISTANCE holds the way it
// went, by its stronger axis, as an arrow key is held: the direction is
// pressed when it changes, so a turn made just before a junction is
// buffered like a key tap, and released when the finger lifts, so the
// player stops at the next cell like letting go of a key.
//
// While the finger stays down, the direction held before the latest turn
// stays held behind it as a fallback, the way a keyboard player holds the
// old arrow while pressing the new one: a turn dragged before a junction
// waits for it while the player carries on, rather than stopping the player
// against the wall. Only one fallback is kept. Reversing the latest turn
// drops that turn but keeps the fallback (moving right, an early up then
// down holds down and right, as holding → and pressing ↓ would); reversing
// the way the player goes drops it, so the player never bounces back. The
// lift lets go of both.
//
// Dragging another way re-steers without lifting. The distance is measured
// from an anchor that keeps up with the finger while it moves on the way
// held (and stays put while it moves any other way), so a turn or a
// reversal always takes SWIPE_DISTANCE from where the finger last went the
// held way, however long the drag has been, and a wobble across the way
// held is forgotten once the finger moves on.
//
// One finger steers at a time. Another finger on the board takes over only
// once it has dragged SWIPE_DISTANCE, so a stray tap (a thumb that misses a
// button) changes nothing. When the steering finger lifts while an older
// one is still down, that one steers again from where it is now, holding
// nothing until it drags SWIPE_DISTANCE, so the player doesn't jump.
//
// A direction pressed by any other control (a key, a pad, the D-pad) drops
// the drag's directions (PlayerInput.latch), so the newest input wins; the
// finger then has to drag SWIPE_DISTANCE again to steer. It has no DOM
// access beyond the injected event target, so tests drive it with plain
// events.

// How far (CSS pixels) a finger must drag before it steers, or steers
// another way.
export const SWIPE_DISTANCE = 24

// The direction a finger moved, by its stronger axis, or undefined while it
// hasn't moved `distance`. Screen y grows downwards.
export function swipeDirection(
    dx: number,
    dy: number,
    distance = SWIPE_DISTANCE
): DirectionAction | undefined {
    if (Math.hypot(dx, dy) < distance) return undefined
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right"
    return dy < 0 ? "up" : "down"
}

const OPPOSITE: Record<DirectionAction, DirectionAction> = {
    up: "down",
    down: "up",
    left: "right",
    right: "left",
}

// The directions a drag holds after turning `turned`, given the way it held
// (`direction`) and that one's fallback: the turn, and as its fallback the
// way it held, unless that is the turn's opposite (a reversal). A reversal
// keeps the older fallback instead, unless that is the turn's opposite too.
export function dragHeld(
    direction: DirectionAction | undefined,
    fallback: DirectionAction | undefined,
    turned: DirectionAction
): { direction: DirectionAction; fallback?: DirectionAction } {
    const kept =
        direction && direction !== OPPOSITE[turned]
            ? direction
            : fallback && fallback !== OPPOSITE[turned] && fallback !== turned
              ? fallback
              : undefined
    return kept ? { direction: turned, fallback: kept } : { direction: turned }
}

// The parts of a PointerEvent the source reads.
type Pointer = {
    pointerId: number
    pointerType: string
    clientX: number
    clientY: number
}

// A finger on the play area.
type Finger = {
    // Where the distance is measured from (see the top of the file).
    anchorX: number
    anchorY: number
    // Where it last was.
    x: number
    y: number
}

export type TouchOptions = {
    // Pointer types that count; mouse is left out so a desktop click on the
    // board doesn't steer.
    pointerTypes?: readonly string[]
}

const DRAG = "touch:drag"

export class TouchSource implements InputSource {
    private input: InputState | undefined
    // The fingers on the board, oldest first.
    private readonly fingers = new Map<number, Finger>()
    // The one steering, if any, and what it holds.
    private steering: number | undefined
    private direction: DirectionAction | undefined
    private fallback: DirectionAction | undefined
    private readonly pointerTypes: readonly string[]

    constructor(
        private readonly target: EventTarget,
        options: TouchOptions = {}
    ) {
        this.pointerTypes = options.pointerTypes ?? ["touch", "pen"]
    }

    attach(input: InputState): void {
        this.detach()
        this.input = input
        // Newer input from another source drops the drag's directions (see
        // latch); the finger has to drag again to steer.
        input.players[0]?.latch(DRAG, () => this.release())
        this.target.addEventListener("pointerdown", this.onDown)
        this.target.addEventListener("pointermove", this.onMove)
        this.target.addEventListener("pointerup", this.onUp)
        this.target.addEventListener("pointercancel", this.onCancel)
    }

    detach(): void {
        if (!this.input) return
        this.forget()
        this.target.removeEventListener("pointerdown", this.onDown)
        this.target.removeEventListener("pointermove", this.onMove)
        this.target.removeEventListener("pointerup", this.onUp)
        this.target.removeEventListener("pointercancel", this.onCancel)
        this.input = undefined
    }

    // Let go of the dragged direction and its fallback, so the player
    // stops. A finger still down steers again once it drags SWIPE_DISTANCE
    // from where it is now.
    release(): void {
        for (const held of [this.direction, this.fallback]) {
            if (held) this.player()?.release(held, DRAG)
        }
        this.direction = undefined
        this.fallback = undefined
        const finger =
            this.steering === undefined
                ? undefined
                : this.fingers.get(this.steering)
        if (finger) reanchor(finger)
    }

    // Let go, and forget every finger on the board.
    private readonly forget = () => {
        this.release()
        this.fingers.clear()
        this.steering = undefined
    }

    private player(): PlayerInput | undefined {
        return this.input?.players[0]
    }

    private pointer(event: Event): Pointer | undefined {
        const e = event as Partial<Pointer>
        if (
            typeof e.pointerId !== "number" ||
            !this.pointerTypes.includes(e.pointerType ?? "")
        ) {
            return undefined
        }
        return e as Pointer
    }

    private readonly onDown = (event: Event) => {
        const p = this.pointer(event)
        if (!p || !this.input) return
        // Keep the browser from turning the touch into a scroll, a zoom or
        // a mouse click.
        event.preventDefault()
        // A pointer id seen again: its lift was missed.
        if (this.fingers.has(p.pointerId)) this.lift(p.pointerId)
        this.fingers.set(p.pointerId, {
            anchorX: p.clientX,
            anchorY: p.clientY,
            x: p.clientX,
            y: p.clientY,
        })
        // The first finger down steers; a later one only once it drags.
        this.steering ??= p.pointerId
    }

    private readonly onMove = (event: Event) => {
        const p = this.pointer(event)
        const finger = p && this.fingers.get(p.pointerId)
        if (!p || !finger) return
        finger.x = p.clientX
        finger.y = p.clientY
        const dx = finger.x - finger.anchorX
        const dy = finger.y - finger.anchorY
        if (p.pointerId !== this.steering) {
            // Another finger takes over once it drags.
            const direction = swipeDirection(dx, dy)
            if (!direction) return
            this.release()
            this.steering = p.pointerId
            reanchor(finger)
            this.turn(direction)
            return
        }
        // Moving on the way held: the anchor keeps up.
        const going = dx !== 0 || dy !== 0 ? swipeDirection(dx, dy, 0) : null
        if (this.direction && going === this.direction) {
            reanchor(finger)
            return
        }
        const direction = swipeDirection(dx, dy)
        if (!direction) return
        reanchor(finger)
        this.turn(direction)
    }

    private readonly onUp = (event: Event) => {
        const p = this.pointer(event)
        if (!p || !this.fingers.has(p.pointerId)) return
        // A flick whose movement only shows on the lift still presses (and
        // so moves a cell, like a key tap).
        this.onMove(event)
        this.lift(p.pointerId)
    }

    private readonly onCancel = (event: Event) => {
        const p = this.pointer(event)
        if (p) this.lift(p.pointerId)
    }

    // Steer the new way `direction` (see dragHeld).
    private turn(direction: DirectionAction) {
        const player = this.player()
        const next = dragHeld(this.direction, this.fallback, direction)
        // Let go of the rest, the new direction included, so pressing it
        // is a fresh press edge (it may have been the old fallback).
        for (const held of [this.fallback, this.direction]) {
            if (held && held !== next.fallback) player?.release(held, DRAG)
        }
        this.direction = next.direction
        this.fallback = next.fallback
        player?.press(direction, DRAG)
    }

    // A finger is gone. If it steered, let go of what it held and give the
    // steering back to the newest finger left, from where it is now.
    private lift(pointerId: number) {
        if (!this.fingers.delete(pointerId)) return
        if (pointerId !== this.steering) return
        this.release()
        this.steering = [...this.fingers.keys()].at(-1)
        const finger =
            this.steering === undefined
                ? undefined
                : this.fingers.get(this.steering)
        if (finger) reanchor(finger)
    }
}

// Measure a finger's distance from where it is now.
function reanchor(finger: Finger) {
    finger.anchorX = finger.x
    finger.anchorY = finger.y
}

// Whether the device has a touch screen, so the touch-only buttons (pause,
// punch and breath) show and the maze leaves room for them. `view` is the
// window.
export function isTouchDevice(view: {
    matchMedia?: (query: string) => { matches: boolean }
    navigator?: { maxTouchPoints?: number }
}): boolean {
    try {
        if (view.matchMedia?.("(any-pointer: coarse)").matches) return true
    } catch {
        // An old browser without matchMedia queries: go by touch points.
    }
    return (view.navigator?.maxTouchPoints ?? 0) > 0
}
