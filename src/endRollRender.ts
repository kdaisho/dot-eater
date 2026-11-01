// Draws the end roll (endRoll.ts) on its own 256x224 canvas, in the look
// of the title's Gold style: a night sky, a UFO spotlighting each card, thick gold
// cards whose portraits are mosaics of raised tiles, speed lines, and
// THE END in extruded block letters. Every frame is drawn from the time
// alone, so it can be paused, skipped or redrawn anywhere. DOM: it makes
// the cards' offscreen canvases. No listeners or timers.

import "@fontsource/press-start-2p/latin-400.css"
import { DIFFICULTY_LABELS, type Difficulty } from "./difficulty"
import {
    CAST,
    END_ROLL,
    cardStage,
    endingKind,
    endRollPhase,
    FINALE_AT,
    scale2x,
    staffAt,
    lampPower,
    ufoAt,
    STAFF,
    type CastCard,
} from "./endRoll"

export const END_ROLL_WIDTH = 256
export const END_ROLL_HEIGHT = 224
const W = END_ROLL_WIDTH
const H = END_ROLL_HEIGHT
const FONT = '8px "Press Start 2P"'

const C = {
    black: "#000000",
    white: "#fcfcfc",
    gold: "#f8b800",
    grey: "#7c7c7c",
    red: "#d82800",
    pink: "#f8b8f8",
    tan: "#fca044",
    sky: "#3cbcfc",
    lime: "#b8f818",
    menu: "#fca044",
    copy: "#f878f8",
    beam: "#fcd880",
    cream: "#fcf0d0",
}
// The title's Gold logo colours.
const GOLD = {
    bg: "#08001c",
    face: "#f8b800",
    light: "#fce0a8",
    side: "#ac7c00",
    dark: "#401800",
}

type Ctx = CanvasRenderingContext2D

// ---------- sprites ----------

// Rows of palette letters, "." clear. The heroes and the boss are the
// title's; the enemies are pixel takes on their emoji.
const SPRITES: Record<string, readonly string[]> = {
    dragon: [
        "...GGG..",
        "..GGWKG.",
        "..GGGGGR",
        "GGGGYY..",
        ".GGGYYG.",
        "..GGGGG.",
        "..G..G..",
        "........",
    ],
    penguin: [
        "..KKKK..",
        ".KKWWKK.",
        ".KWKKWK.",
        ".KWWOWK.",
        "KKWWWWKK",
        ".KWWWWK.",
        ".KWWWWK.",
        "..O..O..",
    ],
    owl: [
        ".B....B.",
        ".BBBBBB.",
        "BWWBBWWB",
        "BWKBBKWB",
        "BBBYYBBB",
        ".BTTTTB.",
        ".BTTTTB.",
        "..Y..Y..",
    ],
    skunk: [
        "......KK",
        ".....KWK",
        "..KKKWKK",
        ".KWWWWK.",
        "KKWKKKK.",
        "KKKKKK..",
        ".K..K...",
        "........",
    ],
    boar: [
        "........",
        ".D.DD...",
        "DBBBBBD.",
        "BBKBBBBB",
        "PPBBBBBB",
        "WBBBBBBB",
        ".BBBBBB.",
        ".D.D.D.D",
    ],
    tengu: [
        "..RRRR..",
        ".RRRRRR.",
        "RKWRRWKR",
        "RRRPPRRR",
        "RRRRPPPP",
        ".RRRRRR.",
        "..RKKR..",
        "...RR...",
    ],
    oni: [
        ".W....W.",
        ".RRRRRR.",
        "RRKRRKRR",
        "RRRRRRRR",
        "RWRWWRWR",
        ".RRRRRR.",
        ".R.RR.R.",
        "RR....RR",
    ],
    fox: [
        ".O.O....",
        ".OOO....",
        "KOOOOOO.",
        "WWOOOOOO",
        "..OOOOOO",
        "..OOOOWO",
        "..O.O..W",
        "........",
    ],
    robot: [
        "...S....",
        ".SSSSSS.",
        ".SRSSRS.",
        ".SSSSSS.",
        "SSKKKKSS",
        ".SSSSSS.",
        ".S....S.",
        "SS....SS",
    ],
    ghost: [
        "..WWWW..",
        ".WWWWWW.",
        "WWKWWKWW",
        "WWKWWKWW",
        "WWWWWWWW",
        "WWWWWWWW",
        "WWWWWWWW",
        "W.WW.WW.",
    ],
    germ: [
        "L..L...L",
        ".LLLLLL.",
        "LLKLLKLL",
        "LLLLLLLL",
        "LLLKKLLL",
        ".LLLLLL.",
        "L..LL..L",
        "........",
    ],
    snake: [
        "........",
        ".GG.....",
        "GKGG....",
        "GGGG..G.",
        "RGGG.GGG",
        "..GGGG.G",
        "...GG...",
        "........",
    ],
    wolf: [
        "M.M.....",
        "MMM.....",
        "KMMMMMM.",
        "MMMMMMMM",
        "..MMMMMM",
        "..MMMMM.",
        "..M.M.M.",
        "........",
    ],
    boss: [
        "V..............V",
        "VV............VV",
        ".VV..VVVVVV..VV.",
        "..VVVVVVVVVVVV..",
        "...VVVVVVVVVV...",
        "..VEVVVVVVVVEV..",
        "..VVEEVVVVEEVV..",
        "..VVVEVVVVEVVV..",
        "...VVVVVVVVVV...",
        "..VVFVFVVFVFVV..",
        "..VVVVVVVVVVVV..",
        ".VVVVVVVVVVVVVV.",
        "VV.VVVVVVVVVV.VV",
        "V..VV.VVVV.VV..V",
        "...V...VV...V...",
    ],
    // Claude Code's mascot, for the staff credit.
    claude: [
        ".CCCCCCCC.",
        ".CKCCCCKC.",
        "CCCCCCCCCC",
        ".CCCCCCCC.",
        ".C.C..C.C.",
    ],
    ufo: ["...FFF...", ".SSSSSSS.", "SESYSESYS", ".SSSSSSS."],
    // The spotlight's UFO: a classic flying saucer, its dome with portholes
    // on a wide disc, red pods underneath and the lamp in the middle.
    saucer: [
        "...........KK...........",
        "..........KFSK..........",
        "........KKHHSSKK........",
        ".......KHFHSSSSNK.......",
        "......KHHKSSKSSNNK......",
        "......KSSKSSKSSKNK......",
        "....KKSSSSSSSSSSNNKK....",
        "..KKHHHHHHSSSSSSSSNNKK..",
        ".KHFFHHHHHHSSSSSSSSSNNK.",
        "KNNNNNNNNNNNNNNNNNNNNNNK",
        ".KKMMMMMMMMMMMMMMMMMMKK.",
        "...KKEEK..KNNK..KEEKK...",
        "....KEEK...KK...KEEK....",
        ".....KK..........KK.....",
    ],
    crown: [
        "........",
        "........",
        "........",
        "........",
        "Y..Y..Y.",
        "YYYYYYY.",
        "YRYYYRY.",
        "YYYYYYY.",
    ],
}
const PALETTE: Record<string, string> = {
    G: "#00a800",
    W: C.white,
    K: C.black,
    Y: C.gold,
    R: C.red,
    O: C.tan,
    C: "#d97757",
    B: "#ac7c00",
    T: C.tan,
    D: "#503000",
    P: C.pink,
    V: "#9878f8",
    S: "#bcbcbc",
    L: C.lime,
    M: C.grey,
    E: C.red,
    F: C.white,
    H: "#e4e4e4",
    N: "#4c4c4c",
}
const HERO_SPRITES = CAST.filter((c) => c.who.kind === "animal").map(
    (c) => c.sprite
)

// ---------- helpers ----------

function rect(g: Ctx, x: number, y: number, w: number, h: number, col: string) {
    g.fillStyle = col
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function text(
    g: Ctx,
    s: string,
    x: number,
    y: number,
    col: string,
    align: CanvasTextAlign = "center"
) {
    g.font = FONT
    g.textAlign = align
    g.textBaseline = "top"
    g.fillStyle = col
    g.fillText(s, Math.round(x), Math.round(y))
}

const typed = (s: string, t: number, cps = 40) =>
    s.slice(0, Math.max(0, Math.floor(t * cps)))
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
// A bouncy hop in 2 px steps, `hz` hops a second.
const hop = (t: number, hz = 2, h = 6) =>
    Math.round((Math.abs(Math.sin(t * Math.PI * hz)) * h) / 2) * 2
const blink = (t: number, hz = 1.6) => Math.floor(t * hz * 2) % 2 === 0
const easeOutBack = (p: number) => 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2
const easeIn = (p: number) => p * p * p

// The same "random" numbers every frame, so a scene doesn't flicker.
function seeded(seed: number) {
    let s = seed
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 4294967296
    }
}

// A colour lightened (f > 0) or darkened (f < 0).
function shade(hex: string, f: number): string {
    const n = parseInt(hex.slice(1), 16)
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) =>
        Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))
    )
    return `rgb(${ch.join(",")})`
}

function sprite(
    g: Ctx,
    name: string,
    x: number,
    y: number,
    s = 1,
    flip = false
) {
    for (const [j, row] of SPRITES[name].entries()) {
        for (let i = 0; i < row.length; i++) {
            const ch = row[i]
            if (ch === ".") continue
            const col = flip ? row.length - 1 - i : i
            rect(
                g,
                Math.round(x) + col * s,
                Math.round(y) + j * s,
                s,
                s,
                PALETTE[ch]
            )
        }
    }
}

// ---------- block letters (the title's) ----------

const GLYPHS: Record<string, readonly string[]> = {
    T: ["11111", "..1..", "..1..", "..1..", "..1..", "..1..", "..1.."],
    H: ["1...1", "1...1", "1...1", "11111", "1...1", "1...1", "1...1"],
    E: ["11111", "1....", "1....", "1111.", "1....", "1....", "11111"],
    N: ["1...1", "11..1", "1.1.1", "1..11", "1...1", "1...1", "1...1"],
    D: ["1111.", "1...1", "1...1", "1...1", "1...1", "1...1", "1111."],
}
const CELL = 4
const DEPTH = 4

// A word in extruded gold block letters, centred on cx. `rise` (0 to 1)
// pops the letters up one by one.
function blockWord(g: Ctx, word: string, cx: number, y: number, rise = 1) {
    const letters: { ch: string; x: number }[] = []
    let x = 0
    for (const ch of word) {
        if (ch === " ") {
            x += 10
            continue
        }
        letters.push({ ch, x })
        x += 5 * CELL + 4
    }
    const width = x - 4
    const cells: { x: number; y: number }[] = []
    letters.forEach((l, i) => {
        const p = clamp01(rise * (letters.length + 2) - i)
        if (p <= 0) return
        const pop = p < 1 ? Math.round((1 - p) * 8) * 2 - (p > 0.6 ? 4 : 0) : 0
        const wave = Math.round(Math.sin(i * 0.8) * 3)
        const left = cx - width / 2 + l.x
        GLYPHS[l.ch].forEach((row, r) => {
            for (let k = 0; k < row.length; k++) {
                if (row[k] === "1")
                    cells.push({
                        x: left + k * CELL,
                        y: y + wave + pop + r * CELL,
                    })
            }
        })
    })
    for (const c of cells)
        rect(g, c.x - 1, c.y - 1, CELL + 2, CELL + 2, GOLD.dark)
    for (let d = DEPTH; d >= 1; d--) {
        for (const c of cells) {
            rect(g, c.x + d - 1, c.y + d - 1, CELL + 2, CELL + 2, GOLD.dark)
            rect(g, c.x + d, c.y + d, CELL, CELL, GOLD.side)
        }
    }
    for (const c of cells) {
        rect(g, c.x, c.y, CELL, CELL, GOLD.face)
        rect(g, c.x, c.y, CELL, 1, GOLD.light)
    }
}

// ---------- cards ----------

const CW = 96
const CH = 120
const MW = 32
const MH = 40
const CARD_DEPTH = 5

type Card = {
    face: HTMLCanvasElement
    side: HTMLCanvasElement
    mini: HTMLCanvasElement
    miniSide: HTMLCanvasElement
}

function canvasOf(w: number, h: number): [HTMLCanvasElement, Ctx] {
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const g = canvas.getContext("2d")
    if (!g) throw new Error("no 2d context")
    return [canvas, g]
}

// A rounded rectangle in pixel steps: corner radius 4, or 1 when small.
function rounded(
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
function side(w: number, h: number, small: boolean): HTMLCanvasElement {
    const [canvas, g] = canvasOf(w, h)
    rounded(g, 0, 0, w, h, GOLD.dark, small)
    rounded(g, 1, 0, w - 2, h - 1, GOLD.side, small)
    return canvas
}

// The portrait as a grid of palette letters: 8x8 sprites doubled by
// Scale2x, the boss (already 16 wide) as it is.
function portrait(name: string): readonly string[] {
    const rows = SPRITES[name]
    return rows[0].length >= 16 ? rows : scale2x(rows)
}

function makeCard(card: CastCard, n: number): Card {
    const rows = portrait(card.sprite)
    const pw = rows[0].length
    const [face, f] = canvasOf(CW, CH)
    rounded(f, 0, 0, CW, CH, GOLD.dark)
    rounded(f, 1, 1, CW - 2, CH - 2, GOLD.side)
    rounded(f, 1, 1, CW - 3, CH - 3, GOLD.light)
    rounded(f, 2, 2, CW - 4, CH - 4, GOLD.face)
    rounded(f, 6, 6, CW - 12, CH - 12, GOLD.dark)
    rounded(f, 7, 7, CW - 14, CH - 14, C.cream)
    // The mosaic: 4 px blocks, each a 3 px tile with a seam, the
    // character's with a lit corner.
    const px = 4
    const ox = (CW - pw * px) / 2
    const oy = 12 + (64 - rows.length * px) / 2
    rect(f, ox - 2, oy - 2, pw * px + 4, rows.length * px + 4, GOLD.dark)
    rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
            const empty = row[i] === "."
            const col = empty ? card.tile : PALETTE[row[i]]
            const x = ox + i * px
            const y = oy + j * px
            rect(f, x, y, px, px, shade(col, empty ? -0.18 : -0.3))
            rect(f, x, y, px - 1, px - 1, col)
            if (!empty) rect(f, x, y, 1, 1, shade(col, 0.5))
        }
    })
    // The nameplate: the card's number on a gold bar.
    const py = 84
    rect(f, 14, py, CW - 28, 14, GOLD.dark)
    rect(f, 15, py + 1, CW - 30, 12, GOLD.face)
    rect(f, 15, py + 1, CW - 30, 1, GOLD.light)
    text(f, `No.${String(n + 1).padStart(2, "0")}`, CW / 2, py + 4, GOLD.dark)
    // The small card for the finale grid: 1 px per portrait cell.
    const [mini, m] = canvasOf(MW, MH)
    rounded(m, 0, 0, MW, MH, GOLD.dark, true)
    rounded(m, 1, 1, MW - 2, MH - 2, GOLD.face, true)
    rect(m, 1, 1, MW - 2, 1, GOLD.light)
    rect(m, 3, 3, MW - 6, MH - 6, C.cream)
    const mx = (MW - pw) / 2
    const my = 6
    rect(m, mx - 1, my - 1, pw + 2, 18, GOLD.dark)
    rect(m, mx, my, pw, 16, card.tile)
    rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
            if (row[i] !== ".")
                rect(
                    m,
                    mx + i,
                    my + j + (16 - rows.length) / 2,
                    1,
                    1,
                    PALETTE[row[i]]
                )
        }
    })
    rect(m, 8, 29, MW - 16, 4, GOLD.dark)
    rect(m, 9, 30, MW - 18, 2, GOLD.face)
    return {
        face,
        side: side(CW, CH, false),
        mini,
        miniSide: side(MW, MH, true),
    }
}

// The cards are made once the font has loaded (their number is text), and
// made again if they were first made without it.
let cards: Card[] | undefined
let cardsHaveFont = false
function fontReady(): boolean {
    try {
        return document.fonts.check(FONT)
    } catch {
        return true
    }
}
function cardsNow(): Card[] {
    const ready = fontReady()
    if (!cards || (ready && !cardsHaveFont)) {
        cards = CAST.map(makeCard)
        cardsHaveFont = ready
    }
    return cards
}

// Starts loading the font; call when the end roll comes on.
export function loadEndRollFont() {
    try {
        void document.fonts.load(FONT).catch(() => undefined)
    } catch {
        // No font loading API: the fallback font is used.
    }
}

// A canvas to put the moving shine on a card face.
let shineCanvas: [HTMLCanvasElement, Ctx] | undefined

function drawCard(g: Ctx, card: Card, cx: number, cy: number, shine = -1) {
    let src = card.face
    if (shine >= 0) {
        shineCanvas ??= canvasOf(CW, CH)
        const [canvas, s] = shineCanvas
        s.clearRect(0, 0, CW, CH)
        s.drawImage(card.face, 0, 0)
        s.globalCompositeOperation = "source-atop"
        s.globalAlpha = 0.5
        const sx = Math.round(-40 + shine * (CW + 80))
        for (let y = 0; y < CH; y++) {
            rect(s, sx + y / 2 - 30, y, 8, 1, C.white)
            rect(s, sx + y / 2 - 18, y, 3, 1, C.white)
        }
        s.globalAlpha = 1
        s.globalCompositeOperation = "source-over"
        src = canvas
    }
    const x = Math.round(cx - CW / 2)
    const y = Math.round(cy - CH / 2)
    for (let d = CARD_DEPTH; d >= 1; d--) g.drawImage(card.side, x + d, y + d)
    g.drawImage(src, x, y)
}

function drawMini(g: Ctx, card: Card, cx: number, cy: number) {
    const x = Math.round(cx - MW / 2)
    const y = Math.round(cy - MH / 2)
    for (let d = 2; d >= 1; d--) g.drawImage(card.miniSide, x + d, y + d)
    g.drawImage(card.mini, x, y)
}

// ---------- scenes ----------

const STARS = (() => {
    const r = seeded(7)
    return Array.from({ length: 60 }, () => [r() * W, r() * H, r()] as const)
})()

// The night sky; with `ufo`, the UFO passes at their times.
function backdrop(g: Ctx, t: number, withUfo = true) {
    rect(g, 0, 0, W, H, GOLD.bg)
    for (const [x, y, p] of STARS) {
        if ((t * 2 + p * 9) % 3 <= 0.5) continue
        g.globalAlpha = 0.3 + p * 0.6
        rect(g, x, y, 1, 1, p > 0.75 ? C.gold : C.white)
    }
    g.globalAlpha = 1
    if (withUfo) ufo(g, t)
}

// A beam from a lamp at (lx, ly) to a pool of light on the floor at tx, in
// 2 px steps. The bands add light, so the stars show through and the sky
// brightens instead of greying.
const POOL_Y = 136
function beam(g: Ctx, lx: number, ly: number, tx: number, power = 1) {
    const band = (alpha: number, scale: number) => {
        g.globalAlpha = alpha * power
        for (let y = ly; y < POOL_Y; y += 2) {
            const f = (y - ly) / (POOL_Y - ly)
            const cx = lx + (tx - lx) * f
            const hw = Math.round(((4 + f * 72) * scale) / 2) * 2
            rect(g, cx - hw, y, hw * 2, 2, C.beam)
        }
        for (let dy = -6; dy < 6; dy += 2) {
            const hw =
                Math.round((84 * scale * Math.sqrt(1 - (dy / 7) ** 2)) / 2) * 2
            rect(g, tx - hw, POOL_Y + dy, hw * 2, 2, C.beam)
        }
    }
    g.globalCompositeOperation = "lighter"
    band(0.13, 1)
    band(0.13, 0.75)
    band(0.12, 0.45)
    g.globalCompositeOperation = "source-over"
    g.globalAlpha = 1
}

// A lamp housing with its lit face, at the top of the screen.
// Specks of dust drifting through a corner beam.
function dust(g: Ctx, lx: number, tx: number, t: number) {
    const r = seeded(11)
    for (let i = 0; i < 18; i++) {
        const f = (r() + t * (0.03 + r() * 0.03)) % 1
        const y = 8 + f * (POOL_Y - 12)
        const cx = lx + (tx - lx) * (y / POOL_Y)
        const x = cx + (r() - 0.5) * (8 + f * 120) + Math.sin(t * 2 + i) * 3
        if ((t * 3 + i) % 2 < 0.4) continue
        g.globalAlpha = 0.5 + r() * 0.4
        rect(g, x, y, 1, 1, i % 3 ? C.cream : C.gold)
    }
    g.globalAlpha = 1
}

// The spotlight: a UFO hovering in the top-left corner shines its beam on
// the card at `cardX`, with dust in the beam. The beam stutters now and
// then (lampPower), as if the UFO's light were on the blink.
const LAMP_X = 28
function spotlight(g: Ctx, cardX: number, t: number) {
    const power = lampPower(t)
    const y = 1 + Math.round(Math.sin(t * Math.PI * 0.8)) * 2
    beam(g, LAMP_X, y + 26, cardX, power)
    if (power === 1) dust(g, LAMP_X, cardX, t)
    sprite(g, "saucer", LAMP_X - 24, y, 2)
    // The lamp under the middle: lit, or grey while it cuts out.
    rect(g, LAMP_X - 2, y + 24, 4, 2, power < 1 ? C.grey : C.white)
}

// The UFO that zips across now and then (ufoAt), with a short trail.
function ufo(g: Ctx, t: number) {
    const p = ufoAt(t)
    if (p === undefined) return
    const x = W + 12 - p * (W + 30)
    const y = 9 + Math.round(Math.sin(p * Math.PI * 3) * 2)
    g.globalAlpha = 0.5
    rect(g, x + 10, y + 2, 14, 1, C.sky)
    g.globalAlpha = 1
    sprite(g, "ufo", x, y)
}

// Speed lines trailing a card on the move.
function streaks(g: Ctx, cx: number, cy: number, t: number) {
    const r = seeded(Math.floor(t * 20) + 1)
    for (let i = 0; i < 7; i++) {
        const y = cy - 50 + r() * 100
        const len = 16 + r() * 30
        rect(g, cx + 52, y, len, 1, i % 2 ? C.white : C.gold)
    }
}

const CARD_Y = 76

function castCard(g: Ctx, all: Card[], index: number, u: number, t: number) {
    const { slideIn, slideOut, perCard } = END_ROLL
    const stage = cardStage(u)
    backdrop(g, t)
    const card = CAST[index]
    let x = W / 2
    let shine = -1
    let trail = false
    if (stage === "in") {
        x = W + 70 + (W / 2 - W - 70) * easeOutBack(u / slideIn)
        trail = u < slideIn * 0.8
    } else if (stage === "out") {
        const p = easeIn((u - (perCard - slideOut)) / slideOut)
        x = W / 2 + (-90 - W / 2) * p
        trail = p > 0.15
    } else if (u > slideIn + 0.25 && u < slideIn + 1.05) {
        // At rest the card stays still, so the portrait reads; one shine
        // sweeps across it.
        shine = (u - slideIn - 0.25) / 0.8
    }
    spotlight(g, x, t)
    if (trail) streaks(g, x, CARD_Y, t)
    drawCard(g, all[index], x, CARD_Y, shine)
    if (stage !== "rest" || u < slideIn + 0.05) return
    const v = u - slideIn - 0.05
    const boss = card.who.kind === "boss"
    text(g, typed(card.name, v), W / 2, 156, boss ? C.red : C.gold)
    text(g, typed(card.ability, v - 0.2), W / 2, 172, C.menu)
    text(g, typed(card.line, v - 0.5), W / 2, 190, C.white)
}

function finale(g: Ctx, all: Card[], v: number, t: number) {
    backdrop(g, t)
    // The cards are dealt into two rows of 7, each flying in from the
    // right; then a wave runs along the rows.
    all.forEach((card, i) => {
        const p = clamp01((v - 0.4 - i * 0.16) / 0.3)
        if (p <= 0) return
        const col = i % 7
        const row = Math.floor(i / 7)
        const tx = W / 2 + (col - 3) * 35
        const x = W + 40 + (tx - W - 40) * easeOutBack(p)
        const wave = v > 3.2 ? hop(v - col * 0.08 - row * 0.3, 1, 4) : 0
        drawMini(g, card, x, 44 + row * 50 - wave)
    })
    const staff = staffAt(v)
    if (staff) {
        const { role, names, icon } = STAFF[staff.index]
        text(g, typed(role, staff.shown, 30), W / 2, 140, C.menu)
        names.forEach((name, i) => {
            const y = 158 + i * 16
            const last = i === names.length - 1
            const shown = staff.shown - 0.3 - i * 0.5
            // With an icon, the name and the icon are centred together.
            const withIcon = last ? icon : undefined
            const iconW = withIcon ? SPRITES[withIcon][0].length * 2 + 6 : 0
            const x = W / 2 - iconW / 2
            text(g, typed(name, shown, 30), x, y, C.white)
            if (withIcon && shown * 30 >= name.length) {
                const left = x + (name.length * 8) / 2 + 6
                sprite(g, withIcon, left, y - 1 - hop(shown, 2, 2), 2)
            }
        })
    }
    // The heroes run along the bottom.
    if (v > 2) {
        HERO_SPRITES.forEach((h, i) => {
            const x = (((v - 2) * 30 - i * 18) % (W + 100)) - 20
            sprite(g, h, x, 196 - hop(v + i * 0.2, 2, 4), 2)
        })
    }
}

function theEnd(g: Ctx, u: number, y: number) {
    blockWord(g, "THE END", W / 2, y, clamp01(u / 1.4))
}

function ending(g: Ctx, all: Card[], u: number, difficulty: Difficulty) {
    backdrop(g, u, false)
    const kind = endingKind(difficulty)
    if (kind === "true") {
        // Super Hard: gold rain and the five hero cards wearing crowns.
        const r = seeded(5)
        for (let i = 0; i < 40; i++) {
            const x = r() * W
            const speed = 20 + r() * 30
            const y = (r() * H + u * speed) % H
            rect(g, x, y, 2, 2, r() > 0.5 ? C.gold : C.tan)
        }
        HERO_SPRITES.forEach((_, i) => {
            if (u < 0.4 + i * 0.25) return
            const x = 48 + i * 40
            const b = hop(u + i * 0.2, 1.5, 4)
            drawMini(g, all[i], x, 70 - b)
            sprite(g, "crown", x - 12, 30 - b, 3)
        })
        if (u > 2.5) theEnd(g, u - 2.5, 112)
        if (u > 5)
            text(g, "SUPER HARD", W / 2, 164, blink(u, 3) ? C.white : C.menu)
    } else if (kind === "party") {
        // Hard: the secret party. Everyone dances, the Phantom Lord too.
        theEnd(g, u, 22)
        const r = seeded(4)
        const colours = [C.pink, C.sky, C.gold, C.lime]
        for (let i = 0; i < 30; i++) {
            const x = r() * W
            const y = (r() * H + u * (30 + r() * 30)) % H
            rect(g, x, y, 2, 2, colours[i % 4])
        }
        CAST.filter((c) => c.who.kind !== "boss").forEach((c, i) => {
            if (u < 1 + i * 0.15) return
            const col = i % 7
            const row = Math.floor(i / 7)
            const flip = Math.floor(u * 2) % 2 === 1
            const y = 84 + row * 30 - hop(u + i * 0.25, 2, 8)
            sprite(g, c.sprite, 18 + col * 32 + row * 16, y, 2, flip)
        })
        if (u > 3) sprite(g, "boss", W / 2 - 24, 146 - hop(u, 2, 10), 3)
    } else {
        // Easy and Medium: the Dragon's card over THE END.
        if (u > 0.3) drawCard(g, all[0], W / 2, 66)
        theEnd(g, u - 0.8, 140)
        if (u > 3)
            text(
                g,
                DIFFICULTY_LABELS[difficulty].toUpperCase(),
                W / 2,
                182,
                C.menu
            )
    }
    if (u > 2) text(g, "©2026 DAISHODESIGN", W / 2, 204, C.copy)
}

// Draw the end roll at `t` seconds, for a run cleared on `difficulty`.
export function drawEndRoll(g: Ctx, t: number, difficulty: Difficulty) {
    g.imageSmoothingEnabled = false
    const all = cardsNow()
    const phase = endRollPhase(t)
    switch (phase.kind) {
        case "opening":
            backdrop(g, t)
            return spotlight(g, W / 2, t)
        case "card":
            return castCard(g, all, phase.index, phase.u, t)
        case "finale":
            return finale(g, all, phase.v, t)
        case "fade":
            finale(g, all, END_ROLL.ending - FINALE_AT, t)
            g.globalAlpha = phase.p
            rect(g, 0, 0, W, H, C.black)
            g.globalAlpha = 1
            return
        case "ending":
            return ending(g, all, phase.u, difficulty)
    }
}
