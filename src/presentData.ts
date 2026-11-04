import type { Grid, PixelArt } from "./sprites"
import type { TileStyle } from "./tiles"

// The present box's pixel art (KDA-324, box A of the design page: a wrapped
// gift) and the icons of what is inside, in spriteData.ts's letter-grid
// format. Each is drawn with the game's 1-dot outline at the sprites' dot
// density (see render.ts).

// The box's palette: rose-red box, gold ribbon and bow.
const BOX_PALETTE = {
    R: "#e83f6f",
    H: "#ff9fb8",
    S: "#9c1f45",
    Y: "#ffd23f",
    o: "#c88a00",
    k: "#4a0f24",
}

// The box (12x12) closed, its body once the lid is off (the dark inside
// shows) and the lid with its bow, which flies off as it opens. All three
// share one frame, so they line up.
export const BOX: Readonly<Record<"closed" | "open" | "lid", PixelArt>> = {
    closed: {
        palette: BOX_PALETTE,
        grid: [
            "..YY....YY..",
            ".YYYY..YYYY.",
            ".YYoYYYYoYY.",
            "..YYYooYYY..",
            "HHHHHYYHHHHH",
            "RRRRRYYRRRRR",
            "SSSSSooSSSSS",
            ".RRRRYYRRRS.",
            ".RRRRYYRRRS.",
            ".RRRRYYRRRS.",
            ".RRRRYoRRRS.",
            ".SSSSooSSSS.",
        ],
    },
    open: {
        palette: BOX_PALETTE,
        grid: [
            "............",
            "............",
            "............",
            "............",
            "............",
            "............",
            ".RkkkkkkkkS.",
            ".RRRRYYRRRS.",
            ".RRRRYYRRRS.",
            ".RRRRYYRRRS.",
            ".RRRRYoRRRS.",
            ".SSSSooSSSS.",
        ],
    },
    lid: {
        palette: BOX_PALETTE,
        grid: [
            "..YY....YY..",
            ".YYYY..YYYY.",
            ".YYoYYYYoYY.",
            "..YYYooYYY..",
            "HHHHHYYHHHHH",
            "RRRRRYYRRRRR",
            "SSSSSooSSSSS",
            "............",
            "............",
            "............",
            "............",
            "............",
        ],
    },
}

// The icons that pop out of the box. The Germ has none: the Splitter
// itself jumps out.
export const HEAL_ICON: PixelArt = {
    palette: { R: "#f43f5e", r: "#9f1239", W: "#fcfcfc" },
    grid: [
        ".RR...RR.",
        "RWRR.RRRR",
        "RWRRRRRRR",
        "RRRRRRRRr",
        ".RRRRRRr.",
        "..RRRRr..",
        "...RRr...",
        "....r....",
    ],
}

// The Huge dot: C its fill, R its rim, S its shine. Drawn in each stage's
// own dot colours (see hugeDotPalette); this palette is the fallback.
const HUGE_DOT_GRID: Grid = [
    "...RRR...",
    ".RRCCCRR.",
    ".RSSCCCR.",
    "RCSCCCCCR",
    "RCCCCCCCR",
    "RCCCCCCCR",
    ".RCCCCCR.",
    ".RRCCCRR.",
    "...RRR...",
]
export const HUGE_DOT_ICON: PixelArt = {
    palette: { C: "#ffd23f", R: "#b8860b", S: "#fff6d6" },
    grid: HUGE_DOT_GRID,
}

// Speed: a winged boot, facing right.
export const SPEED_ICON: PixelArt = {
    palette: {
        B: "#2f7fe0",
        b: "#8cc8ff",
        S: "#1a2a5a",
        W: "#fcfcfc",
        w: "#a8c0d8",
    },
    grid: [
        "....bbbb..",
        "W...BbBB..",
        "WW..BbBB..",
        "wWWWBbBB..",
        ".wWWBbBB..",
        "..wWBbBBB.",
        "....BbbBBB",
        "....BBBBBB",
        "....SSSSSS",
    ],
}

// Earthquake: a boulder split by a zigzag crack.
export const QUAKE_ICON: PixelArt = {
    palette: { H: "#d9b98a", A: "#a87a48", M: "#6b4a2a", K: "#2a1608" },
    grid: [
        "..HHKHH..",
        ".HAAKAAH.",
        "HAAKAAAAA",
        "HAAAKAAAM",
        "AAAAAKAAM",
        "AAAAKAAAM",
        ".AAAKAAM.",
        "..MMKMM..",
    ],
}

// The small heart after the Heal's "+1" label.
export const LABEL_HEART: PixelArt = {
    palette: { R: "#f43f5e" },
    grid: ["RR.RR", "RRRRR", ".RRR.", "..R.."],
}

// The Huge dot's palette in `style`'s own dot colours (all ten stages
// draw their dot from one of three shapes, see tiles.ts): its fill (C),
// its rim (R) and its shine (S). A dot with a rim (RIM) lends it its rim;
// one with a shine (ROUND) its shine. What the stage's dot doesn't have is
// made from the fill: a darker rim, a lighter shine.
export function hugeDotPalette(style: TileStyle): Record<string, string> {
    const { dot, palette } = style
    const at = (x: number, y: number) => dot[y]?.[x]
    const colour = (letter: string | undefined) =>
        letter === undefined ? undefined : palette[letter]
    // RIM: a ring of one letter round a middle of another (ROUND's shine
    // is a single pixel, so its middle isn't all one letter).
    const rimmed =
        dot.length >= 3 && at(1, 0) !== at(1, 1) && at(2, 2) === at(1, 1)
    const letters = dot.join("").replace(/\./g, "")
    const fillLetter = rimmed ? at(1, 1) : mostCommon(letters)
    const fill = colour(fillLetter) ?? HUGE_DOT_ICON.palette.C!
    const other = [...new Set(letters)].find((l) => l !== fillLetter)
    const rim = rimmed ? colour(at(1, 0)) : undefined
    const shine = !rimmed ? colour(other) : undefined
    return {
        C: fill,
        R: rim ?? shade(fill, 0.67),
        S: shine ?? tint(fill, 0.6),
    }
}

function mostCommon(letters: string): string | undefined {
    const counts = new Map<string, number>()
    for (const l of letters) counts.set(l, (counts.get(l) ?? 0) + 1)
    let best: string | undefined
    for (const [l, n] of counts) {
        if (best === undefined || n > counts.get(best)!) best = l
    }
    return best
}

// `hex` (#rrggbb) with each channel times `k` (a darker shade).
function shade(hex: string, k: number): string {
    return mapChannels(hex, (c) => c * k)
}

// `hex` (#rrggbb) moved `k` of the way to white (a lighter tint).
function tint(hex: string, k: number): string {
    return mapChannels(hex, (c) => c + (255 - c) * k)
}

function mapChannels(hex: string, f: (c: number) => number): string {
    const n = parseInt(hex.slice(1, 7), 16)
    const channels = [n >> 16, (n >> 8) & 255, n & 255]
    return `#${channels
        .map((c) =>
            Math.max(0, Math.min(255, Math.round(f(c))))
                .toString(16)
                .padStart(2, "0")
        )
        .join("")}`
}
