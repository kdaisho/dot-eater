// The ending's pixel confetti (KDA-323), in place of canvas-confetti: 2x2
// and 3x1 bits in the title's colours that flip as they fall. Fired at the
// final boss's clear jingle (from the middle) and by the story end card's
// poppers (from the bottom corners). Every bit's place comes from the time
// since the burst alone, so a frame can be drawn at any moment. Pure: it
// draws on a context it is given.

type Ctx = CanvasRenderingContext2D

// Seconds a burst lasts; its bits fade out over the last FADE of them.
export const CONFETTI_SECONDS = 3
const FADE = 0.8

export const CONFETTI_COLORS = [
    "#f8b800",
    "#f8b8f8",
    "#3cbcfc",
    "#b8f818",
    "#d82800",
    "#fcfcfc",
] as const

// Where a burst comes from: the middle of the picture, or both bottom
// corners at once.
export type ConfettiFrom = "middle" | "corners"

// The same "random" numbers every frame, so the bits don't jump about.
function hash01(n: number): number {
    let h = Math.imul(Math.floor(n) ^ 0x9e3779b9, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
}

const BITS = Array.from({ length: 110 }, (_, i) => {
    const side = i % 2
    return {
        side,
        // Up and out to either side.
        angle: -Math.PI / 2 + (side ? -1 : 1) * (0.15 + 0.6 * hash01(i + 300)),
        speed: 150 + 130 * hash01(i + 400),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        phase: hash01(i + 500),
    }
})

export type ConfettiBit = {
    x: number
    y: number
    w: number
    h: number
    color: string
    alpha: number
}

// The bits of a burst `t` seconds in, on a picture `w` x `h` px; none
// before it or once it is over.
export function confettiBits(
    t: number,
    from: ConfettiFrom,
    w: number,
    h: number
): ConfettiBit[] {
    if (t < 0 || t > CONFETTI_SECONDS) return []
    const alpha = Math.min(
        1,
        Math.max(0, 1 - (t - (CONFETTI_SECONDS - FADE)) / FADE)
    )
    // Thrown out fast, slowing in the air, falling ever faster.
    const drag = (1 - Math.exp(-2.2 * t)) / 2.2
    return BITS.map((b) => {
        const x0 = from === "corners" ? (b.side ? w - 6 : 6) : w / 2
        const y0 = from === "corners" ? h - 4 : h / 2
        const flip = Math.floor(t * 8 + b.phase * 4) % 2 === 1
        return {
            x: Math.round(
                x0 +
                    Math.cos(b.angle) * b.speed * drag +
                    Math.sin(t * 5 + b.phase * 9) * 4
            ),
            y: Math.round(y0 + Math.sin(b.angle) * b.speed * drag + 40 * t * t),
            w: flip ? 3 : 2,
            h: flip ? 1 : 2,
            color: b.color,
            alpha,
        }
    })
}

export function drawConfetti(
    g: Ctx,
    t: number,
    from: ConfettiFrom,
    w: number,
    h: number
) {
    for (const bit of confettiBits(t, from, w, h)) {
        g.globalAlpha = bit.alpha
        g.fillStyle = bit.color
        g.fillRect(bit.x, bit.y, bit.w, bit.h)
    }
    g.globalAlpha = 1
}
