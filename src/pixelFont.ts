// The ending's one pixel font (KDA-323): 5x7 glyphs, upper case only,
// drawn bold (each cell 2 px wide) on an 8 px advance, the size of the
// opening's. Also the title's extruded gold block letters, made of the
// same glyphs. Used by the story end card (storyEndView.ts) and the end
// roll (endRollRender.ts). Draws on a context it is given; no DOM.

type Ctx = CanvasRenderingContext2D

export const FONT: Readonly<Record<string, readonly string[]>> = {
    A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
    D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
    H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "0": [".###.", "#..##", "#.#.#", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "..##.", ".#...", "#....", "#####"],
    "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    ".": [".....", ".....", ".....", ".....", ".....", "..#..", "..#.."],
    ",": [".....", ".....", ".....", ".....", "..#..", "..#..", ".#..."],
    "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
    "?": [".###.", "#...#", "....#", "..##.", "..#..", ".....", "..#.."],
    "'": ["..#..", "..#..", ".....", ".....", ".....", ".....", "....."],
    '"': [".#.#.", ".#.#.", ".....", ".....", ".....", ".....", "....."],
    "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
    ":": [".....", "..#..", "..#..", ".....", "..#..", "..#..", "....."],
    "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
    "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
    "©": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#...#", ".###."],
}

// The advance and height of a letter, in pixels.
export const LETTER_W = 8
export const LETTER_H = 7

// Text in the pixel font, upper-cased (the font has no lower case), its
// top at y: centred on x, or with its left (or right) edge there.
export function pixelText(
    g: Ctx,
    s: string,
    x: number,
    y: number,
    color: string,
    align: "left" | "center" | "right" = "center"
) {
    const up = s.toUpperCase()
    const w = up.length * LETTER_W
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x
    g.fillStyle = color
    for (let i = 0; i < up.length; i++) {
        const glyph = FONT[up[i]!]
        if (!glyph) continue
        for (let r = 0; r < LETTER_H; r++) {
            for (let k = 0; k < 5; k++) {
                if (glyph[r]![k] === "#")
                    g.fillRect(
                        Math.round(left + i * LETTER_W + k),
                        Math.round(y + r),
                        2,
                        1
                    )
            }
        }
    }
}

// The title's Gold logo colours.
export const BLOCK_GOLD = {
    face: "#f8b800",
    light: "#fce0a8",
    side: "#ac7c00",
    dark: "#401800",
} as const

function fill(g: Ctx, x: number, y: number, w: number, h: number, c: string) {
    g.fillStyle = c
    g.fillRect(Math.round(x), Math.round(y), w, h)
}

// A word in extruded gold block letters, `cell` px a glyph cell and
// `depth` px deep, centred on cx with its top at y, the letters on a gentle
// wave. `rise` (0 to 1) pops them up one by one.
export function blockWord(
    g: Ctx,
    word: string,
    cx: number,
    y: number,
    { rise = 1, cell = 4, depth = 4 } = {}
) {
    const letters: { ch: string; x: number }[] = []
    let x = 0
    for (const ch of word) {
        if (ch === " ") {
            x += Math.round(cell * 2.5)
            continue
        }
        letters.push({ ch, x })
        x += 6 * cell
    }
    const width = x - cell
    const cells: { x: number; y: number }[] = []
    letters.forEach((l, i) => {
        const p = Math.min(1, Math.max(0, rise * (letters.length + 2) - i))
        if (p <= 0) return
        const pop = p < 1 ? Math.round((1 - p) * 8) * 2 - (p > 0.6 ? 4 : 0) : 0
        const wave = Math.round(Math.sin(i * 0.8) * 3)
        const left = Math.round(cx - width / 2 + l.x)
        FONT[l.ch]?.forEach((row, r) => {
            for (let k = 0; k < row.length; k++) {
                if (row[k] === "#")
                    cells.push({
                        x: left + k * cell,
                        y: y + wave + pop + r * cell,
                    })
            }
        })
    })
    const P = BLOCK_GOLD
    for (const c of cells) fill(g, c.x - 1, c.y - 1, cell + 2, cell + 2, P.dark)
    for (let d = depth; d >= 1; d--) {
        for (const c of cells) {
            fill(g, c.x + d - 1, c.y + d - 1, cell + 2, cell + 2, P.dark)
            fill(g, c.x + d, c.y + d, cell, cell, P.side)
        }
    }
    for (const c of cells) {
        fill(g, c.x, c.y, cell, cell, P.face)
        fill(g, c.x, c.y, cell, 1, P.light)
    }
}
