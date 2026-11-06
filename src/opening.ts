// The opening before the title: the studio logo, waiting for a press (which
// is also the gesture that lets the browser play sound), then held alone,
// then the Dot Eater logo rising to the opening track with the final boss
// behind it, under twinkling stars and over the dark castle's maze
// (stage 10's, dimmed). On the drum hit the boss's eyes flare, its colours
// fade in and the menu (Start, Continue) appears; a pack then dashes along
// the maze's bottom corridor every few seconds (the boss's minions, or the
// Kitsune chased by the heroes), and the R's corner shines once it's gone
// (KDA-323, opening A with stage 10's maze behind). Timing and layout
// here; flow.ts runs the screen and openingView.ts draws it. No DOM access.

import { Cell } from "./constants"
import type { Level } from "./level"
import { spriteSize, type SpriteId } from "./sprites"
import { ART, TileCode } from "./tiles"

// The screen is drawn at the console's size and scaled up.
export const OPENING_WIDTH = 256
export const OPENING_HEIGHT = 224

// Seconds into the opening track where the drums come in (measured on the
// track): the logo stops rising, the menu appears and the boss's eyes
// flare.
export const OPENING_DRUM = 7.53
// When the logo starts rising, in seconds into the track.
export const RISE_FROM = 0.4
// How long the studio logo holds after the press, then a moment of black
// before the title.
export const LOGO_HOLD = 2.2
export const LOGO_SECONDS = LOGO_HOLD + 0.5

// The menu on the title, in order. Start goes to the title menu (the mode
// select); Continue picks a story run up where it was left.
export const OPENING_CHOICES = ["start", "continue"] as const
export type OpeningChoice = (typeof OPENING_CHOICES)[number]

// Where the logo's top rests once risen, and where it starts: low enough
// that the boss above it (BOSS_ABOVE) starts out of sight too.
export const LOGO_TOP = 60
export const BOSS_ABOVE = 44
const START_TOP = OPENING_HEIGHT + BOSS_ABOVE + 8

// The logo's top `seconds` into the track: below the screen, rising at an
// even pace from RISE_FROM, at rest from the drum on.
export function logoTop(seconds: number): number {
    const share = (seconds - RISE_FROM) / (OPENING_DRUM - RISE_FROM)
    const p = Math.min(1, Math.max(0, share))
    return Math.round(START_TOP + (LOGO_TOP - START_TOP) * p)
}

// The boss is a silhouette until the drum; then its real colours fade in
// over BOSS_REVEAL seconds. How far in they are, 0–1.
export const BOSS_REVEAL = 0.5
export function bossReveal(seconds: number): number {
    return Math.min(1, Math.max(0, (seconds - OPENING_DRUM) / BOSS_REVEAL))
}

// ---------- the sky: twinkling stars ----------

// A star: its pixel, and a number in [0, 1) setting its brightness, its
// colour and when it twinkles.
export type SkyStar = { x: number; y: number; p: number }

// 60 stars over the screen, the same on every load.
export const SKY_STARS: readonly SkyStar[] = (() => {
    let s = 7
    const next = () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 4294967296
    }
    return Array.from({ length: 60 }, () => ({
        x: Math.floor(next() * OPENING_WIDTH),
        y: Math.floor(next() * OPENING_HEIGHT),
        p: next(),
    }))
})()

// Whether `star` shows `seconds` into the track: each is out for a sixth
// of every 1.5 s, at its own moment.
export function starShown(star: SkyStar, seconds: number): boolean {
    return (seconds * 2 + star.p * 9) % 3 > 0.5
}

// ---------- the dark castle's maze behind it all ----------

// Share of the maze's own colour kept when dimmed over the night sky.
export const MAZE_KEEP = 0.4

// Each cell's TileCode for drawing `level`'s map as it starts: walls,
// floor and its dots (a boss stage's growing back), no ice or rubble.
export function mazeCodes(level: Level): Uint8Array {
    const rows = level.cells.length
    const cols = level.cells[0]?.length ?? 0
    const codes = new Uint8Array(cols * rows)
    const regrow = level.rules.regrowDots !== undefined
    level.cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            let code: number =
                cell === Cell.wall ? TileCode.wall : TileCode.floor
            if (cell === Cell.dot) {
                code |= TileCode.dot
                if (regrow) code |= TileCode.regrow
            }
            codes[y * cols + x] = code
        })
    )
    return codes
}

// Blend RGBA `pixels` in place towards `bg` ([r, g, b]), keeping `keep` of
// each colour; clear pixels stay clear.
export function dimPixels(
    pixels: Uint8ClampedArray,
    bg: readonly [number, number, number],
    keep = MAZE_KEEP
) {
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) continue
        for (let c = 0; c < 3; c++) {
            pixels[i + c] = Math.round(
                pixels[i + c]! * keep + bg[c]! * (1 - keep)
            )
        }
    }
}

// Where a `cols` x `rows` map's art (ART pixels a cell) sits: centred on
// the screen, at whole pixels.
export function mazeBox(cols: number, rows: number) {
    const width = cols * ART
    const height = rows * ART
    return {
        left: Math.floor((OPENING_WIDTH - width) / 2),
        top: Math.floor((OPENING_HEIGHT - height) / 2),
        width,
        height,
    }
}

// The runners' feet, for a map `rows` tall placed by mazeBox: the bottom
// pixel row of its bottom corridor (the row above the outer wall).
export function runnerFeet(rows: number): number {
    return mazeBox(0, rows).top + (rows - 1) * ART - 1
}

// ---------- the pack ----------

// It first runs PACK_DELAY seconds after the drum, then every PACK_LAP
// seconds, right to left at PACK_SPEED pixels a second. Each runner is a
// sprite (facing left as drawn), its lag behind the first (pixels) and its
// height offset.
export const PACK_DELAY = 0.9
export const PACK_LAP = 7
export const PACK_SPEED = 120
export type Runner = { id: SpriteId; lag: number; dy: number }

const pack = (
    ids: readonly SpriteId[],
    lag: (k: number) => number,
    dys: readonly number[]
): Runner[] => ids.map((id, k) => ({ id, lag: lag(k), dy: dys[k] ?? 0 }))

// The boss's eight minions.
export const MINION_PACK: readonly Runner[] = pack(
    ["tengu", "oni", "fox", "robot", "ghost", "splitter", "snake", "wolf"],
    (k) => k * 22,
    [0, 5, -3, 3, -1, 4, -2, 2]
)
// The Kitsune, chased by the five heroes.
export const HERO_PACK: readonly Runner[] = [
    { id: "kitsune", lag: 0, dy: 2 },
    ...pack(
        ["dragon", "penguin", "owl", "skunk", "boar"],
        (k) => 56 + k * 24,
        [0, 4, -2, 3, -1]
    ),
]

// Seconds into the pack's current run, or undefined before its first.
export function packLap(seconds: number): number | undefined {
    const since = seconds - OPENING_DRUM - PACK_DELAY
    return since < 0 ? undefined : since % PACK_LAP
}

// Which pack runs `seconds` into the track: the minions on the first run
// and every other one after, the Kitsune and the heroes in between.
export function packAt(seconds: number): readonly Runner[] {
    const run = Math.floor((seconds - OPENING_DRUM - PACK_DELAY) / PACK_LAP)
    return run % 2 === 1 ? HERO_PACK : MINION_PACK
}

// A runner's left edge `lap` seconds into a run: it starts just off the
// right edge.
export function runnerX(lag: number, lap: number): number {
    return OPENING_WIDTH + 10 + lag - lap * PACK_SPEED
}

// How wide a runner is drawn, in pixels (its sprite's width).
export function runnerWidth(runner: Runner): number {
    return spriteSize({ id: runner.id })[0]
}

// Seconds into a run when its last runner has left the screen, the same
// for either pack (the longer one's): the R's corner shines then.
export const PACK_GONE =
    (OPENING_WIDTH +
        10 +
        Math.max(
            ...[...MINION_PACK, ...HERO_PACK].map((r) => r.lag + runnerWidth(r))
        )) /
    PACK_SPEED
export const SHINE_SECONDS = 0.6

// How far through the R's shine `seconds` into the track is, 0–1, or
// undefined while it isn't shining.
export function shine(seconds: number): number | undefined {
    const lap = packLap(seconds)
    if (lap === undefined) return undefined
    const since = lap - PACK_GONE
    return since >= 0 && since <= SHINE_SECONDS
        ? since / SHINE_SECONDS
        : undefined
}
