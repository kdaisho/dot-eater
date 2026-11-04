import type {
    DirectionAction,
    InputSource,
    InputState,
    PlayerInput,
} from "./input"

// Touch source: flicks on the play area steer player 1, who keeps going
// the way flicked without a finger on the screen, and stops at a flick back
// the way it is going. Touch drives player 1 only; 2-player modes stay on
// keyboard and pads. A tap on the board breathes, as the on-screen Breath
// button (dpad.ts) and the breath key do (see the end of this comment).
//
// A finger that touches the board and drags SWIPE_DISTANCE (a flick, or a
// drag that is still down) presses the way it went, by its stronger axis,
// and holds it after the lift, so the player runs on until it meets a wall
// or another flick:
// - The opposite of the way the player is going (see follow) lets go of
//   everything, so the player stops at the next cell: moving left, a flick
//   right stops it. Standing still, any way goes that way, the way back
//   from a wall included.
// - Any other way turns. A turn flicked before a junction is pressed like a
//   key tap, and the way the player is going stays held behind it as a
//   fallback until the player takes the turn, so it waits for the junction
//   while the player carries on rather than stopping against the wall:
//   moving left, a flick up turns up at the next opening.
//
// Dragging another way re-steers without lifting, by the same rules. The
// distance is measured from an anchor that keeps up with the finger while
// it moves on the way held (and stays put while it moves any other way), so
// a turn or a stop always takes SWIPE_DISTANCE from where the finger last
// went the held way, however long the drag has been, and a wobble across
// the way held is forgotten once the finger moves on.
//
// One finger steers at a time. Another finger on the board takes over only
// once it has dragged SWIPE_DISTANCE, so a stray tap (a thumb that misses a
// button) changes nothing. When the steering finger lifts while an older
// one is still down, that one steers next, measured from where it is now,
// so it changes nothing until it drags SWIPE_DISTANCE.
//
// A finger that lifts before it has gone SWIPE_DISTANCE from where it
// touched down is a tap, and breathes on the lift (not on the touch-down,
// which starts every flick too). Held still past TAP_CHARGE_DELAY, it holds
// the breath, which charges as holding the key does, and the lift fires it.
// Dragging SWIPE_DISTANCE makes it a flick: it lets go of the breath and
// drops the charge unfired (TouchOptions.cancelCharge). Any finger can tap,
// so one steers while another breathes; the steering finger never taps,
// since it has dragged. A press on a button inside the board is the
// button's, not a tap or a flick. Time comes in through tick, once a game
// tick, so the source reads no clock.
//
// A direction pressed by any other control (a key, a pad, the D-pad) drops
// the flick's directions (PlayerInput.latch), so the newest input wins.
// main lets go too when a game starts or ends, and the window losing focus
// or the page being hidden lets go and forgets every finger, since their
// lifts may never come; a charge held then, or by a cancelled touch, is
// dropped unfired. It has no DOM access beyond the injected event
// targets, so tests drive it with plain events.

// How far (CSS pixels) a finger must drag before it steers, or steers
// another way.
export const SWIPE_DISTANCE = 24

// How long (seconds) a finger rests on the board before it starts charging
// the breath (a placeholder to tune at preview).
export const TAP_CHARGE_DELAY = 0.2

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

// The way the player is going, for follow: the way it faces while it is
// on its way to the next cell, or undefined while it stands still (waiting
// at 1, see wait in game.ts).
export function heading(player: {
    character: { moveProgress: number }
    breather: { facing: { x: number; y: number } }
}): DirectionAction | undefined {
    if (player.character.moveProgress >= 1) return undefined
    const { x, y } = player.breather.facing
    if (x !== 0) return x < 0 ? "left" : "right"
    if (y !== 0) return y < 0 ? "up" : "down"
    return undefined
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
    // Where it touched down, which a tap must stay within SWIPE_DISTANCE of.
    downX: number
    downY: number
    // Whether it has gone SWIPE_DISTANCE from there, so it is a flick and
    // not a tap.
    dragged: boolean
    // Seconds it has been down, counted by tick until it charges.
    heldFor: number
    // Whether it holds the breath to charge it.
    charging: boolean
}

export type TouchOptions = {
    // Pointer types that count; mouse is left out so a desktop click on the
    // board doesn't steer.
    pointerTypes?: readonly string[]
    // The window, whose blur forgets every finger.
    view?: EventTarget
    // The document, whose visibilitychange to hidden forgets every finger.
    doc?: EventTarget & { hidden?: boolean }
    // Drop player 1's breath charge unfired: a charging finger turned into
    // a flick, or its lift never comes. Letting go of the breath alone
    // would fire it.
    cancelCharge?: () => void
}

const DRAG = "touch:drag"

function breathControl(pointerId: number): string {
    return `touch:breath:${pointerId}`
}

export class TouchSource implements InputSource {
    private input: InputState | undefined
    // The fingers on the board, oldest first.
    private readonly fingers = new Map<number, Finger>()
    // The one steering, if any.
    private steering: number | undefined
    // What the flicks hold: the way flicked, and behind it the way the
    // player was going until it takes the turn.
    private direction: DirectionAction | undefined
    private fallback: DirectionAction | undefined
    // The way the player is going (see follow).
    private going: DirectionAction | undefined
    private readonly pointerTypes: readonly string[]
    private readonly view: EventTarget | undefined
    private readonly doc: (EventTarget & { hidden?: boolean }) | undefined
    private readonly cancelCharge: () => void

    constructor(
        private readonly target: EventTarget,
        options: TouchOptions = {}
    ) {
        this.pointerTypes = options.pointerTypes ?? ["touch", "pen"]
        this.view = options.view
        this.doc = options.doc
        this.cancelCharge = options.cancelCharge ?? (() => {})
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
        this.target.addEventListener("lostpointercapture", this.onCancel)
        this.view?.addEventListener("blur", this.forget)
        this.doc?.addEventListener("visibilitychange", this.onVisibility)
    }

    detach(): void {
        if (!this.input) return
        this.forget()
        this.target.removeEventListener("pointerdown", this.onDown)
        this.target.removeEventListener("pointermove", this.onMove)
        this.target.removeEventListener("pointerup", this.onUp)
        this.target.removeEventListener("pointercancel", this.onCancel)
        this.target.removeEventListener("lostpointercapture", this.onCancel)
        this.view?.removeEventListener("blur", this.forget)
        this.doc?.removeEventListener("visibilitychange", this.onVisibility)
        this.input = undefined
    }

    // Tell the source the way player 1 is going now (see heading), or
    // undefined while it stands still, once a tick: a flick back that way
    // stops it, and a turn it has taken lets go of the way it went before.
    follow(going: DirectionAction | undefined): void {
        this.going = going
        if (this.fallback && going === this.direction) {
            this.player()?.release(this.fallback, DRAG)
            this.fallback = undefined
        }
    }

    // Move time on by `dt` seconds, once a game tick, before the game reads
    // its input: a finger resting past TAP_CHARGE_DELAY starts charging.
    tick(dt: number): void {
        for (const [id, finger] of this.fingers) {
            if (finger.dragged || finger.charging) continue
            finger.heldFor += dt
            if (finger.heldFor < TAP_CHARGE_DELAY) continue
            finger.charging = true
            this.player()?.press("breath", breathControl(id))
        }
    }

    // Let go of the flicked direction and its fallback, so the player
    // stops. Every finger still down is measured from where it is now, so
    // one only steers (or takes over) once it drags SWIPE_DISTANCE from
    // there, not because it drifted before.
    release(): void {
        for (const held of [this.direction, this.fallback]) {
            if (held) this.player()?.release(held, DRAG)
        }
        this.direction = undefined
        this.fallback = undefined
        for (const finger of this.fingers.values()) reanchor(finger)
    }

    // Let go, and forget every finger on the board.
    private readonly forget = () => {
        this.release()
        for (const id of this.fingers.keys()) this.lift(id, false)
        this.steering = undefined
    }

    private readonly onVisibility = () => {
        if (this.doc?.hidden) this.forget()
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
        // A button inside the board takes its own presses.
        const target = event.target as Partial<Element> | null
        if (target?.closest?.("button, [data-action]")) return
        // Keep the browser from turning the touch into a scroll, a zoom or
        // a mouse click.
        event.preventDefault()
        // Keep getting this finger's moves and lift even once it leaves the
        // board (touch does this by itself; a pen may not), and lift it if
        // the capture is lost, as dpad.ts does.
        try {
            target?.setPointerCapture?.(p.pointerId)
        } catch {
            // Not an active pointer (a synthetic event): nothing to capture.
        }
        // A pointer id seen again: its lift was missed.
        if (this.fingers.has(p.pointerId)) this.lift(p.pointerId, false)
        this.fingers.set(p.pointerId, {
            anchorX: p.clientX,
            anchorY: p.clientY,
            x: p.clientX,
            y: p.clientY,
            downX: p.clientX,
            downY: p.clientY,
            dragged: false,
            heldFor: 0,
            charging: false,
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
        if (
            !finger.dragged &&
            swipeDirection(finger.x - finger.downX, finger.y - finger.downY)
        ) {
            // A flick now, not a tap: drop its charge.
            finger.dragged = true
            if (finger.charging) this.dropBreath(p.pointerId, finger)
        }
        const dx = finger.x - finger.anchorX
        const dy = finger.y - finger.anchorY
        if (p.pointerId !== this.steering) {
            // Another finger takes over once it drags.
            const direction = swipeDirection(dx, dy)
            if (!direction) return
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
        // A flick whose movement only shows on the lift still steers.
        this.onMove(event)
        this.lift(p.pointerId, true)
    }

    private readonly onCancel = (event: Event) => {
        const p = this.pointer(event)
        if (p) this.lift(p.pointerId, false)
    }

    // Steer the new way `direction` (see the top of the file): stop on the
    // way back, else hold it, with the way the player is going behind it.
    private turn(direction: DirectionAction) {
        if (this.going && direction === OPPOSITE[this.going]) {
            this.release()
            return
        }
        const player = this.player()
        const fallback =
            this.going && this.going !== direction ? this.going : undefined
        // Let go of the rest, the new direction included, so pressing it
        // is a fresh press edge (it may have been held already).
        for (const held of [this.fallback, this.direction]) {
            if (held && held !== fallback) player?.release(held, DRAG)
        }
        this.direction = direction
        this.fallback = fallback
        // The fallback first, so the turn is the newest press and is tried
        // first (a fallback already held keeps its place).
        if (fallback) player?.press(fallback, DRAG)
        player?.press(direction, DRAG)
    }

    // A finger is gone; what it flicked stays held. Lifted (`tapped`), a
    // tap breathes, or fires its charge; cancelled, it drops the charge. If
    // it steered, the newest finger left steers next, and every finger left
    // is measured from where it is now, so none steers or takes over for a
    // drift.
    private lift(pointerId: number, tapped: boolean) {
        const finger = this.fingers.get(pointerId)
        if (!finger) return
        this.fingers.delete(pointerId)
        if (tapped && !finger.dragged) {
            // Pressed and let go before the game reads it: a tap. Charging,
            // letting go fires the charge.
            const player = this.player()
            if (!finger.charging)
                player?.press("breath", breathControl(pointerId))
            player?.release("breath", breathControl(pointerId))
        } else if (finger.charging) {
            this.dropBreath(pointerId, finger)
        }
        if (pointerId !== this.steering) return
        this.steering = [...this.fingers.keys()].at(-1)
        for (const finger of this.fingers.values()) reanchor(finger)
    }

    // Let go of a finger's breath without firing it: the charge is dropped,
    // unless another control (the key, the Breath button, another finger)
    // still holds the breath.
    private dropBreath(pointerId: number, finger: Finger) {
        finger.charging = false
        const player = this.player()
        player?.release("breath", breathControl(pointerId))
        if (player && !player.isDown("breath")) this.cancelCharge()
    }
}

// Measure a finger's distance from where it is now.
function reanchor(finger: Finger) {
    finger.anchorX = finger.x
    finger.anchorY = finger.y
}

// Whether the device has a touch screen, so the touch-only parts (the pause
// button, the Show D-pad setting) show. `view` is the window.
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

// Whether touch is the device's main input (its primary pointer is coarse,
// as on a phone or tablet), so the breath button shows and the maze leaves
// room for it. A laptop with a touch screen is a touch device
// (isTouchDevice) but not this: its trackpad and keys come first.
export function isTouchFirst(view: {
    matchMedia?: (query: string) => { matches: boolean }
}): boolean {
    try {
        return view.matchMedia?.("(pointer: coarse)").matches ?? false
    } catch {
        return false
    }
}
