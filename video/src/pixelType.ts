// The game's own lettering, for the promo's words (pure: no DOM).
//
// - The title menu's 5x7 pixel font (FONT in openingView.ts), drawn bold
//   on an 8-pixel advance, with the letters the menu never needed (F, K,
//   L, M, V, W, X, Z and ! . - / ·) added in the same style.
// - The Dot Eater logo's gold 3D block letters (logo() in openingView.ts):
//   each font dot a 4-pixel cell, a dark outline, a 4-deep extruded side,
//   a lit top row, the letters on a gentle wave.
//
// Each comes out as a list of rectangles in its own pixels, for PixelWord
// to draw at any size.

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
    K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
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
    "2": [".###.", "#...#", "....#", "..##.", ".#...", "#....", "#####"],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
    ".": [".....", ".....", ".....", ".....", ".....", ".....", "..#.."],
    "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
    "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
    "·": [".....", ".....", ".....", "..#..", ".....", ".....", "....."],
    "©": [".###.", "#...#", "#.###", "#.#.#", "#.###", "#...#", ".###."],
    "▶": ["#....", "##...", "###..", "####.", "###..", "##...", "#...."],
}

// A rectangle of a word, in the word's pixels, and its colour.
export type PixelRect = {
    x: number
    y: number
    w: number
    h: number
    colour: string
}

// A word drawn as rectangles, `width` x `height` pixels.
export type PixelArt = {
    width: number
    height: number
    rects: readonly PixelRect[]
}

// The characters of `text` no glyph is drawn for (other than spaces).
export function missingGlyphs(text: string): string[] {
    return [...new Set(text.toUpperCase())].filter(
        (ch) => ch !== " " && !FONT[ch]
    )
}

// `text` in the menu font (upper case), in `colour`, with a hard 1-pixel
// shadow down and right in `shadow` if given.
export function menuText(
    text: string,
    colour: string,
    shadow?: string
): PixelArt {
    const s = text.toUpperCase()
    const pad = shadow ? 1 : 0
    const rects: PixelRect[] = []
    const draw = (d: number, c: string) =>
        s.split("").forEach((ch, i) =>
            FONT[ch]?.forEach((row, r) =>
                row.split("").forEach((cell, k) => {
                    if (cell === "#")
                        rects.push({
                            x: i * 8 + k + d,
                            y: r + d,
                            w: 2,
                            h: 1,
                            colour: c,
                        })
                })
            )
        )
    if (shadow) draw(1, shadow)
    draw(0, colour)
    // The last letter's advance has 2 pixels of air after it.
    return {
        width: Math.max(0, s.length * 8 - 2) + pad,
        height: 7 + pad,
        rects,
    }
}

// The logo's colours: its gold (openingView.ts), or a character's.
export type LogoPalette = {
    face: string
    light: string
    side: string
    dark: string
}

export const GOLD: LogoPalette = {
    face: "#f8b800",
    light: "#fce0a8",
    side: "#ac7c00",
    dark: "#401800",
}

// `hex` lightened (f > 0) or darkened (f < 0), as cardArt.ts's shade.
export function shade(hex: string, f: number): string {
    const n = parseInt(hex.slice(1), 16)
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) =>
        Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))
    )
    return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

// The logo's lighting in colour `hex`.
export function logoPalette(hex: string): LogoPalette {
    return {
        face: hex,
        light: shade(hex, 0.55),
        side: shade(hex, -0.35),
        dark: shade(hex, -0.75),
    }
}

const CELL = 4
const DEPTH = 4
// The thin marks take 3 cells' room, not 5.
const THIN = new Set([".", "!", "·"])

// `text` in the logo's 3D block letters, in `palette` (gold by default).
// With `dot`, each O is the logo's dot (a chunky disc), as in DOT EATER.
export function logoText(
    text: string,
    palette: LogoPalette = GOLD,
    dot = false
): PixelArt {
    const s = text.toUpperCase()
    const letters: { ch: string; x: number }[] = []
    let x = 0
    for (const ch of s) {
        if (ch === " ") {
            x += 10
            continue
        }
        if (!FONT[ch]) continue
        const thin = THIN.has(ch)
        // A thin mark's dot is in its glyph's middle column: pull it in.
        letters.push({ ch, x: thin ? x - 2 * CELL : x })
        x += thin ? CELL + 8 : 5 * CELL + 4
    }
    const cells: { x: number; y: number }[] = []
    const discs: { x: number; y: number }[] = []
    letters.forEach((l, i) => {
        // The gentle wave, 3 pixels either way, under a 4-pixel margin.
        const y = 4 + Math.round(Math.sin(i * 0.8) * 3)
        if (dot && l.ch === "O") return discs.push({ x: l.x + 1, y })
        FONT[l.ch]!.forEach((row, r) =>
            row.split("").forEach((c, k) => {
                if (c === "#")
                    cells.push({ x: l.x + 1 + k * CELL, y: y + r * CELL })
            })
        )
    })
    const rects: PixelRect[] = []
    const box = (x: number, y: number, w: number, h: number, colour: string) =>
        rects.push({ x, y, w, h, colour })
    // A disc of 2x2 blocks filling a letter's box (disc() in
    // openingView.ts), `grow` pixels bigger.
    const disc = (x: number, y: number, colour: string, grow = 0) => {
        const r = 10 + grow
        for (let dy = -r; dy < r; dy += 2)
            for (let dx = -r; dx < r; dx += 2)
                if ((dx + 1) ** 2 + (dy + 1) ** 2 <= r * r)
                    box(x + 10 + dx, y + 14 + dy, 2, 2, colour)
    }
    // Outline, then the extruded side layer by layer, then the face.
    for (const c of cells)
        box(c.x - 1, c.y - 1, CELL + 2, CELL + 2, palette.dark)
    for (const c of discs) disc(c.x, c.y, palette.dark, 1)
    for (let d = DEPTH; d >= 1; d--) {
        for (const c of discs) {
            disc(c.x + d, c.y + d, palette.dark, 1)
            disc(c.x + d, c.y + d, palette.side)
        }
        for (const c of cells) {
            box(c.x + d - 1, c.y + d - 1, CELL + 2, CELL + 2, palette.dark)
            box(c.x + d, c.y + d, CELL, CELL, palette.side)
        }
    }
    for (const c of cells) {
        box(c.x, c.y, CELL, CELL, palette.face)
        box(c.x, c.y, CELL, 1, palette.light)
    }
    for (const c of discs) {
        disc(c.x, c.y, palette.face)
        box(c.x + 5, c.y + 8, 4, 2, palette.light)
        box(c.x + 4, c.y + 10, 2, 3, palette.light)
    }
    return {
        width: Math.max(0, x - 4) + DEPTH + 3,
        height: 7 * CELL + DEPTH + 9,
        rects,
    }
}
