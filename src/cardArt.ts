// The cast cards' face, shared by the end roll (endRollRender.ts) and the
// Cards page (cardsView.ts): a thick gold frame round a cream window, the
// character's portrait as a mosaic of raised tiles from its sprite, and a
// nameplate with the card's number. The page's cards are taller and wider
// than the end roll's; the top of each is the same. DOM: it makes
// canvases. No listeners or timers.

import "@fontsource/press-start-2p/latin-400.css"
import type { CastCard } from "./endRoll"
import { SpriteId, spritePixels, type Dots } from "./sprites"

export type Ctx = CanvasRenderingContext2D

export const CARD_FONT = '8px "Press Start 2P"'

// The title's Gold logo colours.
export const GOLD = {
    bg: "#08001c",
    face: "#f8b800",
    light: "#fce0a8",
    side: "#ac7c00",
    dark: "#401800",
}
export const CREAM = "#fcf0d0"

// How thick a card is drawn: its side shows this many pixels down and to
// the right of its face.
export const CARD_DEPTH = 5

// The portrait window: its top, and its height (the nameplate is under it).
const WINDOW_TOP = 12
const WINDOW_H = 64
const PLATE_Y = 84

export function rect(
    g: Ctx,
    x: number,
    y: number,
    w: number,
    h: number,
    col: string
) {
    g.fillStyle = col
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

export function text(
    g: Ctx,
    s: string,
    x: number,
    y: number,
    col: string,
    align: CanvasTextAlign = "center"
) {
    g.font = CARD_FONT
    g.textAlign = align
    g.textBaseline = "top"
    g.fillStyle = col
    g.fillText(s, Math.round(x), Math.round(y))
}

// A colour lightened (f > 0) or darkened (f < 0).
export function shade(hex: string, f: number): string {
    const n = parseInt(hex.slice(1), 16)
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) =>
        Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))
    )
    return `rgb(${ch.join(",")})`
}

export function canvasOf(w: number, h: number): [HTMLCanvasElement, Ctx] {
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const g = canvas.getContext("2d")
    if (!g) throw new Error("no 2d context")
    return [canvas, g]
}

// A rounded rectangle in pixel steps: corner radius 4, or 1 when small.
export function rounded(
    g: Ctx,
    x: number,
    y: number,
    w: number,
    h: number,
    col: string,
    small = false
) {
    const cut = small ? [1] : [3, 2, 1, 1]
    cut.forEach((c, i) => {
        rect(g, x + c, y + i, w - 2 * c, 1, col)
        rect(g, x + c, y + h - 1 - i, w - 2 * c, 1, col)
    })
    rect(g, x, y + cut.length, w, h - 2 * cut.length, col)
}

// The card's thickness: its shape in the gold's shadow colours.
export function cardSide(w: number, h: number, small: boolean) {
    const [canvas, g] = canvasOf(w, h)
    rounded(g, 0, 0, w, h, GOLD.dark, small)
    rounded(g, 1, 0, w - 2, h - 1, GOLD.side, small)
    return canvas
}

// The portrait: the sprite's dots (no outline) less any clear rows at the
// top and bottom (the Kitsune's head room), and how many pixels a mosaic
// tile is: 4 for the 16x16 sprites, 3 for the bigger bosses, so every
// portrait fits the card's 64 px window.
export function portrait(id: SpriteId): { rows: Dots; px: number } {
    const dots = spritePixels({ id }, false)
    const filled = (row: Dots[number]) => row.some((c) => c !== null)
    const first = dots.findIndex(filled)
    const last = dots.length - 1 - [...dots].reverse().findIndex(filled)
    const rows = dots.slice(first, last + 1)
    const span = Math.max(rows.length, rows[0]?.length ?? 0)
    return { rows, px: span > 16 ? 3 : 4 }
}

// Card `card`'s face, No. `n + 1`, `w` x `h` with its top left at (0, 0):
// the frame and cream window, the portrait and the nameplate. Anything
// under the nameplate is cream, for the caller to fill.
export function drawCardFace(
    f: Ctx,
    card: CastCard,
    n: number,
    w: number,
    h: number
) {
    rounded(f, 0, 0, w, h, GOLD.dark)
    rounded(f, 1, 1, w - 2, h - 2, GOLD.side)
    rounded(f, 1, 1, w - 3, h - 3, GOLD.light)
    rounded(f, 2, 2, w - 4, h - 4, GOLD.face)
    rounded(f, 6, 6, w - 12, h - 12, GOLD.dark)
    rounded(f, 7, 7, w - 14, h - 14, CREAM)
    // The mosaic: px blocks, each a tile with a 1 px seam, the
    // character's with a lit corner.
    const { rows, px } = portrait(card.sprite)
    const pw = rows[0]!.length
    const ox = (w - pw * px) / 2
    const oy = WINDOW_TOP + (WINDOW_H - rows.length * px) / 2
    rect(f, ox - 2, oy - 2, pw * px + 4, rows.length * px + 4, GOLD.dark)
    rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
            const dot = row[i]
            const empty = dot === null || dot === undefined
            const col = empty ? card.tile : dot
            const x = ox + i * px
            const y = oy + j * px
            rect(f, x, y, px, px, shade(col, empty ? -0.18 : -0.3))
            rect(f, x, y, px - 1, px - 1, col)
            if (!empty) rect(f, x, y, 1, 1, shade(col, 0.5))
        }
    })
    // The nameplate: the card's number on a gold bar.
    rect(f, 14, PLATE_Y, w - 28, 14, GOLD.dark)
    rect(f, 15, PLATE_Y + 1, w - 30, 12, GOLD.face)
    rect(f, 15, PLATE_Y + 1, w - 30, 1, GOLD.light)
    text(f, cardNumber(n), w / 2, PLATE_Y + 4, GOLD.dark)
}

// "No.07" for the card at index 6.
export const cardNumber = (n: number) => `No.${String(n + 1).padStart(2, "0")}`

// Card `card`'s face as one canvas `w` x `h` plus its depth, drawn as the
// end roll draws a resting card (its side under the face). Without a 2D
// context it is left blank.
export function cardCanvas(
    card: CastCard,
    n: number,
    w: number,
    h: number
): HTMLCanvasElement {
    const canvas = document.createElement("canvas")
    canvas.width = w + CARD_DEPTH
    canvas.height = h + CARD_DEPTH
    const g = canvas.getContext("2d")
    if (!g) return canvas
    const [face, f] = canvasOf(w, h)
    drawCardFace(f, card, n, w, h)
    const side = cardSide(w, h, false)
    for (let d = CARD_DEPTH; d >= 1; d--) g.drawImage(side, d, d)
    g.drawImage(face, 0, 0)
    return canvas
}

// Whether the cards' font has loaded (their number is text). Without the
// font loading API it counts as loaded: the fallback font is used.
export function cardFontReady(): boolean {
    try {
        return document.fonts.check(CARD_FONT)
    } catch {
        return true
    }
}

// Starts loading the cards' font.
export function loadCardFont() {
    try {
        void document.fonts.load(CARD_FONT).catch(() => undefined)
    } catch {
        // No font loading API: the fallback font is used.
    }
}
