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
// player stops at the next cell like letting go of a key. Only the newest
// direction is held: there is no fallback to the one before.
//
// Dragging another way re-steers without lifting. The distance is measured
// from an anchor that keeps up with the finger while it moves on the way
// held (and stays put while it moves any other way), so a turn or a
// reversal always takes SWIPE_DISTANCE from where the finger last went the
// held way, however long the drag has been, and a wobble across the way
// held is forgotten once the finger moves on.
//
// The newest finger on the board steers: another finger touching down
// takes over (the first one's direction is let go of). A direction pressed
// by any other control (a key, a pad, the D-pad) drops the drag's
// direction (PlayerInput.latch), so the newest input wins; the finger then
// has to drag SWIPE_DISTANCE again to steer. It has no DOM access beyond
// the injected event target, so tests drive it with plain events.

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

// The parts of a PointerEvent the source reads.
type Pointer = {
    pointerId: number
    pointerType: string
    clientX: number
    clientY: number
}

// The finger steering on the play area.
type Drag = {
    pointerId: number
    // Where the distance is measured from (see the top of the file).
    anchorX: number
    anchorY: number
    // Where the finger last was.
    x: number
    y: number
    // The direction it holds, if any.
    direction?: DirectionAction | undefined
}

export type TouchOptions = {
    // Pointer types that count; mouse is left out so a desktop click on the
    // board doesn't steer.
    pointerTypes?: readonly string[]
}

const DRAG = "touch:drag"

export class TouchSource implements InputSource {
    private input: InputState | undefined
    private drag: Drag | undefined
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
        // Newer input from another source drops the drag's direction (see
        // latch); the finger has to drag again to steer.
        input.players[0]?.latch(DRAG, () => this.release())
        this.target.addEventListener("pointerdown", this.onDown)
        this.target.addEventListener("pointermove", this.onMove)
        this.target.addEventListener("pointerup", this.onUp)
        this.target.addEventListener("pointercancel", this.onCancel)
    }

    detach(): void {
        if (!this.input) return
        this.release()
        this.drag = undefined
        this.target.removeEventListener("pointerdown", this.onDown)
        this.target.removeEventListener("pointermove", this.onMove)
        this.target.removeEventListener("pointerup", this.onUp)
        this.target.removeEventListener("pointercancel", this.onCancel)
        this.input = undefined
    }

    // Let go of the dragged direction, so the player stops. A finger still
    // down steers again once it drags SWIPE_DISTANCE from where it is now.
    release(): void {
        const drag = this.drag
        if (!drag) return
        if (drag.direction) this.player()?.release(drag.direction, DRAG)
        drag.direction = undefined
        drag.anchorX = drag.x
        drag.anchorY = drag.y
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

    // The drag of the finger an event is for, if that finger steers.
    private dragOf(p: Pointer | undefined): Drag | undefined {
        return p && this.drag?.pointerId === p.pointerId ? this.drag : undefined
    }

    private readonly onDown = (event: Event) => {
        const p = this.pointer(event)
        if (!p || !this.input) return
        // Keep the browser from turning the touch into a scroll, a zoom or
        // a mouse click.
        event.preventDefault()
        // The newest finger steers.
        this.lift()
        this.drag = {
            pointerId: p.pointerId,
            anchorX: p.clientX,
            anchorY: p.clientY,
            x: p.clientX,
            y: p.clientY,
        }
    }

    private readonly onMove = (event: Event) => {
        const p = this.pointer(event)
        const drag = this.dragOf(p)
        if (!p || !drag) return
        drag.x = p.clientX
        drag.y = p.clientY
        const dx = drag.x - drag.anchorX
        const dy = drag.y - drag.anchorY
        // Moving on the way held: the anchor keeps up.
        const going = dx !== 0 || dy !== 0 ? swipeDirection(dx, dy, 0) : null
        if (drag.direction && going === drag.direction) {
            drag.anchorX = drag.x
            drag.anchorY = drag.y
            return
        }
        const direction = swipeDirection(dx, dy)
        if (!direction) return
        drag.anchorX = drag.x
        drag.anchorY = drag.y
        const player = this.player()
        if (drag.direction) player?.release(drag.direction, DRAG)
        drag.direction = direction
        player?.press(direction, DRAG)
    }

    private readonly onUp = (event: Event) => {
        const p = this.pointer(event)
        if (!this.dragOf(p)) return
        // A flick whose movement only shows on the lift still presses (and
        // so moves a cell, like a key tap).
        this.onMove(event)
        this.lift()
    }

    private readonly onCancel = (event: Event) => {
        if (this.dragOf(this.pointer(event))) this.lift()
    }

    // The steering finger is gone: let go of its direction.
    private lift() {
        this.release()
        this.drag = undefined
    }
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
