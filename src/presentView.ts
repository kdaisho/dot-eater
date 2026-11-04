import { SPRITE_SCALE } from "./constants"
import {
    PRESENT_SECONDS,
    PresentContent,
    QUAKE_SECONDS,
    type Present,
    type Reveal,
} from "./present"

// How the present boxes (KDA-324, see present.ts) look as time goes by:
// the box's bob and blink, its opening, and an enemy's panic in an
// Earthquake. Pure timing, no DOM: everything is worked out from the
// game's own timers (a box's time left, a reveal's age, a status's time
// left), so it keeps to the game, pauses with it and is tested directly.
// render.ts draws it. The numbers are the design page's (box A, quake look
// 2), placeholders to tune at preview.

// One dot of the pixel art, in cells: a sprite's 16 dots and outline fill
// SPRITE_SCALE of a cell, and the box and icons use the same dots.
export const DOT = SPRITE_SCALE / 18
// The box, 12 dots and its outline, is this wide, in cells.
export const BOX_SIZE = 14 * DOT

// A fresh box bobs a dot up and down, every BOB_SECONDS. From
// BLINK_AT seconds into its life it blinks twice a second, from
// FAST_BLINK_AT four times, until it vanishes at PRESENT_SECONDS.
export const BOB_SECONDS = 0.4
export const BLINK_AT = 7
export const FAST_BLINK_AT = 8.5

// Whether to draw `box` now: always while fresh, then on 0.3 s of every
// 0.5 s, then on 0.15 s of every 0.25 s.
export function presentShown(box: Present): boolean {
    const age = PRESENT_SECONDS - box.left
    if (age < BLINK_AT) return true
    if (age < FAST_BLINK_AT) return (age - BLINK_AT) % 0.5 < 0.3
    return (age - FAST_BLINK_AT) % 0.25 < 0.15
}

// How many dots up `box` is drawn: 1 on every other BOB_SECONDS while
// fresh, else 0.
export function presentBob(box: Present): number {
    const age = PRESENT_SECONDS - box.left
    if (age >= BLINK_AT) return 0
    return Math.floor(age / BOB_SECONDS) % 2 === 1 ? 1 : 0
}

// A reveal as drawn at its age (see revealFrame). Offsets are in cells
// from the box's cell (`box`, `lid`) or the opener (`icon`, `label`), up
// negative.
export type RevealFrame = {
    // The box: closed (squashing, or shaking for a Germ) until it opens,
    // then its open body, fading.
    box: {
        open: boolean
        dx: number
        dy: number
        scaleX: number
        scaleY: number
        alpha: number
    } | null
    // The lid flying off, once open.
    lid: { dx: number; dy: number; alpha: number } | null
    // The content's icon popping up over the opener (none for a Germ).
    icon: { dx: number; dy: number; scale: number; alpha: number } | null
    // The floating label.
    label: { dx: number; dy: number; alpha: number } | null
}

// When the box opens: a Germ's shakes first, a short tell that it's bad.
export function openAt(content: PresentContent): number {
    return content === PresentContent.germ ? 0.22 : 0.1
}

// How long the Germ's jump from the box to its cell takes, after the box
// opens (see GERM_LAND_SECONDS in present.ts, their sum).
export const GERM_JUMP_SECONDS = 0.42

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeOutBack = (t: number) => {
    const c = 1.9
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}
// One dot either way, flipping every `period` seconds.
const flip = (t: number, period: number) =>
    Math.floor(t / period) % 2 ? DOT : -DOT

// The reveal `r` as drawn now: the box squashes (or shakes, for a Germ),
// its lid flies off, the icon pops up over the opener's head with a
// bounce, holds (the heart beats, the boulder judders) and fades, and its
// label floats up and fades.
export function revealFrame(r: Reveal): RevealFrame {
    const p = r.age
    const germ = r.content === PresentContent.germ
    const open = openAt(r.content)
    let box: RevealFrame["box"]
    let lid: RevealFrame["lid"] = null
    if (p < open) {
        const k = Math.sin((p / open) * Math.PI)
        const scaleX = germ ? 1 : 1 + 0.12 * k
        const scaleY = germ ? 1 : 1 - 0.15 * k
        box = {
            open: false,
            dx: germ ? flip(p, 0.035) : 0,
            // Squashed onto its bottom edge.
            dy: (1 - scaleY) * 6 * DOT,
            scaleX,
            scaleY,
            alpha: 1,
        }
    } else {
        const alpha = 1 - clamp((p - 0.55) / 0.3)
        box =
            alpha > 0
                ? { open: true, dx: 0, dy: 0, scaleX: 1, scaleY: 1, alpha }
                : null
        const k = clamp((p - open) / 0.4)
        if (k < 1) {
            lid = {
                dx: 0.3 * easeOut(k),
                dy: -0.75 * easeOut(k) + 0.6 * k * k,
                alpha: 1 - k,
            }
        }
    }
    let icon: RevealFrame["icon"] = null
    if (!germ && p >= open) {
        const k = clamp((p - open) / 0.3)
        const out = clamp((p - 1.2) / 0.25)
        let scale = 0.35 + 0.65 * easeOutBack(k)
        let dx = 0
        const hold = p - open - 0.3
        if (hold > 0 && hold < 0.5 && r.content === PresentContent.heal) {
            scale *= 1 + 0.15 * Math.max(0, Math.sin(hold * Math.PI * 4))
        }
        if (hold > 0 && hold < 0.6 && r.content === PresentContent.quake) {
            dx = flip(hold, 0.04)
        }
        if (out < 1) {
            icon = {
                dx,
                dy: -0.15 - 0.62 * easeOut(k) - 0.08 * out,
                scale,
                alpha: 1 - out,
            }
        }
    }
    let label: RevealFrame["label"] = null
    const lp = p - 0.25
    if (lp > 0) {
        const alpha = (1 - clamp((lp - 0.85) / 0.3)) * clamp(lp / 0.08)
        if (alpha > 0) {
            label = {
                dx: germ && lp < 0.4 ? flip(lp, 0.04) : 0,
                dy: -1.06 - 0.12 * easeOut(clamp(lp / 1.1)),
                alpha,
            }
        }
    }
    return { box, lid, icon, label }
}

// The text of each content's label (the Heal's is followed by a heart).
export const REVEAL_LABELS: Readonly<Record<PresentContent, string>> = {
    heal: "+1",
    hugeDot: "×10",
    speed: "SPEED!",
    quake: "QUAKE!",
    germ: "GERM!",
}
// Its colour.
export const REVEAL_COLORS: Readonly<Record<PresentContent, string>> = {
    heal: "#fb7185",
    hugeDot: "#fde047",
    speed: "#7dd3fc",
    quake: "#fdba74",
    germ: "#bef264",
}

// Where a Germ is drawn as it jumps out of its box (reveal `r`) to its
// cell (`to`): not at all until the box opens (null; it is still inside),
// then along an arc from the box, growing to its full size, until it
// lands. Offsets are in cells from where the game has it (`to`). Done
// (`landed`) once it is on its cell.
export function germJump(
    r: Reveal,
    to: { x: number; y: number }
):
    | { hidden: true }
    | {
          hidden: false
          landed: boolean
          dx: number
          dy: number
          scale: number
      } {
    const open = openAt(r.content)
    if (r.age < open) return { hidden: true }
    const k = clamp((r.age - open) / GERM_JUMP_SECONDS)
    if (k >= 1) return { hidden: false, landed: true, dx: 0, dy: 0, scale: 1 }
    const e = easeOut(k)
    return {
        hidden: false,
        landed: false,
        dx: (r.pos.x - to.x) * (1 - e),
        dy:
            (r.pos.y - to.y) * (1 - e) -
            0.15 * (1 - k) -
            Math.sin(k * Math.PI) * 0.9,
        scale: 0.55 + 0.45 * e,
    }
}

// The warning at the end of an Earthquake: the enemies tremble harder and
// their sweat drops blink for the last this-many seconds.
export const QUAKE_WARN_SECONDS = 0.6

// An enemy panicking in an Earthquake (quake look 2), `left` seconds
// before it ends, `slot` its index (so enemies don't move in step): how
// far it is drawn off its spot (cells, up negative), which way it looks
// (null: as it was), whether its sweat drop shows, and how old its current
// puff of dust is (seconds, null for none). It trembles a dot either way,
// looks left and right, hops now and then and kicks up dust; harder in the
// last QUAKE_WARN_SECONDS, while its sweat drop blinks. With reduced
// motion it keeps still, and only the drop shows (and blinks).
export type QuakePanic = {
    dx: number
    dy: number
    right: boolean | null
    badge: boolean
    dust: number | null
}

export function quakePanic(
    left: number,
    slot: number,
    reducedMotion: boolean
): QuakePanic {
    const t = Math.max(0, QUAKE_SECONDS - left)
    const warn = left < QUAKE_WARN_SECONDS
    const badge = !(warn && Math.floor(t / 0.1) % 2 === 1)
    if (reducedMotion) {
        return { dx: 0, dy: 0, right: null, badge, dust: null }
    }
    let dx = flip(t + slot * 0.08, 0.08)
    if (warn) dx += flip(t, 0.05) * 1.5
    const hops = Math.floor(t / 0.6 + slot * 0.3) % 2 === 0 && t % 0.6 < 0.12
    return {
        dx,
        dy: hops ? -1.5 * DOT : 0,
        right: Math.floor(t / 0.3 + slot) % 2 === 1,
        badge,
        dust: (t + slot * 0.17) % 0.6,
    }
}
