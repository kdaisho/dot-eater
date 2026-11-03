import { Cell } from "./constants"
import type { GameState } from "./game"
import type { Vec2 } from "./vec2"

// The maze as pixel tiles (KDA-300, the styles the user picked in KDA-299):
// each stage's walls, floor, ice, dots, rubble and tunnel marks, and the
// breath effects shared by every stage. Pure, no DOM: this works out the
// colour of every art pixel, and the renderer (render.ts) copies the
// result onto a canvas.
//
// A cell is ART x ART art pixels (2 CSS px each at a phone's 20 px cells,
// the scale of the 8x8 character sprites). Colours are palette letters; a
// grid's "." is "nothing here, the layer below shows". Walls are drawn
// from their 8 neighbours, so outer corners round off and inner corners
// join up, and textures run in world pixels, across cells.

export const ART = 10

// A palette letter, or a row of a letter grid ("." for nothing).
type Letter = string
type Grid = readonly string[]

// An interior texture. Positions are world art pixels (wx, wy: from the
// map's top left) or local ones (lx, ly: from the cell's).
export type Pattern =
    // Rows of bricks `h` high and `w` wide, every other row offset by half.
    | { type: "brick"; mortar: Letter; h: number; w: number }
    // Dry stones of random widths in rows 4 high; some in the `alt` colour.
    | { type: "stones"; mortar: Letter; alt: Letter }
    // Random specks (`scale` px square) of `letters`, on `density` of them.
    | { type: "noise"; letters: string; density: number; scale?: number }
    // A rivet near each corner of the cell.
    | { type: "rivet"; letter: Letter }
    // Broken diagonal glints every `period` px.
    | { type: "facet"; letter: Letter; period: number }
    // Grout lines along the cell's top and left edges, every `size` px.
    | { type: "tiles"; letter: Letter; size?: number }

// A side of a wall cell, by the open neighbour it faces.
type Side = "N" | "S" | "W" | "E"

export type WallStyle = {
    // Outer corner radius in art px (0 square).
    round: number
    // Colours by depth from the open edge, index 0 the pixel touching the
    // corridor.
    bands: readonly Letter[]
    // Per side, bands in place of `bands` (e.g. a lit top edge).
    sides?: Partial<Record<Side, readonly Letter[]>>
    // The colour deeper than the bands, under the pattern.
    fill: Letter
    pattern?: Pattern
}

export type TileStyle = {
    // The design's name for it (KDA-299), e.g. "Toy blocks".
    name: string
    // Letter to CSS hex colour.
    palette: Readonly<Record<Letter, string>>
    floor: {
        fill: Letter
        pattern?: Pattern
        // Drawn on the floor just under a wall, `depth` px deep.
        shadow?: { letter: Letter; depth: number }
    }
    walls: WallStyle
    // Ice floor (level ice and the Penguin's): its fill, the diagonal shine
    // and the rim against plain floor. A stage designed without ice uses
    // SHARED_ICE.
    ice: { fill: Letter; shine: Letter; rim: Letter }
    // Small grids centred in the cell: a dot; on a boss stage the map's
    // dots that grow back (`regrow`) and the mark on an eaten one waiting
    // to (`seed`). A Splitter's drop is a plain `dot`.
    dot: Grid
    regrow?: Grid
    seed?: Grid
    // A broken wall (the Boar's Rush): a cell-sized grid; `keys` recolour
    // its letters into the style's.
    rubble: { grid: Grid; keys?: Readonly<Record<Letter, Letter>> }
    // Marks at a wrap tunnel's mouth, on stages that have them.
    tunnel?: Letter
    // The fog's darkness, as "r, g, b" (render.ts fades it in).
    fog: string
    // The colour of the characters' 1-px outline on this stage: black, or
    // a light one on a dark floor so it doesn't vanish (stages 8 to 10).
    // For the sprite module (KDA-300's sprites) to draw with: see
    // spriteOutline.
    outline: string
}

// The dot shapes (KDA-299).
const RIM = (c: Letter, r: Letter): Grid => [
    `.${r}${r}.`,
    `${r}${c}${c}${r}`,
    `${r}${c}${c}${r}`,
    `.${r}${r}.`,
]
const ROUND = (c: Letter, s: Letter): Grid => [
    `.${c}${c}.`,
    `${c}${s}${c}${c}`,
    `${c}${c}${c}${c}`,
    `.${c}${c}.`,
]
const SQUARE = (c: Letter): Grid => [`${c}${c}`, `${c}${c}`]
const CORNERS = (c: Letter): Grid => [
    `${c}..${c}`,
    "....",
    "....",
    `${c}..${c}`,
]
const FLAME = (o: Letter, i: Letter): Grid => [
    `.${o}..`,
    `.${o}${o}.`,
    `${o}${i}${o}${o}`,
    `${o}${i}${i}${o}`,
    `.${o}${o}.`,
]

// Rubble in the wall's letters: W the stone, H its light, S its shadow.
const RUBBLE_STONES: Grid = [
    "..........",
    "..WH......",
    ".SWWS..H..",
    "..SS..WWS.",
    "......SS..",
    ".HW.......",
    "SWWS..HW..",
    ".SS..SWWWS",
    "......SSS.",
    "..........",
]
const RUBBLE_BRICKS: Grid = [
    "..........",
    ".HHW......",
    ".WWWS.HW..",
    "..SS..WWS.",
    "....HW....",
    "...SWWS...",
    ".HW..SS.HW",
    "SWWS....WS",
    ".SS.......",
    "..........",
]

// The fog's darkness and the outline on a stage that doesn't set its own.
const DEFAULT_FOG = "17, 17, 17"
const DARK_OUTLINE = "#000000"

// Ice for the stages designed without it (the Penguin's breath ice can be
// anywhere): the Glacier's, in letters no such style uses.
export const SHARED_ICE = { fill: "I", shine: "i", rim: "j" } as const
const SHARED_ICE_COLORS = { I: "#a9e1f7", i: "#ecfbff", j: "#5fb3d9" }

// Every stage's style, by stage number (1 to 10), as picked in KDA-299.
export const STAGE_STYLES: Readonly<Record<number, TileStyle>> = {
    1: {
        name: "Toy blocks",
        palette: {
            F: "#f6f1e6",
            f: "#ebe3d2",
            s: "#d9cdb5",
            K: "#3a1410",
            W: "#e0453a",
            H: "#ff8f78",
            S: "#9e2a22",
            D: "#1f3b8a",
            d: "#6d8ae0",
            ...SHARED_ICE_COLORS,
        },
        floor: {
            fill: "F",
            pattern: { type: "tiles", letter: "f" },
            shadow: { letter: "s", depth: 2 },
        },
        walls: {
            round: 2,
            bands: ["K", "H"],
            sides: { S: ["K", "S"], E: ["K", "S"] },
            fill: "W",
        },
        ice: SHARED_ICE,
        dot: ROUND("D", "d"),
        rubble: { grid: RUBBLE_BRICKS },
        tunnel: "S",
        fog: DEFAULT_FOG,
        outline: DARK_OUTLINE,
    },
    2: {
        name: "Warp pipes",
        palette: {
            F: "#e9eef3",
            f: "#d5dde6",
            s: "#c3ccd6",
            K: "#0d2b14",
            W: "#2fa84f",
            H: "#9be8a5",
            S: "#1b6b30",
            Y: "#ffd23f",
            O: "#b8860b",
            T: "#1b6b30",
            ...SHARED_ICE_COLORS,
        },
        floor: {
            fill: "F",
            pattern: { type: "tiles", letter: "f" },
            shadow: { letter: "s", depth: 2 },
        },
        walls: {
            round: 3,
            bands: ["K", "W", "H"],
            sides: { S: ["K", "S", "W"], E: ["K", "S", "W"] },
            fill: "W",
        },
        ice: SHARED_ICE,
        dot: RIM("Y", "O"),
        rubble: { grid: RUBBLE_STONES },
        tunnel: "T",
        fog: DEFAULT_FOG,
        outline: DARK_OUTLINE,
    },
    3: {
        name: "Glacier",
        palette: {
            F: "#eef3f8",
            f: "#dfe8f1",
            s: "#cfdbe8",
            K: "#0f2a40",
            W: "#3d8bb8",
            H: "#a9e6ff",
            S: "#1b4a6b",
            I: "#a9e1f7",
            i: "#ecfbff",
            j: "#5fb3d9",
            D: "#1e2f73",
            d: "#5a6fc0",
        },
        floor: {
            fill: "F",
            pattern: { type: "noise", letters: "f", density: 0.2 },
            shadow: { letter: "s", depth: 1 },
        },
        walls: {
            round: 2,
            bands: ["K", "H"],
            sides: { S: ["K", "S"], E: ["K", "S"] },
            fill: "W",
            pattern: { type: "facet", letter: "H", period: 7 },
        },
        ice: { fill: "I", shine: "i", rim: "j" },
        dot: ROUND("D", "d"),
        rubble: { grid: RUBBLE_STONES },
        fog: DEFAULT_FOG,
        outline: DARK_OUTLINE,
    },
    4: {
        name: "Moor stones",
        palette: {
            F: "#7f8a6a",
            f: "#737d5f",
            K: "#2b2b29",
            A: "#8a8a84",
            B: "#73736d",
            M: "#4a4a46",
            H: "#b9b9b1",
            Y: "#fff8cf",
            g: "#e0b63a",
            ...SHARED_ICE_COLORS,
        },
        floor: {
            fill: "F",
            pattern: { type: "noise", letters: "f", density: 0.25, scale: 2 },
        },
        walls: {
            round: 1,
            bands: ["K"],
            sides: { N: ["K", "H"] },
            fill: "A",
            pattern: { type: "stones", mortar: "M", alt: "B" },
        },
        ice: SHARED_ICE,
        dot: RIM("Y", "g"),
        rubble: { grid: RUBBLE_STONES, keys: { W: "A", H: "H", S: "M" } },
        fog: "17, 17, 17",
        outline: DARK_OUTLINE,
    },
    5: {
        name: "Shrine",
        palette: {
            F: "#d8cdb8",
            f: "#c6b99f",
            s: "#b9aa8c",
            K: "#1a0f0a",
            R: "#d9381e",
            H: "#ff7a52",
            S: "#8f2010",
            Y: "#ffd23f",
            o: "#9a6b00",
            b: "#3f8ff0",
            w: "#e8f6ff",
            c: "#5d84b8",
            ...SHARED_ICE_COLORS,
        },
        floor: {
            fill: "F",
            pattern: { type: "tiles", letter: "f", size: 5 },
            shadow: { letter: "s", depth: 2 },
        },
        walls: {
            round: 0,
            bands: ["K", "S"],
            sides: { N: ["K", "K", "H"] },
            fill: "R",
        },
        ice: SHARED_ICE,
        dot: RIM("Y", "o"),
        regrow: FLAME("b", "w"),
        seed: CORNERS("c"),
        rubble: { grid: RUBBLE_STONES, keys: { W: "R", H: "H", S: "S" } },
        fog: DEFAULT_FOG,
        outline: DARK_OUTLINE,
    },
    6: {
        name: "Crypt",
        palette: {
            F: "#b8ad99",
            f: "#a99e89",
            s: "#9d917b",
            K: "#26241f",
            W: "#8d8a83",
            M: "#5a5650",
            H: "#b8b4ab",
            S: "#615d56",
            P: "#8a44d0",
            p: "#3b1a5c",
            ...SHARED_ICE_COLORS,
        },
        floor: {
            fill: "F",
            pattern: { type: "noise", letters: "f", density: 0.2 },
            shadow: { letter: "s", depth: 2 },
        },
        walls: {
            round: 0,
            bands: ["K", "H"],
            sides: { S: ["K", "S"] },
            fill: "W",
            pattern: { type: "brick", mortar: "M", h: 5, w: 10 },
        },
        ice: SHARED_ICE,
        dot: RIM("P", "p"),
        rubble: { grid: RUBBLE_BRICKS },
        fog: DEFAULT_FOG,
        outline: DARK_OUTLINE,
    },
    7: {
        name: "Steel base",
        palette: {
            F: "#c9ccd1",
            f: "#b8bcc3",
            s: "#a9adb5",
            K: "#1f2630",
            W: "#6b7a8f",
            R: "#b3c0d1",
            H: "#97a7bc",
            S: "#4a5668",
            Y: "#ffc83d",
            o: "#8a5800",
            ...SHARED_ICE_COLORS,
        },
        floor: {
            fill: "F",
            pattern: { type: "tiles", letter: "f" },
            shadow: { letter: "s", depth: 2 },
        },
        walls: {
            round: 1,
            bands: ["K", "H"],
            sides: { S: ["K", "S"], E: ["K", "S"] },
            fill: "W",
            pattern: { type: "rivet", letter: "R" },
        },
        ice: SHARED_ICE,
        dot: RIM("Y", "o"),
        rubble: { grid: RUBBLE_BRICKS },
        fog: DEFAULT_FOG,
        outline: DARK_OUTLINE,
    },
    8: {
        name: "Ice cave",
        palette: {
            F: "#1b3354",
            f: "#213d63",
            W: "#5fc8e8",
            H: "#c4f2ff",
            S: "#2a7fa8",
            i: "#a8dcf2",
            I: "#3f79a8",
            j: "#5d97c4",
            Y: "#fff07a",
            o: "#e0a020",
        },
        floor: {
            fill: "F",
            pattern: { type: "noise", letters: "f", density: 0.25 },
        },
        walls: {
            round: 0,
            bands: ["H", "W"],
            sides: { S: ["S", "W"], E: ["S", "W"] },
            fill: "W",
            pattern: { type: "facet", letter: "H", period: 6 },
        },
        ice: { fill: "I", shine: "i", rim: "j" },
        dot: RIM("Y", "o"),
        rubble: { grid: RUBBLE_STONES },
        fog: "8, 14, 28",
        outline: "#d6f4ff",
    },
    9: {
        name: "Iron gauntlet",
        palette: {
            F: "#24262b",
            f: "#2c2f35",
            O: "#f97316",
            K: "#111214",
            H: "#5b6170",
            W: "#3a3e47",
            R: "#6b7280",
            Y: "#fff2e0",
            o: "#f97316",
            T: "#f97316",
            ...SHARED_ICE_COLORS,
        },
        floor: { fill: "F", pattern: { type: "tiles", letter: "f" } },
        walls: {
            round: 1,
            bands: ["O", "K", "H"],
            sides: { S: ["O", "K", "K"] },
            fill: "W",
            pattern: { type: "rivet", letter: "R" },
        },
        ice: SHARED_ICE,
        dot: RIM("Y", "o"),
        rubble: { grid: RUBBLE_BRICKS, keys: { W: "W", H: "O", S: "K" } },
        tunnel: "T",
        fog: DEFAULT_FOG,
        outline: "#d6d9e0",
    },
    10: {
        name: "Dark castle",
        palette: {
            F: "#241a33",
            f: "#2e2142",
            K: "#120b1c",
            W: "#5b3f86",
            M: "#2f2047",
            H: "#8f70c2",
            S: "#3d2a5c",
            D: "#f5d77a",
            R: "#ff3b5c",
            w: "#ffd0da",
            r: "#8a0f2a",
            c: "#d0507a",
            ...SHARED_ICE_COLORS,
        },
        floor: {
            fill: "F",
            pattern: { type: "tiles", letter: "f", size: 5 },
        },
        walls: {
            round: 0,
            bands: ["K", "H"],
            sides: { S: ["K", "S"] },
            fill: "W",
            pattern: { type: "brick", mortar: "M", h: 5, w: 10 },
        },
        ice: SHARED_ICE,
        dot: SQUARE("D"),
        regrow: [".rr.", "rwRr", "rRRr", ".rr."],
        seed: CORNERS("c"),
        rubble: { grid: RUBBLE_BRICKS },
        fog: DEFAULT_FOG,
        outline: "#d8c8f0",
    },
}

// The style for stage `stage` (1 to 10); stage 1's for none or any other
// (e.g. a test's map).
export function styleFor(stage: number | undefined): TileStyle {
    return (stage !== undefined && STAGE_STYLES[stage]) || STAGE_STYLES[1]
}

// The colour of the characters' outline on stage `stage` (TileStyle.outline):
// the hook for the sprite module to draw sprites with, so they stand out on
// the dark-floor stages.
export function spriteOutline(stage: number | undefined): string {
    return styleFor(stage).outline
}

// A number in [0, 1) from integer coordinates and a salt, the same every
// time: the textures' randomness, so they never shimmer.
export function hash(x: number, y: number, s = 0): number {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
}

// The letter `p` puts at world pixel (wx, wy), local (lx, ly) in its cell,
// or null where it leaves the colour below.
export function patternAt(
    p: Pattern | undefined,
    wx: number,
    wy: number,
    lx: number,
    ly: number
): Letter | null {
    if (!p) return null
    switch (p.type) {
        case "brick": {
            const row = Math.floor(wy / p.h)
            if (wy % p.h === p.h - 1) return p.mortar
            const off = row % 2 ? p.w / 2 : 0
            return (wx + off) % p.w === p.w - 1 ? p.mortar : null
        }
        case "stones": {
            const h = 4
            const row = Math.floor(wy / h)
            if (wy % h === h - 1) return p.mortar
            const w = 4 + Math.floor(hash(row, 3) * 4)
            const t = wx + Math.floor(hash(row, 5) * w)
            if (t % w === w - 1) return p.mortar
            return hash(Math.floor(t / w), row, 9) < 0.45 ? p.alt : null
        }
        case "noise": {
            const s = p.scale ?? 1
            const bx = Math.floor(wx / s)
            const by = Math.floor(wy / s)
            if (hash(bx, by, 1) >= p.density) return null
            return p.letters[Math.floor(hash(bx, by, 2) * p.letters.length)]
        }
        case "rivet":
            return (lx === 2 || lx === 7) && (ly === 2 || ly === 7)
                ? p.letter
                : null
        case "facet":
            return (((wx - wy) % p.period) + p.period) % p.period === 0 &&
                hash(Math.floor((wx + wy) / 4), 1, 8) > 0.35
                ? p.letter
                : null
        case "tiles": {
            const s = p.size ?? ART
            return lx % s === 0 || ly % s === 0 ? p.letter : null
        }
    }
}

// Which of a wall cell's 8 neighbours are walls.
export type Neighbours = Readonly<
    Record<"N" | "S" | "W" | "E" | "NW" | "NE" | "SW" | "SE", boolean>
>

// The letter of pixel (px, py) of a wall cell with neighbours `nb`, at
// world pixel (wx, wy), or null where the floor shows through (outside a
// rounded outer corner). Its depth is how far it is from the nearest open
// edge: an open side, a rounded outer corner where two open sides meet, or
// an inner corner where two wall sides meet round an open diagonal (so a
// bend's band runs round it). The bands colour the first depths, the side
// the depth was measured from picking `sides` over `bands`; deeper is the
// pattern over the fill.
export function wallPixel(
    w: WallStyle,
    nb: Neighbours,
    px: number,
    py: number,
    wx: number,
    wy: number
): Letter | null {
    const r = w.round
    const last = ART - 1
    let d = Infinity
    let side = null as Side | null
    const take = (v: number, s: Side) => {
        if (v < d) {
            d = v
            side = s
        }
    }
    if (!nb.N) take(py, "N")
    if (!nb.W) take(px, "W")
    if (!nb.S) take(last - py, "S")
    if (!nb.E) take(last - px, "E")
    // Outer corners: round off where two open sides meet.
    const outer: [boolean, number, number, Side][] = [
        [!nb.N && !nb.W, px, py, "N"],
        [!nb.N && !nb.E, last - px, py, "N"],
        [!nb.S && !nb.W, px, last - py, "S"],
        [!nb.S && !nb.E, last - px, last - py, "S"],
    ]
    for (const [open, qx, qy, s] of outer) {
        if (!open || r === 0 || qx >= r || qy >= r) continue
        const dist = Math.hypot(qx + 0.5 - r, qy + 0.5 - r)
        if (dist > r - 0.5) return null
        take(Math.floor(r - 0.5 - dist), s)
    }
    // Inner corners: both sides are wall but the diagonal is open.
    const inner: [boolean, number, number, Side][] = [
        [nb.N && nb.W && !nb.NW, px, py, "N"],
        [nb.N && nb.E && !nb.NE, last - px, py, "N"],
        [nb.S && nb.W && !nb.SW, px, last - py, "S"],
        [nb.S && nb.E && !nb.SE, last - px, last - py, "S"],
    ]
    for (const [open, qx, qy, s] of inner) {
        if (!open) continue
        take(
            r > 0
                ? Math.floor(Math.hypot(qx + 0.5, qy + 0.5) - 0.5)
                : Math.max(qx, qy),
            s
        )
    }
    const bands = (side && w.sides?.[side]) || w.bands
    if (d < bands.length) return bands[d]
    return patternAt(w.pattern, wx, wy, px, py) ?? w.fill
}

// What the tiles draw on each cell, as a small number (so the renderer can
// tell cheaply which cells changed since the last frame): the kind in the
// low bits, then flags.
export const TileCode = {
    floor: 0,
    wall: 1,
    ice: 2,
    // The kind's bits.
    kind: 3,
    // A broken wall (the Boar's Rush), open floor drawn as rubble.
    rubble: 4,
    // A dot, and on a boss stage whether it is one of the map's dots, which
    // grow back (rules.regrowDots, see regrow.ts).
    dot: 8,
    regrow: 16,
    // An eaten map dot waiting to grow back.
    seed: 32,
} as const

// Every cell's TileCode for `state`, row by row, into `out` if given (and
// the right size). `shownDots` are dots still drawn though eaten (each
// player's, until its glide reaches it: see eatenDotVisible in glide.ts).
export function tileCodes(
    state: GameState,
    shownDots: readonly Vec2[],
    out?: Uint8Array
): Uint8Array {
    const rows = state.cells.length
    const cols = state.cells[0]?.length ?? 0
    const codes =
        out && out.length === cols * rows ? out : new Uint8Array(cols * rows)
    const home = state.regrow?.home
    for (let y = 0; y < rows; y++) {
        const row = state.cells[y]
        const ice = state.ice[y]
        for (let x = 0; x < cols; x++) {
            const cell = row[x]
            let code: number =
                cell === Cell.wall
                    ? TileCode.wall
                    : ice?.[x]
                      ? TileCode.ice
                      : TileCode.floor
            if (cell === Cell.dot) {
                code |= TileCode.dot
                if (home?.[y]?.[x]) code |= TileCode.regrow
            }
            codes[y * cols + x] = code
        }
    }
    for (const t of state.tiles) {
        if (!t.effect.opensWall) continue
        const i = t.pos.y * cols + t.pos.x
        if ((codes[i] & TileCode.kind) !== TileCode.wall) {
            codes[i] |= TileCode.rubble
        }
    }
    for (const p of state.regrow?.pending ?? []) {
        const i = p.at.y * cols + p.at.x
        if (!(codes[i] & TileCode.dot)) codes[i] |= TileCode.seed
    }
    for (const p of shownDots) {
        const i = p.y * cols + p.x
        if ((codes[i] & TileCode.kind) === TileCode.wall) continue
        codes[i] = (codes[i] & ~TileCode.seed) | TileCode.dot
        if (home?.[p.y]?.[p.x]) codes[i] |= TileCode.regrow
    }
    return codes
}

// The cells' TileCodes, `cols` wide, read with the map's edge: off the map
// is wall (so the outer wall has no edge facing out).
type Codes = { codes: Uint8Array; cols: number; rows: number }

function codeAt({ codes, cols, rows }: Codes, x: number, y: number): number {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return TileCode.wall
    return codes[y * cols + x]
}

function kindAt(map: Codes, x: number, y: number): number {
    return codeAt(map, x, y) & TileCode.kind
}

// The ART x ART letters of cell (cx, cy), row by row: its floor, ice or
// wall, then what stands on it (rubble, tunnel marks, a dot or a seed).
export function cellLetters(
    style: TileStyle,
    map: Codes,
    cx: number,
    cy: number
): Letter[] {
    const out: Letter[] = Array.from({ length: ART * ART }, () => "")
    const code = codeAt(map, cx, cy)
    const kind = code & TileCode.kind
    const ox = cx * ART
    const oy = cy * ART
    const fl = style.floor
    const floorAt = (wx: number, wy: number, px: number, py: number) =>
        patternAt(fl.pattern, wx, wy, px, py) ?? fl.fill
    const isWall = (x: number, y: number) => kindAt(map, x, y) === TileCode.wall
    if (kind === TileCode.wall) {
        const nb: Neighbours = {
            N: isWall(cx, cy - 1),
            S: isWall(cx, cy + 1),
            W: isWall(cx - 1, cy),
            E: isWall(cx + 1, cy),
            NW: isWall(cx - 1, cy - 1),
            NE: isWall(cx + 1, cy - 1),
            SW: isWall(cx - 1, cy + 1),
            SE: isWall(cx + 1, cy + 1),
        }
        for (let py = 0; py < ART; py++) {
            for (let px = 0; px < ART; px++) {
                const wx = ox + px
                const wy = oy + py
                out[py * ART + px] =
                    wallPixel(style.walls, nb, px, py, wx, wy) ??
                    floorAt(wx, wy, px, py)
            }
        }
        return out
    }
    const ice = kind === TileCode.ice
    const plain = (x: number, y: number) => kindAt(map, x, y) === TileCode.floor
    const rim = {
        N: ice && plain(cx, cy - 1),
        S: ice && plain(cx, cy + 1),
        W: ice && plain(cx - 1, cy),
        E: ice && plain(cx + 1, cy),
    }
    const shadow = !ice && isWall(cx, cy - 1) ? fl.shadow : undefined
    for (let py = 0; py < ART; py++) {
        for (let px = 0; px < ART; px++) {
            const wx = ox + px
            const wy = oy + py
            let l: Letter
            if (ice) {
                l = style.ice.fill
                const t = (wx + wy) % 11
                if (
                    (t === 0 || t === 1) &&
                    hash(Math.floor((wx - wy) / 5), 2, 5) > 0.45
                ) {
                    l = style.ice.shine
                }
                if (
                    (py === 0 && rim.N) ||
                    (py === ART - 1 && rim.S) ||
                    (px === 0 && rim.W) ||
                    (px === ART - 1 && rim.E)
                ) {
                    l = style.ice.rim
                }
            } else {
                l = floorAt(wx, wy, px, py)
            }
            if (shadow && py < shadow.depth) l = shadow.letter
            out[py * ART + px] = l
        }
    }
    if (code & TileCode.rubble) {
        stamp(out, style.rubble.grid, style.rubble.keys)
    }
    // A wrap tunnel's mouth: two dashed marks along the map's edge.
    const { cols, rows } = map
    if (
        style.tunnel &&
        (cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1)
    ) {
        for (let i = 1; i < ART - 1; i += 2) {
            for (const depth of [0, 2]) {
                const far = ART - 1 - depth
                if (cx === 0) out[i * ART + depth] = style.tunnel
                if (cx === cols - 1) out[i * ART + far] = style.tunnel
                if (cy === 0) out[depth * ART + i] = style.tunnel
                if (cy === rows - 1) out[far * ART + i] = style.tunnel
            }
        }
    }
    const dot = dotGrid(style, code)
    if (dot) stamp(out, dot)
    return out
}

// The grid drawn on a cell with TileCode `code`: its dot (a map dot that
// grows back in the style's regrow look, any other a plain dot), the seed
// of an eaten one waiting to grow back, or none.
export function dotGrid(style: TileStyle, code: number): Grid | null {
    if (code & TileCode.dot) {
        return code & TileCode.regrow && style.regrow ? style.regrow : style.dot
    }
    if (code & TileCode.seed && style.seed) return style.seed
    return null
}

// Draw `grid` centred on a cell's letters, recoloured by `keys`.
function stamp(
    out: Letter[],
    grid: Grid,
    keys?: Readonly<Record<Letter, Letter>>
) {
    const h = grid.length
    const w = grid[0].length
    const x0 = Math.floor((ART - w) / 2)
    const y0 = Math.floor((ART - h) / 2)
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const ch = grid[y][x]
            if (ch === ".") continue
            out[(y0 + y) * ART + x0 + x] = keys?.[ch] ?? ch
        }
    }
}

// [r, g, b] of a "#rrggbb" colour.
function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// A rectangle of art pixels.
export type ArtRect = { x: number; y: number; width: number; height: number }

// The map drawn as art pixels, ART per cell, kept from frame to frame:
// `pixels` is RGBA, (cols * ART) wide, for the renderer to put on a
// canvas. `codes` is what each cell was last painted as (255: not yet).
export type MapArt = {
    style: TileStyle
    cols: number
    rows: number
    codes: Uint8Array
    pixels: Uint8ClampedArray
    // The style's palette as RGB.
    colors: ReadonlyMap<Letter, readonly [number, number, number]>
}

// A blank MapArt for a `cols` x `rows` map in `style`, painting into
// `pixels` if given (e.g. an ImageData's, of the right size).
export function createMapArt(
    style: TileStyle,
    cols: number,
    rows: number,
    pixels?: Uint8ClampedArray
): MapArt {
    const size = cols * ART * rows * ART * 4
    return {
        style,
        cols,
        rows,
        codes: new Uint8Array(cols * rows).fill(255),
        pixels:
            pixels && pixels.length === size
                ? pixels
                : new Uint8ClampedArray(size),
        colors: new Map(
            Object.entries(style.palette).map(([k, v]) => [k, rgb(v)])
        ),
    }
}

// Past this many changed cells in a frame, or once half the map is
// repainted (e.g. the first frame), one rectangle round the whole map is
// cheaper to copy than many small ones.
const MAX_RECTS = 24

// Repaint the cells whose code changed since the last update, and their 8
// neighbours (a wall's edges, an ice rim and a shadow depend on them), and
// return the art rectangles repainted, so only those are copied to the
// canvas. None when nothing changed (the usual frame).
export function updateMapArt(art: MapArt, codes: Uint8Array): ArtRect[] {
    const { cols, rows } = art
    const changed: number[] = []
    for (let i = 0; i < codes.length; i++) {
        if (codes[i] !== art.codes[i]) changed.push(i)
    }
    if (changed.length === 0) return []
    const map = { codes, cols, rows }
    const dirty = new Uint8Array(cols * rows)
    let painted = 0
    const rects: ArtRect[] = []
    for (const i of changed) {
        const cx = i % cols
        const cy = (i - cx) / cols
        const x0 = Math.max(0, cx - 1)
        const y0 = Math.max(0, cy - 1)
        const x1 = Math.min(cols - 1, cx + 1)
        const y1 = Math.min(rows - 1, cy + 1)
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                if (dirty[y * cols + x]) continue
                dirty[y * cols + x] = 1
                painted++
                paintCell(art, map, x, y)
            }
        }
        rects.push({
            x: x0 * ART,
            y: y0 * ART,
            width: (x1 - x0 + 1) * ART,
            height: (y1 - y0 + 1) * ART,
        })
    }
    art.codes.set(codes)
    if (rects.length > MAX_RECTS || painted * 2 >= cols * rows) {
        return [{ x: 0, y: 0, width: cols * ART, height: rows * ART }]
    }
    return rects
}

function paintCell(art: MapArt, map: Codes, cx: number, cy: number) {
    const letters = cellLetters(art.style, map, cx, cy)
    const width = art.cols * ART
    for (let py = 0; py < ART; py++) {
        for (let px = 0; px < ART; px++) {
            const c = art.colors.get(letters[py * ART + px])
            const i = ((cy * ART + py) * width + cx * ART + px) * 4
            art.pixels[i] = c?.[0] ?? 0
            art.pixels[i + 1] = c?.[1] ?? 0
            art.pixels[i + 2] = c?.[2] ?? 0
            art.pixels[i + 3] = c ? 255 : 0
        }
    }
}

// The pixel tiles of the breaths' effects, shared by every stage
// (KDA-299): each is drawn over its look's colour wash, an EffectTile
// named by Look.tile (see breath.ts). Each was an emoji before.
export type EffectTile = "fire" | "gust" | "stink" | "frozen"

const EFFECT_PALETTE: Readonly<Record<Letter, string>> = {
    O: "#ff6a14",
    Y: "#ffd23f",
    W: "#fff6d6",
    r: "#b8320a",
    G: "#5b7fa6",
    g: "#a9c4e2",
    L: "#84cc16",
    l: "#3f6b0a",
    B: "#9ad4ff",
    b: "#e6f6ff",
    K: "#1d4f7a",
}

export const EFFECT_TILES: Readonly<Record<EffectTile, Grid>> = {
    // The Dragon's burning cells.
    fire: [
        "....r.....",
        "...rO..r..",
        "..rOO.rO..",
        "..rOYrOO..",
        ".rOYYOYOr.",
        ".rOYWWYOr.",
        "rOYWWWYOr.",
        ".rOYWWYOr.",
        "..rOYYOr..",
        "...rrrr...",
    ],
    // The Owl's gust along its line.
    gust: [
        "..........",
        ".gGGGGg...",
        ".......G..",
        "gGGGGGg.G.",
        ".......G..",
        "..gGGG....",
        "..........",
        ".gGGGGGg..",
        "........G.",
        ".......G..",
    ],
    // The centre of the Skunk's stink cloud.
    stink: [
        "..........",
        "...ll.....",
        "..lLLl.ll.",
        ".lLLLLlLLl",
        ".lLLLLLLLl",
        "..lLLLLLl.",
        "...llLLl..",
        ".ll..ll...",
        "lLLl......",
        ".ll.......",
    ],
    // An enemy the Penguin froze: an ice block's frame round its sprite.
    frozen: [
        "KKKKKKKKKK",
        "KbbbbbbbBK",
        "Kb......BK",
        "Kb......BK",
        "Kb......BK",
        "Kb......BK",
        "Kb......BK",
        "Kb.....bBK",
        "KBBBBBBBBK",
        "KKKKKKKKKK",
    ],
}

// Effect tile `tile` as RGBA art pixels, ART x ART, clear where its grid
// has ".".
export function effectPixels(tile: EffectTile): Uint8ClampedArray {
    const out = new Uint8ClampedArray(ART * ART * 4)
    EFFECT_TILES[tile].forEach((row, y) => {
        for (let x = 0; x < ART; x++) {
            const hex = EFFECT_PALETTE[row[x]]
            if (!hex) continue
            const [r, g, b] = rgb(hex)
            out.set([r, g, b, 255], (y * ART + x) * 4)
        }
    })
    return out
}
