import type {
    DirectionAction,
    InputSource,
    InputState,
    PlayerInput,
} from "./input"

// Touch source: swipes on the play area steer player 1 and taps breathe.
// Touch drives player 1 only; 2-player modes stay on keyboard and pads.
//
// A swipe turns the player and the turn sticks after the finger lifts, so
// the player keeps going the way it was last sent, as in other phone maze
// games (a keyboard player has to hold an arrow instead). The previous
// swipe stays held as a fallback, the way a keyboard player holds the old
// arrow while pressing the new one: a turn swiped before a junction waits
// for it while the player carries on, and the player turns along a corner
// rather than stopping against it. A swipe back the way the player came
// drops the old direction, so the player never bounces back. Swiping the
// direction already held presses it again, so it also counts after a
// restart has set held directions aside (InputState.ignoreHeld).
//
// One finger can keep steering without lifting: after each swipe the
// distance is measured again from where the finger is, so drawing an L
// turns twice. A short touch that hardly moves is a tap: it presses breath.
// It has no DOM access beyond the injected event target, and the clock is
// injected, so tests drive it with plain events.

// How far (CSS pixels) a finger must move before it counts as a swipe.
export const SWIPE_DISTANCE = 24
// A touch that moved no further than this (CSS pixels) from where it went
// down can be a tap.
export const TAP_SLOP = 12
// A touch held longer than this (ms) isn't a tap, so a thumb resting on the
// screen doesn't breathe when it lifts.
export const TAP_MAX_MS = 400

// The direction a finger moved, by its stronger axis, or undefined while it
// hasn't moved SWIPE_DISTANCE. Screen y grows downwards.
export function swipeDirection(
    dx: number,
    dy: number,
    distance = SWIPE_DISTANCE
): DirectionAction | undefined {
    if (Math.hypot(dx, dy) < distance) return undefined
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right"
    return dy < 0 ? "up" : "down"
}

// Whether a touch that went down `ms` ago and lifted `travel` CSS pixels at
// most from where it started, without swiping, is a tap.
export function isTap(travel: number, ms: number): boolean {
    return travel <= TAP_SLOP && ms <= TAP_MAX_MS
}

const OPPOSITE: Record<DirectionAction, DirectionAction> = {
    up: "down",
    down: "up",
    left: "right",
    right: "left",
}

// The directions held after swiping `swiped`, newest first, given those
// held before (newest first): the swipe, then the previous swipe as a
// fallback unless it is the swipe itself or its opposite.
export function swipeHeld(
    held: readonly DirectionAction[],
    swiped: DirectionAction
): DirectionAction[] {
    const previous = held[0]
    return previous && previous !== swiped && previous !== OPPOSITE[swiped]
        ? [swiped, previous]
        : [swiped]
}

// The parts of a PointerEvent the source reads.
type Pointer = {
    pointerId: number
    pointerType: string
    clientX: number
    clientY: number
}

// One finger on the play area.
type Gesture = {
    // Where and when it went down.
    startX: number
    startY: number
    startedAt: number
    // Where distance is measured from: the start, then the latest swipe.
    anchorX: number
    anchorY: number
    // The farthest it has been from the start.
    travel: number
    // Its latest swipe, if it has swiped.
    swiped?: DirectionAction
}

export type TouchOptions = {
    // Pointer types that count; mouse is left out so a desktop click on the
    // board doesn't breathe.
    pointerTypes?: readonly string[]
    // Milliseconds, for telling taps from resting fingers.
    now?: () => number
}

const SWIPE = "touch:swipe"
const TAP = "touch:tap"

export class TouchSource implements InputSource {
    private input: InputState | undefined
    private readonly gestures = new Map<number, Gesture>()
    // The directions held by swipes, newest first.
    private held: DirectionAction[] = []
    private readonly pointerTypes: readonly string[]
    private readonly now: () => number

    constructor(
        private readonly target: EventTarget,
        options: TouchOptions = {}
    ) {
        this.pointerTypes = options.pointerTypes ?? ["touch", "pen"]
        this.now = options.now ?? (() => performance.now())
    }

    attach(input: InputState): void {
        this.detach()
        this.input = input
        this.target.addEventListener("pointerdown", this.onDown)
        this.target.addEventListener("pointermove", this.onMove)
        this.target.addEventListener("pointerup", this.onUp)
        this.target.addEventListener("pointercancel", this.onCancel)
    }

    detach(): void {
        if (!this.input) return
        this.release()
        this.gestures.clear()
        this.target.removeEventListener("pointerdown", this.onDown)
        this.target.removeEventListener("pointermove", this.onMove)
        this.target.removeEventListener("pointerup", this.onUp)
        this.target.removeEventListener("pointercancel", this.onCancel)
        this.input = undefined
    }

    // Let go of every swiped direction, so the player stops.
    release(): void {
        const player = this.player()
        for (const action of this.held) player?.release(action, SWIPE)
        this.held = []
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
        this.gestures.set(p.pointerId, {
            startX: p.clientX,
            startY: p.clientY,
            startedAt: this.now(),
            anchorX: p.clientX,
            anchorY: p.clientY,
            travel: 0,
        })
    }

    private readonly onMove = (event: Event) => {
        const p = this.pointer(event)
        const gesture = p && this.gestures.get(p.pointerId)
        if (!p || !gesture) return
        gesture.travel = Math.max(
            gesture.travel,
            Math.hypot(p.clientX - gesture.startX, p.clientY - gesture.startY)
        )
        const direction = swipeDirection(
            p.clientX - gesture.anchorX,
            p.clientY - gesture.anchorY
        )
        if (!direction) return
        gesture.anchorX = p.clientX
        gesture.anchorY = p.clientY
        // Carrying on the same way isn't a new swipe.
        if (direction === gesture.swiped) return
        gesture.swiped = direction
        this.swipe(direction)
    }

    private readonly onUp = (event: Event) => {
        const p = this.pointer(event)
        const gesture = p && this.gestures.get(p.pointerId)
        if (!p || !gesture) return
        this.onMove(event)
        this.gestures.delete(p.pointerId)
        if (gesture.swiped) return
        if (!isTap(gesture.travel, this.now() - gesture.startedAt)) return
        const player = this.player()
        player?.press("breath", TAP)
        player?.release("breath", TAP)
    }

    private readonly onCancel = (event: Event) => {
        const p = this.pointer(event)
        if (p) this.gestures.delete(p.pointerId)
    }

    private swipe(direction: DirectionAction) {
        const player = this.player()
        if (!player) return
        const next = swipeHeld(this.held, direction)
        // Release the swiped direction too, so pressing it again is a
        // fresh press edge.
        for (const action of this.held) {
            if (action === direction || !next.includes(action)) {
                player.release(action, SWIPE)
            }
        }
        this.held = next
        player.press(direction, SWIPE)
    }
}

// Whether the device has a touch screen, so the touch-only buttons (pause)
// show. `view` is the window.
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
