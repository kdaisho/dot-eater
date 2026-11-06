// Draws the story end card (storyEnd.ts) on its own 256x224 canvas, clear
// round the card so the frozen maze shows through the backdrop: the end
// roll's gold frame on the night colour, ALL CLEAR in the title's block
// letters between two pixel party poppers, the lines typing in, and the
// poppers' pixel confetti. Every frame is drawn from the time alone. No
// DOM access, listeners or timers.

import { drawConfetti } from "./pixelConfetti"
import { blockWord, BLOCK_GOLD, pixelText } from "./pixelFont"
import {
    STORY_END,
    storyEndLines,
    typedLine,
    type StoryEndCard,
} from "./storyEnd"

type Ctx = CanvasRenderingContext2D

export const STORY_END_WIDTH = 256
export const STORY_END_HEIGHT = 224
const W = STORY_END_WIDTH
const H = STORY_END_HEIGHT

const NIGHT = "#08001c"
const MENU = "#fca044"
const WHITE = "#fcfcfc"

// The card, centred, and where it springs up from.
const CARD_X = 22
const CARD_W = 212
const CARD_H = 116
const CARD_Y = Math.round((H - CARD_H) / 2)
const CARD_DROP = 120
const LINE_Y = [56, 74, 90]

// A party popper, its cone at the bottom left, the bits flying out top
// right; "." clear. The right-hand one is its mirror image.
const POPPER = [
    ".Y...P..B",
    "....Y....",
    "..P...W..",
    "Y...OG...",
    "...OoO.P.",
    "..OoOO...",
    ".OoOO..Y.",
    "OoOO.....",
    "oO.......",
]
const POPPER_COLORS: Record<string, string> = {
    O: "#f87818",
    o: "#b8320a",
    Y: "#f8b800",
    P: "#f878f8",
    B: "#3cbcfc",
    W: "#fcfcfc",
    G: "#b8f818",
}
const POPPER_SCALE = 2
// With its 1-dot black outline.
const POPPER_SIZE = (POPPER[0]!.length + 2) * POPPER_SCALE

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOutBack = (p: number) => 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2

function fill(g: Ctx, x: number, y: number, w: number, h: number, c: string) {
    g.fillStyle = c
    g.fillRect(Math.round(x), Math.round(y), w, h)
}

// A rounded rectangle in pixel steps (corner radius 4), as the cards'.
function rounded(
    g: Ctx,
    x: number,
    y: number,
    w: number,
    h: number,
    c: string
) {
    const cut = [3, 2, 1, 1]
    cut.forEach((k, i) => {
        fill(g, x + k, y + i, w - 2 * k, 1, c)
        fill(g, x + k, y + h - 1 - i, w - 2 * k, 1, c)
    })
    fill(g, x, y + cut.length, w, h - 2 * cut.length, c)
}

// The popper with its left edge at x (mirrored: facing left), outlined in
// black.
function popper(g: Ctx, x: number, y: number, mirror: boolean) {
    const s = POPPER_SCALE
    const w = POPPER[0]!.length
    const at = (i: number, j: number) => {
        const row = POPPER[j]
        const ch = row?.[mirror ? w - 1 - i : i]
        return ch !== undefined && ch !== "." ? ch : undefined
    }
    // The outline: every clear dot next to a filled one, the border too.
    for (let j = -1; j <= POPPER.length; j++) {
        for (let i = -1; i <= w; i++) {
            if (at(i, j)) continue
            if (at(i + 1, j) || at(i - 1, j) || at(i, j + 1) || at(i, j - 1))
                fill(g, x + (i + 1) * s, y + (j + 1) * s, s, s, "#000000")
        }
    }
    for (let j = 0; j < POPPER.length; j++) {
        for (let i = 0; i < w; i++) {
            const ch = at(i, j)
            if (ch)
                fill(
                    g,
                    x + (i + 1) * s,
                    y + (j + 1) * s,
                    s,
                    s,
                    POPPER_COLORS[ch]!
                )
        }
    }
}

// The card `u` seconds in (see STORY_END).
export function drawStoryEnd(g: Ctx, u: number, card: StoryEndCard) {
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, W, H)
    const p = easeOutBack(clamp01(u / STORY_END.rise))
    const y0 = Math.round(CARD_Y + (1 - p) * CARD_DROP)
    rounded(g, CARD_X, y0, CARD_W, CARD_H, BLOCK_GOLD.dark)
    rounded(g, CARD_X + 1, y0 + 1, CARD_W - 2, CARD_H - 2, BLOCK_GOLD.side)
    rounded(g, CARD_X + 2, y0 + 2, CARD_W - 4, CARD_H - 6, BLOCK_GOLD.face)
    rounded(g, CARD_X + 6, y0 + 6, CARD_W - 12, CARD_H - 14, NIGHT)
    const rise = clamp01((u - STORY_END.titleFrom) / STORY_END.titleFor)
    blockWord(g, "ALL CLEAR", W / 2, y0 + 16, { rise, cell: 3, depth: 3 })
    if (u >= STORY_END.poppers) {
        popper(g, 34, y0 + 14, false)
        popper(g, W - 34 - POPPER_SIZE, y0 + 14, true)
    }
    storyEndLines(card).forEach((line, i) => {
        const shown = typedLine(line, i, u)
        // The difficulty in the menu's orange, the scores in white.
        pixelText(g, shown, W / 2, y0 + LINE_Y[i]!, i === 0 ? MENU : WHITE)
    })
    drawConfetti(g, u - STORY_END.poppers, "corners", W, H)
}

// What the card says, for screen readers.
export function storyEndLabel(card: StoryEndCard): string {
    const [difficulty, ...scores] = storyEndLines(card)
    const words = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()
    return ["All clear", difficulty, ...scores].map((s) => words(s!)).join(". ")
}
