import type { Boss } from "./boss"
import {
    BIG_BLAST_AT,
    CHAIN,
    SHATTER_AT,
    defeatSeconds,
    hash01,
    heartOf,
    type BossDefeat,
} from "./bossDefeat"
import { TICK_RATE } from "./constants"
import {
    BOSS_SPRITES,
    BadgeId,
    SPRITES,
    drawSprite,
    spritePixels,
    visibleTails,
    type Dots,
    type SpriteCache,
    type SpriteLook,
} from "./sprites"
import type { Vec2 } from "./vec2"

// Drawing a boss's defeat (KDA-301) and the hearts of the celebration after
// the final boss's (KDA-303), for render.ts: everything here is drawn from
// the BossDefeat (bossDefeat.ts) at one moment, so a frame is the same
// however often it is drawn, and anything that looks random comes from
// hash01, never Math.random. The looks follow the design page the user
// picked from: its sizes were in pixels of a 28 px cell, so they are
// written here as `px` (a 28th of a cell) to keep them comparable.
//
// render.ts calls, in order: drawDefeatFloor (the scorch, under the
// characters), drawDefeatBoss (the boss itself, in place of drawBoss),
// drawDefeatFx (blasts, shards and smoke, over the characters), drawHearts
// (over the enemies) and drawDefeatFlash (the white flashes, over the
// whole maze). The view's zoom and the hops are render.ts's.

// Colours from the design page.
const FX = {
    white: "#fcfcfc",
    yellow: "#f8d838",
    orange: "#f87818",
    red: "#d82800",
    smoke: "#8a8a8a",
    smokeLight: "#d0d0d0",
    scorch: "#bdbdbd",
}

// Where the boss is drawn: the middle of its footprint, in maze pixels,
// its sprite's box and a cell, in pixels.
export type DefeatSpot = { x: number; y: number; size: number; cell: number }

// The moment of `defeat` to draw this frame: its own, plus the part of
// the next tick already gone (`alpha`), at most its end.
export function defeatMoment(defeat: BossDefeat, alpha: number): number {
    return Math.min(
        defeatSeconds(defeat),
        defeat.elapsed + Math.max(0, alpha) / TICK_RATE
    )
}

// How the boss looks as it falls: its kind's sprite, the Kitsune with its
// last tail (at 0 health it would show none, and the design shows the one
// it was beaten down to).
export function defeatLook(boss: Boss): SpriteLook {
    const id = BOSS_SPRITES[boss.kind]
    return SPRITES[id].tails
        ? {
              id,
              tails: Math.max(1, visibleTails(boss.health, boss.maxHealth)),
          }
        : { id }
}

// The outline's colour (see spritePixels).
const OUTLINE = "#000000"

// Draw `dots` (a sprite's, outline included) centred on (x, y) in a box
// `size` across, each dot a square, all but the black ones in `tint` if
// given.
function drawDots(
    ctx: CanvasRenderingContext2D,
    dots: Dots,
    x: number,
    y: number,
    size: number,
    tint: string | null
) {
    const h = dots.length
    const w = dots[0]?.length ?? 0
    const s = size / Math.max(w, h)
    const left = x - (w * s) / 2
    const top = y - (h * s) / 2
    dots.forEach((row, j) =>
        row.forEach((color, i) => {
            if (color === null) return
            // The outline stays black, so a white flash still reads on the
            // white floor (as the design's rasters kept it).
            ctx.fillStyle = tint && color !== OUTLINE ? tint : color
            ctx.fillRect(left + i * s, top + j * s, Math.ceil(s), Math.ceil(s))
        })
    )
}

// The boss while it falls (drawBoss draws none once it is defeated): in
// the burst's hit-stop it flashes white every 0.05 s, in its shake it
// jitters harder and harder with a white flicker, and then it is gone (its
// shards are drawFx's); in the chain it jitters, flashing white as each
// blast pops, until the big blast swallows it. Its empty health bar shows
// while it is there, as before the blow.
export function drawDefeatBoss(
    ctx: CanvasRenderingContext2D,
    defeat: BossDefeat,
    boss: Boss,
    spot: DefeatSpot,
    e: number
) {
    const px = spot.cell / 28
    const dots = spritePixels(defeatLook(boss), true)
    let dx = 0
    let dy = 0
    let tint: string | null = null
    if (defeat.effect === "burst") {
        if (e >= SHATTER_AT) return
        if (e < 0.4) {
            tint = Math.floor(e / 0.05) % 2 === 0 ? FX.white : null
        } else {
            const k = (e - 0.4) / 0.3
            const j = (1 + k * 3) * px
            const f = Math.floor(e * 60)
            dx = (hash01(f) - 0.5) * 2 * j
            dy = (hash01(f + 99) - 0.5) * 2 * j
            tint = f % 3 === 0 ? FX.white : null
        }
    } else {
        if (e >= BIG_BLAST_AT + 0.13) return
        const fresh =
            e < 0.08 || CHAIN.some((b) => e >= b.at && e < b.at + 0.05)
        const j = 2.2 * px
        const f = Math.floor(e * 50)
        if (e > 0.1) {
            dx = (hash01(f) - 0.5) * 2 * j
            dy = (hash01(f + 7) - 0.5) * 2 * j
        }
        tint = fresh ? FX.white : null
    }
    drawDots(ctx, dots, spot.x + dx, spot.y + dy, spot.size, tint)
    drawEmptyBar(ctx, spot)
}

// The boss's health bar at nothing: a framed dark track, where drawBoss
// draws it.
function drawEmptyBar(ctx: CanvasRenderingContext2D, spot: DefeatSpot) {
    const h = spot.cell * 0.12
    const left = spot.x - spot.size / 2
    const top = spot.y - spot.size / 2 - h * 1.5
    ctx.fillStyle = "#374151"
    ctx.fillRect(left, top, spot.size, h)
    ctx.strokeStyle = "#000"
    ctx.lineWidth = 1
    ctx.strokeRect(left, top, spot.size, h)
}

// Under the characters: the scorch mark the final boss's big blast leaves,
// a ragged pale disc of squares that fades as the smoke clears.
export function drawDefeatFloor(
    ctx: CanvasRenderingContext2D,
    defeat: BossDefeat,
    spot: DefeatSpot,
    e: number
) {
    if (defeat.effect !== "chain" || e < 1.55) return
    const a = 0.9 * (1 - clamp((e - 1.9) / 0.6))
    if (a <= 0) return
    const px = (spot.cell / 28) * 4
    ctx.save()
    ctx.globalAlpha = a
    ctx.fillStyle = FX.scorch
    for (let gy = -8; gy <= 8; gy++) {
        for (let gx = -8; gx <= 8; gx++) {
            const d = Math.hypot(gx, gy)
            const n = (gx + 8) * 17 + gy + 8
            if (d > 7.5 || hash01(n + 500) < 0.35 + d / 14) continue
            ctx.fillRect(
                spot.x + gx * px - px / 2,
                spot.y + gy * px - px / 2,
                px,
                px
            )
        }
    }
    ctx.restore()
}

// A pixel blast `age` (0 to 1) through its life, centred on (cx, cy), up
// to `radius` across, of squares `square` wide: a ragged disc of fire that
// starts white hot, cools to red and smoke, and hollows out as it goes.
function blast(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    age: number,
    seed: number,
    square: number,
    colors: readonly string[] = [
        FX.white,
        FX.yellow,
        FX.orange,
        FX.red,
        FX.smoke,
    ]
) {
    if (age < 0 || age > 1) return
    const r = radius * (0.35 + 0.65 * Math.sqrt(age))
    const hole = age > 0.45 ? (r * (age - 0.45)) / 0.55 : 0
    const n = Math.ceil(r / square)
    for (let gy = -n; gy <= n; gy++) {
        for (let gx = -n; gx <= n; gx++) {
            const dx = gx * square
            const dy = gy * square
            const d = Math.hypot(dx, dy)
            if (d > r || d < hole) continue
            const jag = hash01(seed * 7919 + (gx + 64) * 131 + gy + 64)
            if (d > r - square * 1.5 && jag < 0.45) continue
            const q = d / r
            ctx.fillStyle =
                age < 0.25
                    ? colors[q < 0.5 ? 0 : q < 0.8 ? 1 : 2]!
                    : age < 0.55
                      ? colors[q < 0.35 ? 1 : q < 0.7 ? 2 : 3]!
                      : colors[jag < 0.5 ? 3 : 4]!
            ctx.fillRect(
                cx + dx - square / 2,
                cy + dy - square / 2,
                square,
                square
            )
        }
    }
}

// One shard of the burst: a 2x2 block of the sprite's dots, where it
// starts (its offset from the boss's middle, in dots) and how it flies
// (in px a second).
type Shard = {
    x0: number
    y0: number
    vx: number
    vy: number
    dots: { dx: number; dy: number; color: string }[]
}

// The burst's shards for `dots` (the sprite as drawn, outline included):
// every 2x2 block of it with something in it, flung out from the middle
// and up, faster or slower by a fixed hash, then falling (see drawFx).
export function shardsOf(dots: Dots): Shard[] {
    const h = dots.length
    const w = dots[0]?.length ?? 0
    const shards: Shard[] = []
    for (let gy = 0; gy < h; gy += 2) {
        for (let gx = 0; gx < w; gx += 2) {
            const block: Shard["dots"] = []
            for (let j = 0; j < 2; j++) {
                for (let i = 0; i < 2; i++) {
                    const color = dots[gy + j]?.[gx + i] ?? null
                    if (color !== null) {
                        block.push({ dx: i - 0.5, dy: j - 0.5, color })
                    }
                }
            }
            if (block.length === 0) continue
            const k = shards.length
            // From the middle of the grid, in dots.
            const x0 = gx + 1 - w / 2
            const y0 = gy + 1 - h / 2
            const d = Math.hypot(x0, y0) || 1
            const speed = 70 + 170 * hash01(k * 3 + 11)
            shards.push({
                x0,
                y0,
                vx: (x0 / d) * speed + (hash01(k * 5 + 12) - 0.5) * 50,
                vy: (y0 / d) * speed - 150 - 70 * hash01(k * 7 + 13),
                dots: block,
            })
        }
    }
    return shards
}

// How fast the shards fall, in px a second squared.
const SHARD_GRAVITY = 620

// Over the characters: the burst's white pop and the boss's shards,
// flying out and falling, fading as the jingle comes; the chain's small
// blasts, its big one and the smoke after it. (The big blast's debris is
// the bossDefeat particle burst, see eventEffects.ts.)
export function drawDefeatFx(
    ctx: CanvasRenderingContext2D,
    defeat: BossDefeat,
    boss: Boss,
    spot: DefeatSpot,
    e: number
) {
    const px = spot.cell / 28
    if (defeat.effect === "burst") {
        if (e < SHATTER_AT) return
        const t = e - SHATTER_AT
        blast(ctx, spot.x, spot.y, 26 * px, t / 0.25, 3, 4 * px, [
            FX.white,
            FX.white,
            FX.yellow,
            FX.smokeLight,
            FX.smokeLight,
        ])
        const fade = 1 - clamp((t - 0.75) / 0.55)
        if (fade <= 0) return
        const dots = spritePixels(defeatLook(boss), true)
        const s = spot.size / Math.max(dots.length, dots[0]?.length ?? 0)
        const size = Math.ceil(s)
        ctx.save()
        ctx.globalAlpha = fade
        for (const shard of shardsOf(dots)) {
            const x = spot.x + shard.x0 * s + shard.vx * px * t
            const y =
                spot.y +
                shard.y0 * s +
                shard.vy * px * t +
                0.5 * SHARD_GRAVITY * px * t * t
            for (const dot of shard.dots) {
                ctx.fillStyle = dot.color
                ctx.fillRect(
                    x + dot.dx * s - s / 2,
                    y + dot.dy * s - s / 2,
                    size,
                    size
                )
            }
        }
        ctx.restore()
        return
    }
    CHAIN.forEach((b, k) => {
        blast(
            ctx,
            spot.x + b.dx * spot.cell,
            spot.y + b.dy * spot.cell,
            b.radius * spot.cell,
            (e - b.at) / 0.32,
            k + 1,
            3 * px
        )
    })
    blast(
        ctx,
        spot.x,
        spot.y,
        spot.cell * 3,
        (e - BIG_BLAST_AT) / 0.6,
        50,
        4 * px
    )
    // Smoke puffs, drifting up and growing as they thin out.
    ctx.save()
    for (let i = 0; i < 10; i++) {
        const t = e - 1.75 - i * 0.04
        if (t < 0 || t > 0.75) continue
        const x = spot.x + (hash01(i * 3 + 70) - 0.5) * 50 * px
        const y = spot.y + (hash01(i * 3 + 71) - 0.5) * 30 * px - t * 30 * px
        const size = (4 + Math.round(t * 10)) * px
        ctx.globalAlpha = 0.8 * (1 - t / 0.75)
        ctx.fillStyle = i % 2 ? FX.smoke : FX.smokeLight
        ctx.fillRect(x - size / 2, y - size / 2, size, size)
    }
    ctx.restore()
}

// The heart over each freed enemy in the celebration (KDA-303): at `at`,
// the middle of the enemy as drawn (its hop included), in maze pixels,
// for enemy hopper `order`.
export function drawHeart(
    ctx: CanvasRenderingContext2D,
    sprites: SpriteCache,
    dpr: number,
    defeat: BossDefeat,
    order: number,
    at: Vec2,
    cell: number,
    e: number
) {
    const heart = heartOf(defeat, order, e)
    if (!heart || heart.scale <= 0) return
    const size = (11 / 28) * cell * heart.scale
    drawSprite(
        ctx,
        sprites,
        { badge: BadgeId.heart },
        at.x,
        at.y - cell * 0.62 - heart.rise * cell,
        size,
        dpr
    )
}

// Over the whole maze: the white flash of the blow and of the burst's
// shatter, and the chain's white-out after its big blast, over `width` by
// `height` (the maze's part of the canvas, in its own units).
export function drawDefeatFlash(
    ctx: CanvasRenderingContext2D,
    defeat: BossDefeat,
    width: number,
    height: number,
    e: number
) {
    const a = flashAlpha(defeat, e)
    if (a <= 0) return
    ctx.save()
    ctx.globalAlpha = a
    ctx.fillStyle = FX.white
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
}

// How white the screen is at `e` (0 to 1).
export function flashAlpha(defeat: BossDefeat, e: number): number {
    if (defeat.effect === "burst") {
        if (e >= 0 && e < 0.14) return 0.85 * (1 - e / 0.14)
        if (e >= SHATTER_AT && e < SHATTER_AT + 0.08) {
            return 0.45 * (1 - (e - SHATTER_AT) / 0.08)
        }
        return 0
    }
    if (e >= 1.52 && e < 2) return e < 1.72 ? 1 : 1 - (e - 1.72) / 0.28
    return 0
}

function clamp(x: number): number {
    return Math.min(1, Math.max(0, x))
}
