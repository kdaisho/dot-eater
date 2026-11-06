// Draws the end roll (endRoll.ts) on its own 256x224 canvas, in the look
// of the title's Gold style: a night sky, a UFO spotlighting each card, thick gold
// cards whose portraits are mosaics of raised tiles, speed lines, and
// THE END in extruded block letters. Its words are in the ending's 5x7
// pixel font (pixelFont.ts, upper case only); only the cards' numbers
// keep the cards' web font. Every frame is drawn from the time
// alone, so it can be paused, skipped or redrawn anywhere. DOM: it makes
// the cards' offscreen canvases. No listeners or timers.

import {
    CARD_DEPTH,
    cardFontReady,
    cardSide,
    canvasOf,
    CREAM,
    drawCardFace,
    GOLD,
    loadCardFont,
    portrait,
    rect,
    rounded,
    type Ctx,
} from "./cardArt"
import { DIFFICULTY_LABELS, type Difficulty } from "./difficulty"
import {
    CAST,
    END_ROLL,
    beamX,
    cardStage,
    cardX,
    endingKind,
    endRollPhase,
    FINALE_AT,
    staffAt,
    lampPower,
    ufoAt,
    STAFF,
    type CastCard,
} from "./endRoll"
import { blockWord, pixelText as text } from "./pixelFont"
import { drawPixels, SpriteId, SPRITES } from "./sprites"

export const END_ROLL_WIDTH = 256
export const END_ROLL_HEIGHT = 224
const W = END_ROLL_WIDTH
const H = END_ROLL_HEIGHT

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
    cream: CREAM,
}

// ---------- sprites ----------

// The characters are the game's sprites (sprites.ts). These are the end
// roll's own props: rows of palette letters, "." clear.
const PROPS: Record<string, readonly string[]> = {
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
    K: C.black,
    Y: C.gold,
    R: C.red,
    C: "#d97757",
    S: "#bcbcbc",
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

const typed = (s: string, t: number, cps = 40) =>
    s.slice(0, Math.max(0, Math.floor(t * cps)))
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
// A bouncy hop in 2 px steps, `hz` hops a second.
const hop = (t: number, hz = 2, h = 6) =>
    Math.round((Math.abs(Math.sin(t * Math.PI * hz)) * h) / 2) * 2
const blink = (t: number, hz = 1.6) => Math.floor(t * hz * 2) % 2 === 0
const easeOutBack = (p: number) => 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2

// The same "random" numbers every frame, so a scene doesn't flicker.
function seeded(seed: number) {
    let s = seed
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 4294967296
    }
}

function prop(g: Ctx, name: string, x: number, y: number, s = 1) {
    for (const [j, row] of PROPS[name].entries()) {
        for (let i = 0; i < row.length; i++) {
            const ch = row[i]
            if (ch === ".") continue
            rect(
                g,
                Math.round(x) + i * s,
                Math.round(y) + j * s,
                s,
                s,
                PALETTE[ch]
            )
        }
    }
}

// ---------- cards ----------

const CW = 96
const CH = 120
const MW = 32
const MH = 40

type Card = {
    face: HTMLCanvasElement
    side: HTMLCanvasElement
    mini: HTMLCanvasElement
    miniSide: HTMLCanvasElement
}

// A side-view sprite faces left as drawn; mirrored, it runs right.
const runningRight = (id: SpriteId, frame = 0) => ({
    id,
    frame,
    mirror: SPRITES[id].side,
})

function makeCard(card: CastCard, n: number): Card {
    const { rows } = portrait(card.sprite)
    const pw = rows[0]!.length
    const [face, f] = canvasOf(CW, CH)
    drawCardFace(f, card, n, CW, CH)
    // The small card for the finale grid: 1 px per portrait cell, its
    // window 16 px tall or as tall as a boss.
    const [mini, m] = canvasOf(MW, MH)
    const mh = Math.max(16, rows.length)
    rounded(m, 0, 0, MW, MH, GOLD.dark, true)
    rounded(m, 1, 1, MW - 2, MH - 2, GOLD.face, true)
    rect(m, 1, 1, MW - 2, 1, GOLD.light)
    rect(m, 3, 3, MW - 6, MH - 6, C.cream)
    const mx = (MW - pw) / 2
    const my = 6
    rect(m, mx - 1, my - 1, pw + 2, mh + 2, GOLD.dark)
    rect(m, mx, my, pw, mh, card.tile)
    rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
            const dot = row[i]
            if (dot)
                rect(
                    m,
                    mx + i,
                    my + j + Math.floor((mh - rows.length) / 2),
                    1,
                    1,
                    dot
                )
        }
    })
    rect(m, 8, 29, MW - 16, 4, GOLD.dark)
    rect(m, 9, 30, MW - 18, 2, GOLD.face)
    return {
        face,
        side: cardSide(CW, CH, false),
        mini,
        miniSide: cardSide(MW, MH, true),
    }
}

// The cards are made once the font has loaded (their number is text), and
// made again if they were first made without it.
let cards: Card[] | undefined
let cardsHaveFont = false
function cardsNow(): Card[] {
    const ready = cardFontReady()
    if (!cards || (ready && !cardsHaveFont)) {
        cards = CAST.map(makeCard)
        cardsHaveFont = ready
    }
    return cards
}

// Starts loading the font; call when the end roll comes on.
export function loadEndRollFont() {
    loadCardFont()
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
// The card's bottom edge (with its depth) stands on the floor here, in the
// middle of the pool of light.
const POOL_Y = 141
const POOL_H = 14
// The pool of light's half width `dy` px above or below its middle: about
// one and a half cards wide.
const POOL_W = 80
const poolHalf = (dy: number) =>
    POOL_W * Math.sqrt(Math.max(0, 1 - ((dy + 1) / (POOL_H + 1)) ** 2))

function beam(g: Ctx, lx: number, ly: number, tx: number, power = 1) {
    const band = (alpha: number, scale: number) => {
        g.globalAlpha = alpha * power
        for (let y = ly; y < POOL_Y; y += 2) {
            const f = (y - ly) / (POOL_Y - ly)
            const cx = lx + (tx - lx) * f
            const hw = Math.round(((4 + f * 78) * scale) / 2) * 2
            rect(g, cx - hw, y, hw * 2, 2, C.beam)
        }
        // The floor catches more light than the air.
        g.globalAlpha = Math.min(1, alpha * power * 2.4)
        for (let dy = -POOL_H; dy < POOL_H; dy += 2) {
            const hw = Math.round((poolHalf(dy) * scale) / 2) * 2
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
const LAMP_Y = 27
// `beamTo` is where the beam points; a card at `cardX` casts its shadow.
function spotlight(g: Ctx, beamTo: number, t: number, cardX?: number) {
    const power = lampPower(t)
    const y = 1 + Math.round(Math.sin(t * Math.PI * 0.8)) * 2
    beam(g, LAMP_X, y + 26, beamTo, power)
    if (cardX !== undefined && power > 0.5) shadow(g, cardX)
    if (power === 1) dust(g, LAMP_X, beamTo, t)
    prop(g, "saucer", LAMP_X - 24, y, 2)
    // The lamp under the middle: lit, or grey while it cuts out.
    rect(g, LAMP_X - 2, y + 24, 4, 2, power < 1 ? C.grey : C.white)
}

// The card's shadow on the floor: the light comes from the UFO at the top
// left, so it falls from the card's bottom edge down and to the right, both
// edges slanting the same way, and fades as it goes.
const SHADOW_ROWS = 18
function shadow(g: Ctx, cardX: number) {
    const left = cardX - CW / 2 + 2
    const right = cardX + CW / 2 + CARD_DEPTH
    const slope = ((cardX - LAMP_X) / (POOL_Y - LAMP_Y)) * 1.4
    for (let d = 0; d < SHADOW_ROWS; d += 2) {
        g.globalAlpha = 0.8 - (d / SHADOW_ROWS) * 0.5
        const shift = slope * (d + 2)
        rect(g, left + shift, POOL_Y + d, right - left, 2, GOLD.bg)
    }
    g.globalAlpha = 1
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
    prop(g, "ufo", x, y)
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
    const { slideIn, slideOut, perCard, fetch } = END_ROLL
    const stage = cardStage(u)
    backdrop(g, t)
    const card = CAST[index]
    const x = cardX(u)
    spotlight(g, beamX(t), t, x)
    if (x === undefined) return
    let shine = -1
    if (stage === "in" && u < slideIn * 0.8) streaks(g, x, CARD_Y, t)
    if (stage === "out" && u - (perCard - fetch - slideOut) > slideOut * 0.5)
        streaks(g, x, CARD_Y, t)
    if (stage === "rest" && u > slideIn + 0.25 && u < slideIn + 1.05) {
        // At rest the card stays still, so the portrait reads; one shine
        // sweeps across it.
        shine = (u - slideIn - 0.25) / 0.8
    }
    drawCard(g, all[index], x, CARD_Y, shine)
    if (stage !== "rest" || u < slideIn + 0.05) return
    const v = u - slideIn - 0.05
    const boss = card.who.kind === "boss"
    text(g, typed(card.name, v), W / 2, 166, boss ? C.red : C.gold)
    text(g, typed(card.ability, v - 0.2), W / 2, 182, C.menu)
    text(g, typed(card.line, v - 0.5), W / 2, 200, C.white)
}

// The finale's layout (KDA-323): the grid's rows (mini cards' middles)
// from GRID_TOP, GRID_PITCH apart, so the grid ends at y 118; the staff
// from STAFF_Y to about 176; the heroes run at 196 to 212; © at 214.
const GRID_TOP = 22
const GRID_PITCH = 38
const STAFF_Y = 132

function finale(g: Ctx, all: Card[], v: number, t: number) {
    backdrop(g, t)
    // The cards are dealt into three rows of 5 (the heroes, then the
    // enemies and the bosses), each flying in from the right; then a wave
    // runs along the rows.
    all.forEach((card, i) => {
        const p = clamp01((v - 0.4 - i * 0.16) / 0.3)
        if (p <= 0) return
        const col = i % 5
        const row = Math.floor(i / 5)
        const tx = W / 2 + (col - 2) * 40
        const x = W + 40 + (tx - W - 40) * easeOutBack(p)
        const wave = v > 3.2 ? hop(v - col * 0.08 - row * 0.3, 1, 4) : 0
        drawMini(g, card, x, GRID_TOP + row * GRID_PITCH - wave)
    })
    const staff = staffAt(v)
    if (staff) {
        const { role, names, icon } = STAFF[staff.index]
        text(g, typed(role, staff.shown, 30), W / 2, STAFF_Y, C.menu)
        names.forEach((name, i) => {
            const y = STAFF_Y + 18 + i * 14
            const last = i === names.length - 1
            const shown = staff.shown - 0.3 - i * 0.5
            // With an icon, the name and the icon are centred together.
            const withIcon = last ? icon : undefined
            const iconW = withIcon ? PROPS[withIcon][0].length * 2 + 6 : 0
            const x = W / 2 - iconW / 2
            text(g, typed(name, shown, 30), x, y, C.white)
            if (withIcon && shown * 30 >= name.length) {
                const left = x + (name.length * 8) / 2 + 6
                prop(g, withIcon, left, y - 1 - hop(shown, 2, 2), 2)
            }
        })
    }
    // The heroes run right along the bottom, a step on each hop.
    if (v > 2) {
        HERO_SPRITES.forEach((h, i) => {
            const x = (((v - 2) * 30 - i * 18) % (W + 100)) - 20
            const step = Math.floor((v + i * 0.2) * 4) % 2
            drawPixels(
                g,
                runningRight(h, step),
                x,
                196 - hop(v + i * 0.2, 2, 4)
            )
        })
    }
    text(g, "©2026 DAISHODESIGN", W / 2, 214, C.copy)
}

function theEnd(g: Ctx, u: number, y: number) {
    blockWord(g, "THE END", W / 2, y, { rise: clamp01(u / 1.4) })
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
            prop(g, "crown", x - 12, 30 - b, 3)
        })
        if (u > 2.5) theEnd(g, u - 2.5, 112)
        if (u > 5)
            text(g, "SUPER HARD", W / 2, 164, blink(u, 3) ? C.white : C.menu)
    } else if (kind === "party") {
        // Hard: the secret party. Everyone dances, the bosses too.
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
            const look = flip ? runningRight(c.sprite) : { id: c.sprite }
            drawPixels(g, look, 18 + col * 32 + row * 16, y)
        })
        if (u > 3) {
            const b = hop(u, 2, 10)
            const kitsune = { id: SpriteId.kitsune }
            drawPixels(g, kitsune, W / 2 - 56, 136 - hop(u + 0.25, 2, 10), 2)
            drawPixels(g, { id: SpriteId.finalBoss }, W / 2 + 8, 146 - b, 2)
        }
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
            return spotlight(g, beamX(t), t)
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
