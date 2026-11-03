// Pixel sprites (KDA-300): every character, enemy and boss is a letter grid
// with a palette (the data is in spriteData.ts), drawn the same way in the
// game, the menus, the opening and the end roll.
//
// The game draws a sprite with a 1-dot black outline round it (white parts
// would vanish on the white floor otherwise), mirrored to face right if it
// is a side view, on its walk frame, and for the Kitsune with as many tails
// as it has health. Each such look is rasterised once per size to an
// offscreen canvas with image smoothing off (createSpriteCache), so a frame
// only copies canvases. The pure parts (which grid, which frame, which
// tails, each pixel's colour) are plain functions, tested without a canvas.

import { AiType, BossKind } from "./constants"
import { SPRITE_DATA } from "./spriteData"
import type { AnimalId } from "./roster"

export const SpriteId = {
    dragon: "dragon",
    penguin: "penguin",
    owl: "owl",
    skunk: "skunk",
    boar: "boar",
    tengu: "tengu",
    oni: "oni",
    fox: "fox",
    robot: "robot",
    ghost: "ghost",
    splitter: "splitter",
    splitterHalf: "splitterHalf",
    snake: "snake",
    wolf: "wolf",
    kitsune: "kitsune",
    finalBoss: "finalBoss",
} as const
export type SpriteId = (typeof SpriteId)[keyof typeof SpriteId]

// Rows of palette letters, all the same length; "." is clear.
export type Grid = readonly string[]

export type SpriteDef = {
    // Drawn from the side, facing left: mirrored to face right. A front
    // view is drawn as it is whichever way it goes.
    side: boolean
    // A CSS colour per letter. A letter without one is clear.
    palette: Readonly<Record<string, string>>
    // The walk frames: one (no walk), or two shown in turn while it moves
    // (see walkFrame). Frame 0 is the standing one.
    frames: readonly Grid[]
    // The final boss: its grid while it winds up its breath.
    windUp?: Grid
    // The Kitsune: tail n is the digit n and its tip the n-th letter from
    // "a", so tails can be hidden one by one (see visibleTails).
    tails?: true
}

export const SPRITES: Readonly<Record<SpriteId, SpriteDef>> = SPRITE_DATA

// Who is drawn with which sprite. Records, so a new animal, AI type or
// boss without a sprite is a type error.
export const ANIMAL_SPRITES: Readonly<Record<AnimalId, SpriteId>> = {
    dragon: SpriteId.dragon,
    penguin: SpriteId.penguin,
    owl: SpriteId.owl,
    skunk: SpriteId.skunk,
    boar: SpriteId.boar,
}

// Enemies look like what they do: every enemy of one AI type shares a
// sprite. A Splitter's half has its own (SpriteId.splitterHalf).
export const ENEMY_SPRITES: Readonly<Record<AiType, SpriteId>> = {
    [AiType.random]: SpriteId.tengu,
    [AiType.chase]: SpriteId.oni,
    [AiType.ambusher]: SpriteId.fox,
    [AiType.patroller]: SpriteId.robot,
    [AiType.phantom]: SpriteId.ghost,
    [AiType.splitter]: SpriteId.splitter,
    [AiType.breather]: SpriteId.snake,
    [AiType.interceptor]: SpriteId.wolf,
}

export const BOSS_SPRITES: Readonly<Record<BossKind, SpriteId>> = {
    [BossKind.kitsune]: SpriteId.kitsune,
    [BossKind.final]: SpriteId.finalBoss,
}

// One way to draw a sprite: which frame, whether mirrored, whether winding
// up (a sprite with a windUp grid) and how many tails show (a sprite with
// tails; all of them when left out).
export type SpriteLook = {
    id: SpriteId
    frame?: number
    mirror?: boolean
    windUp?: boolean
    tails?: number
}

export const TAIL_COUNT = 9
const TAIL_BODY = "123456789"
const TAIL_TIP = "abcdefghi"

// How many of the Kitsune's nine tails show at `health` out of `maxHealth`:
// one is lost for each ninth of its health gone (KDA-298), so it keeps all
// nine until its first ninth is gone and its last until it is defeated.
export function visibleTails(health: number, maxHealth: number): number {
    if (!(maxHealth > 0)) return TAIL_COUNT
    const tails = Math.ceil((TAIL_COUNT * Math.max(0, health)) / maxHealth)
    return Math.min(TAIL_COUNT, tails)
}

// Which walk frame to show: frame 1 for the first half of each move and
// frame 0 for the second half and while standing, so the legs alternate
// once a cell and a character that stops stands on frame 0. `glide` is how
// far through its move it is drawn (glideT in glide.ts), `moving` whether it
// is between two cells. Always 0 for a sprite with one frame.
export function walkFrame(
    frames: number,
    moving: boolean,
    glide: number
): number {
    return frames > 1 && moving && glide < 0.5 ? 1 : 0
}

// Which way a character faces now: right after a move right (`dx` > 0),
// left after a move left, as it was (`right`) after a move up or down or
// none.
export function facesRight(right: boolean, dx: number): boolean {
    return dx > 0 ? true : dx < 0 ? false : right
}

// Whether to mirror sprite `id` facing right: side views only.
export function mirrored(id: SpriteId, right: boolean): boolean {
    return right && SPRITES[id].side
}

// The grid a look draws, before mirroring and tails.
export function spriteGrid(look: SpriteLook): Grid {
    const def = SPRITES[look.id]
    if (look.windUp && def.windUp) return def.windUp
    const frame = Math.min(look.frame ?? 0, def.frames.length - 1)
    return def.frames[Math.max(0, frame)]!
}

// A grid of dots: each a CSS colour, or null for clear.
export type Dots = (string | null)[][]

// Each dot of a look as a colour, mirrored and with its hidden tails
// cleared. With `outline` (the game's), it is wrapped in the outline: a row
// and a column more on every side, black on each clear dot next to a
// coloured one, so the outline follows what shows.
export function spritePixels(look: SpriteLook, outline = true): Dots {
    const def = SPRITES[look.id]
    const rows = spriteGrid(look)
    const w = rows[0]?.length ?? 0
    const shown = look.tails ?? TAIL_COUNT
    const dots = rows.map((row) =>
        Array.from({ length: w }, (_, x): string | null => {
            const ch = row[look.mirror ? w - 1 - x : x]!
            if (def.tails) {
                const body = TAIL_BODY.indexOf(ch)
                const n = body >= 0 ? body : TAIL_TIP.indexOf(ch)
                if (n >= shown) return null
            }
            return def.palette[ch] ?? null
        })
    )
    return outline ? outlined(dots) : dots
}

const OUTLINE = "#000000"

// `dots` with the 1-dot outline round them.
function outlined(dots: Dots): Dots {
    const h = dots.length
    const w = dots[0]?.length ?? 0
    const at = (x: number, y: number) =>
        x < 0 || y < 0 || x >= w || y >= h ? null : dots[y]![x]!
    return Array.from({ length: h + 2 }, (_, j) =>
        Array.from({ length: w + 2 }, (_, i) => {
            const x = i - 1
            const y = j - 1
            const color = at(x, y)
            if (color !== null) return color
            const edge =
                at(x + 1, y) !== null ||
                at(x - 1, y) !== null ||
                at(x, y + 1) !== null ||
                at(x, y - 1) !== null
            return edge ? OUTLINE : null
        })
    )
}

// A small badge on a character for a status (KDA-300, in place of the old
// emoji badges): frozen (an ice cube), stunned (a star) and immune to stuns
// (a shield).
export const BadgeId = {
    frozen: "frozen",
    stunned: "stunned",
    immune: "immune",
} as const
export type BadgeId = (typeof BadgeId)[keyof typeof BadgeId]

export const BADGES: Readonly<
    Record<BadgeId, { palette: Readonly<Record<string, string>>; grid: Grid }>
> = {
    frozen: {
        palette: { C: "#a8e4fc", W: "#fcfcfc", D: "#3cbcfc" },
        grid: [
            ".CCCCC.",
            "CWWCCCC",
            "CWCCCCD",
            "CCCCCCD",
            "CCCCCCD",
            "CCCCCDD",
            ".DDDDD.",
        ],
    },
    stunned: {
        palette: { Y: "#f8b800", W: "#fcfc80" },
        grid: [
            "...Y...",
            "..YWY..",
            "YYYWYYY",
            ".YWWWY.",
            "..YYY..",
            ".YY.YY.",
            ".Y...Y.",
        ],
    },
    immune: {
        palette: { B: "#2563eb", W: "#fcfcfc" },
        grid: [
            "BBBBBBB",
            "BBBWBBB",
            "BWWWWWB",
            "BBBWBBB",
            ".BBWBB.",
            "..BBB..",
            "...B...",
        ],
    },
}

// A badge's dots with the outline, as spritePixels.
export function badgePixels(id: BadgeId): Dots {
    const { palette, grid } = BADGES[id]
    return outlined(
        grid.map((row) =>
            Array.from(
                { length: row.length },
                (_, x) => palette[row[x]!] ?? null
            )
        )
    )
}

// What the cache draws: a sprite's look or a badge.
export type Drawable = SpriteLook | { badge: BadgeId }

// The name a drawable's canvas is tagged with (data-sprite), and its key in
// the cache with its size.
export function drawableKey(d: Drawable): string {
    if ("badge" in d) return `badge:${d.badge}`
    const def = SPRITES[d.id]
    const frame = Math.min(d.frame ?? 0, def.frames.length - 1)
    const windUp = d.windUp && def.windUp ? ":windUp" : ""
    const tails = def.tails ? `:tails${d.tails ?? TAIL_COUNT}` : ""
    return `${d.id}:${frame}${d.mirror ? ":mirror" : ""}${windUp}${tails}`
}

export type SpriteCache = {
    // The drawable rasterised to fit a box `size` device pixels across (its
    // larger side, outline included, fills it), made on first use.
    get(d: Drawable, size: number): HTMLCanvasElement
}

// Above this many rasters (many sizes, from a window resized again and
// again) the cache starts afresh.
const CACHE_LIMIT = 512

// A cache of rasters made with `makeCanvas` (a document's createElement).
// Each canvas is tagged data-sprite with the drawable's id or badge and
// data-look with its whole key, which tests read. Without a 2D context (as
// under happy-dom) the canvases stay blank.
export function createSpriteCache(
    makeCanvas: () => HTMLCanvasElement
): SpriteCache {
    const rasters = new Map<string, HTMLCanvasElement>()
    return {
        get(d, size) {
            const px = Math.max(1, Math.round(size))
            const key = `${drawableKey(d)}@${px}`
            const hit = rasters.get(key)
            if (hit) return hit
            if (rasters.size >= CACHE_LIMIT) rasters.clear()
            const canvas = paintSprite(makeCanvas(), d, px)
            rasters.set(key, canvas)
            return canvas
        },
    }
}

// Paint drawable `d`, outlined, on `canvas` (resized to it, its larger
// side `px` pixels) and tag it (see createSpriteCache). Returns the canvas.
// The character select's cards use it straight, scaled up by CSS.
export function paintSprite(
    canvas: HTMLCanvasElement,
    d: Drawable,
    px: number
): HTMLCanvasElement {
    const dots = "badge" in d ? badgePixels(d.badge) : spritePixels(d, true)
    rasterise(canvas, dots, px)
    canvas.dataset.sprite = "badge" in d ? d.badge : d.id
    canvas.dataset.look = drawableKey(d)
    return canvas
}

// Paint `dots` on `canvas`, its larger side `px` pixels: each dot a block
// from one rounded edge to the next, so the blocks tile with no gaps.
function rasterise(canvas: HTMLCanvasElement, dots: Dots, px: number) {
    const h = dots.length
    const w = dots[0]?.length ?? 0
    const span = Math.max(w, h)
    const edge = (n: number) => Math.round((n * px) / span)
    canvas.width = Math.max(1, edge(w))
    canvas.height = Math.max(1, edge(h))
    const g = canvas.getContext("2d")
    if (!g) return
    g.imageSmoothingEnabled = false
    dots.forEach((row, y) =>
        row.forEach((color, x) => {
            if (color === null) return
            g.fillStyle = color
            const left = edge(x)
            const top = edge(y)
            g.fillRect(left, top, edge(x + 1) - left, edge(y + 1) - top)
        })
    )
}

// Draw a drawable centred on (x, y) in `ctx`'s units, its box `size` of
// them across, through `cache`. `dpr` is the device pixels per unit, so
// the raster is made at the size it shows and copied 1:1, its corner on a
// whole device pixel.
export function drawSprite(
    ctx: CanvasRenderingContext2D,
    cache: SpriteCache,
    d: Drawable,
    x: number,
    y: number,
    size: number,
    dpr: number
) {
    const canvas = cache.get(d, size * dpr)
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    const left = Math.round((x - w / 2) * dpr) / dpr
    const top = Math.round((y - h / 2) * dpr) / dpr
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, left, top, w, h)
}

// Draw a look straight onto `g` at `scale` pixels a dot, its top-left at
// (x, y), with no outline: for the opening and the end roll, which draw at
// the console's resolution. `palette` overrides colours (the opening's
// silhouette boss).
export function drawPixels(
    g: CanvasRenderingContext2D,
    look: SpriteLook,
    x: number,
    y: number,
    scale = 1,
    palette?: Readonly<Record<string, string>>
) {
    const dots = palette ? recolour(look, palette) : spritePixels(look, false)
    dots.forEach((row, j) =>
        row.forEach((color, i) => {
            if (color === null) return
            g.fillStyle = color
            g.fillRect(
                Math.round(x) + i * scale,
                Math.round(y) + j * scale,
                scale,
                scale
            )
        })
    )
}

// A look's dots with `palette`'s colours in place of the sprite's for the
// letters it names.
function recolour(
    look: SpriteLook,
    palette: Readonly<Record<string, string>>
): Dots {
    const rows = spriteGrid(look)
    const w = rows[0]?.length ?? 0
    const base = spritePixels(look, false)
    return base.map((row, y) =>
        row.map((color, x) => {
            if (color === null) return null
            const ch = rows[y]![look.mirror ? w - 1 - x : x]!
            return palette[ch] ?? color
        })
    )
}

// A look's size in dots (no outline): [width, height].
export function spriteSize(look: SpriteLook): [number, number] {
    const rows = spriteGrid(look)
    return [rows[0]?.length ?? 0, rows.length]
}
