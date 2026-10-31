// Draws the opening (opening.ts) on its own canvas over the page, at the
// console's 256x224 and scaled up to fit, with crisp pixels. Text uses a
// small built-in pixel font, so the opening needs no web font.

import {
    BOSS_ABOVE,
    LOGO_HOLD,
    logoTop,
    OPENING_CHOICES,
    OPENING_DRUM,
    OPENING_HEIGHT as H,
    OPENING_WIDTH as W,
    PACK,
    packLap,
    runnerX,
    shine,
    type OpeningChoice,
} from "./opening"

// What a frame needs: the stage and its clock, and the menu's state.
export type OpeningFrame = {
    stage: "gate" | "logo" | "title"
    seconds: number
    choice: OpeningChoice
    // Whether Continue can be picked; greyed out otherwise.
    canContinue: boolean
}

const BG = "#08001c"
const MENU = "#fca044"
const MENU_OFF = "#7c4800"
const COPY = "#f878f8"
const WHITE = "#fcfcfc"
const GOLD = "#f8b800"

type Ctx = CanvasRenderingContext2D

function rect(g: Ctx, x: number, y: number, w: number, h: number, c: string) {
    g.fillStyle = c
    g.fillRect(Math.round(x), Math.round(y), w, h)
}

// ---------- pixel font: 5x7 glyphs, drawn bold on an 8-pixel advance ----

const FONT: Readonly<Record<string, readonly string[]>> = {
    A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
    D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
    H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "0": [".###.", "#..##", "#.#.#", "#.#.#", "##..#", "#...#", ".###."],
    "2": [".###.", "#...#", "....#", "..##.", ".#...", "#....", "#####"],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "©": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#...#", ".###."],
    "▶": ["#....", "##...", "###..", "####.", "###..", "##...", "#...."],
}

// Text with its left edge at x (or centered on x), top at y.
function text(
    g: Ctx,
    s: string,
    x: number,
    y: number,
    color: string,
    center = false
) {
    const left = center ? x - (s.length * 8) / 2 : x
    s.split("").forEach((ch, i) => {
        const glyph = FONT[ch]
        if (!glyph) return
        glyph.forEach((row, r) =>
            row.split("").forEach((cell, c) => {
                if (cell === "#") rect(g, left + i * 8 + c, y + r, 2, 1, color)
            })
        )
    })
}

// ---------- sprites: 8x8 (the boss 16x15), letters keyed to colors ----

const SPRITES: Readonly<Record<string, readonly string[]>> = {
    // The final boss, a silhouette whose E eyes and F fangs light up.
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
    // The boss's minions, after the game's enemies, facing left.
    oni: [
        ".W....W.",
        ".RRRRRR.",
        "RRKRRKRR",
        "RRRRRRRR",
        "RWRWWRWR",
        ".RRRRRR.",
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
        "L.L.....",
        "LLL.....",
        "KLLLLLL.",
        "LLLLLLLL",
        "..LLLLLL",
        "..LLLLL.",
        "..L.L.L.",
        "........",
    ],
}
const PALETTE: Readonly<Record<string, string>> = {
    W: WHITE,
    K: "#000000",
    R: "#d82800",
    O: MENU,
    S: "#bcbcbc",
    G: "#00a800",
    L: "#7c7c7c",
}
const RUNNERS = ["oni", "fox", "robot", "snake", "wolf"] as const

function sprite(
    g: Ctx,
    name: string,
    x: number,
    y: number,
    scale: number,
    colors: Readonly<Record<string, string>> = PALETTE
) {
    SPRITES[name]!.forEach((row, j) =>
        row.split("").forEach((ch, i) => {
            const color = colors[ch]
            if (ch !== "." && color) {
                rect(g, x + i * scale, y + j * scale, scale, scale, color)
            }
        })
    )
}

// ---------- the Dot Eater logo: gold 3D block letters, the O a dot ----

const GLYPH: Readonly<Record<string, readonly string[]>> = {
    D: ["1111.", "1...1", "1...1", "1...1", "1...1", "1...1", "1111."],
    T: ["11111", "..1..", "..1..", "..1..", "..1..", "..1..", "..1.."],
    E: ["11111", "1....", "1....", "1111.", "1....", "1....", "11111"],
    A: [".111.", "1...1", "1...1", "11111", "1...1", "1...1", "1...1"],
    R: ["1111.", "1...1", "1...1", "1111.", "1.1..", "1..1.", "1...1"],
}
const B = 4 // pixels per glyph cell
const FACE = GOLD
const LIGHT = "#fce0a8"
const SIDE = "#ac7c00"
const DARK = "#401800"
const DEPTH = 4

// Each letter's left edge, the word centered on 0.
const LETTERS = (() => {
    const out: { ch: string; x: number }[] = []
    let x = 0
    for (const ch of "DOT EATER") {
        if (ch === " ") {
            x += 10
            continue
        }
        out.push({ ch, x })
        x += 5 * B + 4
    }
    const width = x - 4
    for (const l of out) l.x -= width / 2
    return out
})()
// The letters sit on a gentle wave.
const wave = (i: number) => Math.round(Math.sin(i * 0.8) * 3)

// A chunky pixel disc filling a letter's box: the O.
function disc(g: Ctx, x: number, y: number, color: string, grow = 0) {
    const r = 10 + grow
    const cx = x + 10
    const cy = y + 14
    for (let dy = -r; dy < r; dy += 2)
        for (let dx = -r; dx < r; dx += 2)
            if ((dx + 1) ** 2 + (dy + 1) ** 2 <= r * r)
                rect(g, cx + dx, cy + dy, 2, 2, color)
}

function logo(g: Ctx, top: number) {
    type Cell = { x: number; y: number; row: number; disc?: boolean }
    const cells: Cell[] = []
    LETTERS.forEach((l, i) => {
        const x = W / 2 + l.x
        const y = top + wave(i)
        if (l.ch === "O") return cells.push({ x, y, row: 0, disc: true })
        GLYPH[l.ch]!.forEach((row, r) =>
            row.split("").forEach((c, k) => {
                if (c === "1")
                    cells.push({ x: x + k * B, y: y + r * B, row: r })
            })
        )
    })
    // Outline, then the extruded side layer by layer, then the face.
    for (const c of cells) {
        if (c.disc) disc(g, c.x, c.y, DARK, 1)
        else rect(g, c.x - 1, c.y - 1, B + 2, B + 2, DARK)
    }
    for (let d = DEPTH; d >= 1; d--) {
        for (const c of cells) {
            if (c.disc) {
                disc(g, c.x + d, c.y + d, DARK, 1)
                disc(g, c.x + d, c.y + d, SIDE)
            } else {
                rect(g, c.x + d - 1, c.y + d - 1, B + 2, B + 2, DARK)
                rect(g, c.x + d, c.y + d, B, B, SIDE)
            }
        }
    }
    for (const c of cells) {
        if (c.disc) {
            disc(g, c.x, c.y, FACE)
            rect(g, c.x + 5, c.y + 8, 4, 2, LIGHT)
            rect(g, c.x + 4, c.y + 10, 2, 3, LIGHT)
        } else {
            rect(g, c.x, c.y, B, B, FACE)
            rect(g, c.x, c.y, B, 1, LIGHT)
        }
    }
}

// ---------- the boss, its minions, the shine ----

const BOSS_SCALE = 5
const SHADOW = "#2c1858"
const EYES: readonly (readonly [number, number])[] = [
    [4.5, 6.2],
    [11.5, 6.2],
]

// A four-point star of radius r centered on (cx, cy).
function star(g: Ctx, cx: number, cy: number, r: number, diagonal?: string) {
    rect(g, cx - r, cy, 2 * r + 1, 1, WHITE)
    rect(g, cx, cy - r, 1, 2 * r + 1, WHITE)
    if (diagonal) {
        for (let k = 1; k <= Math.round(r / 2.5); k++) {
            for (const [sx, sy] of [
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1],
            ] as const) {
                rect(g, cx + sx * k, cy + sy * k, 1, 1, diagonal)
            }
        }
    }
    rect(g, cx - 1, cy - 1, 3, 3, WHITE)
}

// Dark until the drum; then red eyes that pulse, a glint on each, fangs.
function boss(g: Ctx, top: number, seconds: number) {
    const x = W / 2 - 8 * BOSS_SCALE
    const y = top - BOSS_ABOVE
    const lit = seconds >= OPENING_DRUM
    const since = seconds - OPENING_DRUM
    const pulse = lit ? 0.75 + 0.25 * Math.sin(since * 6) : 0
    const eye = lit
        ? `rgb(${Math.round(200 + 55 * pulse)},${Math.round(40 * pulse)},0)`
        : SHADOW
    sprite(g, "boss", x, y, BOSS_SCALE, {
        V: SHADOW,
        E: eye,
        F: lit ? WHITE : SHADOW,
    })
    if (!lit) return
    g.globalAlpha = 0.18 + 0.12 * pulse
    for (const [ex, ey] of EYES) {
        rect(
            g,
            x + ex * BOSS_SCALE - 9,
            y + ey * BOSS_SCALE - 6,
            18,
            12,
            "#f83800"
        )
    }
    g.globalAlpha = 1
    if (since < 0.6) {
        const r = Math.round(Math.sin((since / 0.6) * Math.PI) * 7)
        for (const [ex, ey] of EYES) {
            star(g, x + ex * BOSS_SCALE, y + ey * BOSS_SCALE, r)
        }
    }
}

function stampede(g: Ctx, seconds: number) {
    const lap = packLap(seconds)
    if (lap === undefined) return
    PACK.forEach(([lag, dy], k) => {
        const x = runnerX(lag, lap)
        if (x < -20 || x > W + 4) return
        const hop = Math.floor(lap * 10 + k) % 2
        sprite(g, RUNNERS[k]!, x, 174 + dy - hop, 2)
    })
}

// The top-right corner of the R, after each run.
function cornerShine(g: Ctx, top: number, seconds: number) {
    const share = shine(seconds)
    if (share === undefined) return
    const last = LETTERS.length - 1
    const cx = W / 2 + LETTERS[last]!.x + 5 * B
    const cy = top + wave(last)
    star(g, cx, cy, Math.round(Math.sin(share * Math.PI) * 9), LIGHT)
}

// ---------- screens ----------

function studioLogo(g: Ctx, prompt: boolean, seconds: number) {
    rect(g, 0, 0, W, H, "#000000")
    // The mark: a 3x3 grid of pixel dots, the middle one gold.
    const mx = W / 2 - 13
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
            rect(
                g,
                mx + c * 10,
                64 + r * 10,
                6,
                6,
                r === 1 && c === 1 ? GOLD : WHITE
            )
    const x0 = W / 2 - 48
    text(g, "DAISHO", x0, 106, WHITE)
    text(g, "DESIGN", x0 + 48, 106, GOLD)
    rect(g, x0, 118, 47, 2, WHITE)
    rect(g, x0 + 48, 118, 48, 2, GOLD)
    if (prompt && Math.floor(seconds * 1.6) % 2 === 0) {
        text(g, "PUSH ANY BUTTON", W / 2, 168, "#7c7c7c", true)
    }
}

function title(g: Ctx, f: OpeningFrame) {
    const t = f.seconds
    rect(g, 0, 0, W, H, BG)
    g.save()
    // A short shake on the drum hit.
    if (t >= OPENING_DRUM && t < OPENING_DRUM + 0.35) {
        g.translate(
            Math.floor(t * 40) % 2 ? 3 : -3,
            Math.floor(t * 30) % 2 ? 2 : -1
        )
    }
    const top = logoTop(t)
    boss(g, top, t)
    logo(g, top)
    cornerShine(g, top, t)
    if (t >= OPENING_DRUM) {
        OPENING_CHOICES.forEach((choice, i) => {
            const off = choice === "continue" && !f.canContinue
            const label = choice === "start" ? "START" : "CONTINUE"
            text(g, label, 104, 128 + i * 16, off ? MENU_OFF : MENU)
        })
        text(g, "▶", 90, 128 + OPENING_CHOICES.indexOf(f.choice) * 16, MENU)
        text(g, "©2026 DAISHODESIGN", W / 2, 196, COPY, true)
        stampede(g, t)
    }
    g.restore()
    // A white flash the moment the drum hits.
    const since = t - OPENING_DRUM
    if (since >= 0 && since < 0.3) {
        g.globalAlpha = 0.85 * (1 - since / 0.3)
        rect(g, 0, 0, W, H, WHITE)
        g.globalAlpha = 1
    }
}

export function drawOpening(g: Ctx, f: OpeningFrame) {
    if (f.stage === "gate") studioLogo(g, true, f.seconds)
    else if (f.stage === "logo") {
        if (f.seconds < LOGO_HOLD) studioLogo(g, false, f.seconds)
        else rect(g, 0, 0, W, H, "#000000")
    } else title(g, f)
}

// Which menu item a point on the screen (in 256x224 pixels) is on, if any:
// the rows of Start and Continue.
export function openingItemAt(x: number, y: number): OpeningChoice | undefined {
    if (x < 80 || x > 184) return undefined
    const row = Math.floor((y - 124) / 16)
    return OPENING_CHOICES[row]
}

// The opening's canvas: made on first show, laid over the page.
export type OpeningLayer = {
    show(frame: OpeningFrame): void
    hide(): void
    // A point in the page, as a point on the screen (256x224), or
    // undefined when the layer isn't showing. The canvas covers the window
    // and letterboxes the screen in it (object-fit: contain).
    toScreen(
        clientX: number,
        clientY: number
    ): { x: number; y: number } | undefined
}

export function createOpeningLayer(doc: Document): OpeningLayer {
    let canvas: HTMLCanvasElement | undefined
    let context: Ctx | null = null
    return {
        show(frame) {
            if (!canvas) {
                canvas = doc.createElement("canvas")
                canvas.id = "opening"
                canvas.width = W
                canvas.height = H
                canvas.setAttribute("aria-label", "Dot Eater opening")
                doc.body.append(canvas)
                context = canvas.getContext("2d")
            }
            canvas.hidden = false
            if (context) drawOpening(context, frame)
        },
        hide() {
            if (canvas) canvas.hidden = true
        },
        toScreen(clientX, clientY) {
            if (!canvas || canvas.hidden) return undefined
            const box = canvas.getBoundingClientRect()
            const scale = Math.min(box.width / W, box.height / H)
            if (!(scale > 0)) return undefined
            const left = box.left + (box.width - W * scale) / 2
            const top = box.top + (box.height - H * scale) / 2
            return {
                x: (clientX - left) / scale,
                y: (clientY - top) / scale,
            }
        },
    }
}
