import { hash01 } from "./bossDefeat"
import type { GameEvent } from "./events"
import type { Dots } from "./sprites"
import { vec2, type Vec2 } from "./vec2"

// How a player's knockout looks (KDA-329, "Shockwave crumble", variant C
// of the design page the user picked from). Visual only, pure, no DOM:
// time comes in as `dt`, like the Rushes (rushView.ts), and nothing in the
// game reads it. render.ts draws it (see knockoutRender.ts).
//
// The game has done with a knockout on the tick it happens (playerCaught,
// see knockOut in game.ts). From then on, in seconds:
//
// - 0 to FLASH_SECONDS: a short white flash over the maze;
// - 0 to RING_SECONDS: two 1-dot rings, white then gold RING_DELAY later,
//   spread out from the animal to RING_REACH cells, fading;
// - GREY_AT to GREY_END: its panic face drains to grey, jittering a dot
//   from JITTER_AT;
// - CRUMBLE_AT to PILE_AT: it crumbles bottom first, each dot falling into
//   a small grey pile on the floor of its cell, which stays there until
//   the stage ends (a new game clears the view);
// - LIGHT_FADE_AT to KNOCKOUT_SECONDS: in fog, the light it fell in goes
//   out (see knockoutLight).
//
// The player's own sprite isn't drawn from the knockout on (see hidden).
// In solo the game is lost on the same tick; its gameLost waits for
// KNOCKOUT_SECONDS (see GameState.lossHeld), so the game over phrase and
// screen come once this has played.

export const FLASH_SECONDS = 0.09
export const FLASH_ALPHA = 0.7
export const RING_SECONDS = 0.55
export const RING_DELAY = 0.08
// Where the rings start and how far out they spread, in cells.
export const RING_START = 0.1
export const RING_REACH = 2.75
export const RING_COLORS = ["#fcfcfc", "#f8c838"] as const
export const GREY_AT = 0.05
export const GREY_END = 0.3
export const JITTER_AT = 0.1
// The jitter's flips a second (a dot one way, then back).
export const JITTER_RATE = 50
export const CRUMBLE_AT = 0.45
// From the bottom row starting to fall to the top row starting, plus up
// to CRUMBLE_RANDOM more each dot, each falling over FALL_SECONDS.
export const CRUMBLE_SPREAD = 0.27
export const CRUMBLE_RANDOM = 0.06
export const FALL_SECONDS = 0.32
// Every dot is in the pile by then.
export const PILE_AT =
    CRUMBLE_AT + CRUMBLE_SPREAD + CRUMBLE_RANDOM + FALL_SECONDS
export const LIGHT_FADE_AT = PILE_AT
// The whole effect: the pile, then a beat.
export const KNOCKOUT_SECONDS = 1.3

// One knockout as it is drawn: whose, on which cell, its randomness
// (`seed`, for the crumble) and the seconds since it happened.
export type Knockout = {
    player: number
    at: Vec2
    seed: number
    elapsed: number
}

export type KnockoutView = {
    // Every knockout of the game so far, in order: the piles stay.
    readonly knockouts: readonly Knockout[]
    // Record a tick's knockouts (its playerCaught events).
    take(events: readonly GameEvent[]): void
    // Move on by `dt` seconds.
    update(dt: number): void
    clear(): void
}

export type KnockoutViewOptions = {
    // A number in [0, 1), e.g. Math.random: each knockout's seed.
    random: () => number
}

export function createKnockoutView({
    random,
}: KnockoutViewOptions): KnockoutView {
    let knockouts: Knockout[] = []
    return {
        get knockouts() {
            return knockouts
        },
        take(events) {
            for (const event of events) {
                if (event.type !== "playerCaught") continue
                knockouts.push({
                    player: event.player,
                    at: vec2(event.at.x, event.at.y),
                    seed: Math.floor(random() * 2 ** 31),
                    elapsed: 0,
                })
            }
        },
        update(dt) {
            for (const k of knockouts) {
                if (k.elapsed < KNOCKOUT_SECONDS) {
                    k.elapsed = Math.min(KNOCKOUT_SECONDS, k.elapsed + dt)
                }
            }
        },
        clear() {
            knockouts = []
        },
    }
}

// The moment of `knockout` to draw, at `alpha` of the way to the next tick
// of `tickSeconds`, up to KNOCKOUT_SECONDS.
export function knockoutTime(
    knockout: Knockout,
    alpha: number,
    tickSeconds: number
): number {
    if (knockout.elapsed >= KNOCKOUT_SECONDS) return KNOCKOUT_SECONDS
    return Math.min(KNOCKOUT_SECONDS, knockout.elapsed + alpha * tickSeconds)
}

// The players whose sprite the knockouts stand in for.
export function hidden(knockouts: readonly Knockout[]): ReadonlySet<number> {
    return new Set(knockouts.map((k) => k.player))
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// How opaque the flash over the maze is at `t`.
export function knockoutFlash(t: number): number {
    if (t < 0 || t >= FLASH_SECONDS) return 0
    return FLASH_ALPHA * (1 - t / FLASH_SECONDS)
}

export type Ring = { radius: number; alpha: number; color: string }

// The rings at `t`, radii in cells from the animal's middle.
export function knockoutRings(t: number): Ring[] {
    if (t < 0 || t >= RING_SECONDS) return []
    const alpha = 1 - t / RING_SECONDS
    const rings: Ring[] = []
    RING_COLORS.forEach((color, i) => {
        const u = (t - i * RING_DELAY) / RING_SECONDS
        if (u < 0) return
        rings.push({ radius: RING_START + u * RING_REACH, alpha, color })
    })
    return rings
}

// How grey the sprite is at `t`, 0 to 1.
export function greyAmount(t: number): number {
    return clamp01((t - GREY_AT) / (GREY_END - GREY_AT))
}

// The sprite's sideways jitter at `t`, in dots: 0 or 1, flipping at
// JITTER_RATE, while it greys and before it crumbles.
export function knockoutJitter(t: number): number {
    if (t <= JITTER_AT || t >= CRUMBLE_AT) return 0
    return Math.floor(t * JITTER_RATE) % 2
}

// How much of a player's light (in fog) is left at `t`: all of it until
// LIGHT_FADE_AT, none by KNOCKOUT_SECONDS. A player out of play gives no
// light (see createFog in render.ts), so this keeps the one who fell lit
// while the effect plays.
export function knockoutLight(t: number): number {
    return 1 - clamp01((t - LIGHT_FADE_AT) / (KNOCKOUT_SECONDS - LIGHT_FADE_AT))
}

// A colour "#rrggbb" in one of four greys by its brightness (black stays
// black), as on the design page (its middle step moved so a grey stays
// itself). Other forms come back as they are.
export function grey(color: string): string {
    const rgb = parseHex(color)
    if (!rgb) return color
    const [r, g, b] = rgb
    if (r === 0 && g === 0 && b === 0) return color
    const l = (0.3 * r + 0.59 * g + 0.11 * b) / 255
    return l > 0.75
        ? "#fcfcfc"
        : l > 0.5
          ? "#bcbcbc"
          : l > 0.25
            ? "#7c7c7c"
            : "#3c3c3c"
}

// `from` mixed `k` (0 to 1) of the way to `to`, both "#rrggbb"; `from`
// for any other form.
export function mix(from: string, to: string, k: number): string {
    const a = parseHex(from)
    const b = parseHex(to)
    if (!a || !b || k <= 0) return from
    if (k >= 1) return to
    const hex = a
        .map((v, i) => Math.round(v + (b[i]! - v) * k))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")
    return `#${hex}`
}

function parseHex(color: string): [number, number, number] | undefined {
    const m = /^#([0-9a-f]{6})$/i.exec(color)
    if (!m) return undefined
    const n = parseInt(m[1]!, 16)
    return [n >> 16, (n >> 8) & 255, n & 255]
}

// A dot of the knockout to draw: where, in dots from the top-left of the
// sprite's grid (it may be outside it: the pile is wider), and its colour.
export type KnockoutDot = { x: number; y: number; color: string }

// The sprite's dots (`dots`, as spritePixels gives them) at `t`, for the
// knockout with `seed`: the sprite greying and jittering (unless
// `still`, for reduced motion), then crumbling into its pile.
export function knockoutDots(
    dots: Dots,
    t: number,
    seed: number,
    still = false
): KnockoutDot[] {
    const k = greyAmount(t)
    if (t < CRUMBLE_AT) {
        const dx = still ? 0 : knockoutJitter(t)
        const out: KnockoutDot[] = []
        dots.forEach((row, y) =>
            row.forEach((color, x) => {
                if (color === null) return
                out.push({ x: x + dx, y, color: mix(color, grey(color), k) })
            })
        )
        return out
    }
    return crumble(dots, seed).map((p) => {
        const q = clamp01((t - p.start) / FALL_SECONDS)
        return {
            x: Math.round(p.x0 + (p.x1 - p.x0) * q),
            y: Math.round(p.y0 + (p.y1 - p.y0) * q * q),
            color: p.color,
        }
    })
}

type Crumb = {
    x0: number
    y0: number
    x1: number
    y1: number
    color: string
    start: number
}

// Each dot's fall: from where it is to its place in the pile, starting at
// `start`. The bottom rows go first, the top last.
export function crumble(dots: Dots, seed: number): Crumb[] {
    const h = dots.length
    const w = dots[0]?.length ?? 0
    const shown: { x: number; y: number; color: string }[] = []
    dots.forEach((row, y) =>
        row.forEach((color, x) => {
            if (color !== null) shown.push({ x, y, color })
        })
    )
    // Bottom row first, left to right.
    shown.sort((p, q) => q.y - p.y || p.x - q.x)
    const slots = pileSlots(w, h)
    const n = shown.length
    return shown.map((p, i) => {
        // Spread over the pile, bottom up, the top dots on its top.
        const slot =
            slots[n > slots.length ? Math.floor((i * slots.length) / n) : i]!
        const row = h > 1 ? p.y / (h - 1) : 1
        return {
            x0: p.x,
            y0: p.y,
            x1: slot.x,
            y1: slot.y,
            color: grey(p.color),
            start:
                CRUMBLE_AT +
                (1 - row) * CRUMBLE_SPREAD +
                hash01(seed + i * 7919) * CRUMBLE_RANDOM,
        }
    })
}

// The pile's places, bottom row first, left to right: a low mound on the
// sprite's bottom row, a little wider than the sprite (it stays within its
// cell: the sprite is SPRITE_SCALE of it), narrowing by two dots each side
// per row.
export function pileSlots(w: number, h: number): Vec2[] {
    const slots: Vec2[] = []
    const base = w + 2 * Math.round(w * 0.1)
    for (let row = 0, width = base; width >= 2 && row < h; row++) {
        const left = (w - width) / 2
        for (let i = 0; i < width; i++) {
            slots.push(vec2(Math.round(left + i), h - 1 - row))
        }
        width -= 4
    }
    return slots
}
