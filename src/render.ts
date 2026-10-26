import { enemyVisible, hasStatus, type EnergyHud, type Look } from "./breath"
import { AiType, Cell, SPRITE_SCALE } from "./constants"
import {
    fogDistance,
    fogWrap,
    lightBand,
    lightCentres,
    type FogWrap,
} from "./fog"
import type { GameState } from "./game"
import { eatenDotVisible, glidePos, wrapCopies } from "./glide"
import { computeLayout, type Layout } from "./layout"
import type { LevelRules } from "./level"
import { ANIMALS } from "./roster"
import { isSplitterHalf } from "./splitter"
import { vec2, type Vec2 } from "./vec2"

// What the HUD strip above the maze shows. Fields left out aren't drawn.
export type Hud = {
    score?: number
    lives?: number
    // The energy meter, in the middle (see energyHud in breath.ts).
    energy?: EnergyHud
}

export type Renderer = {
    // Draw the game. `alpha` in [0, 1) is how far the loop is between the last
    // logic tick and the next; characters glide between cells with it.
    // `rules` are the level's special rules that change how it looks (fog).
    draw(state: GameState, alpha: number, hud?: Hud, rules?: LevelRules): void
    // Paint the background only, for screens without a game, so the canvas
    // doesn't keep showing an old board. The canvas keeps its size.
    clear(): void
    // Refit the canvas to the window (size and devicePixelRatio) and redraw
    // the last frame (or the cleared background). Call it when the window is
    // resized.
    resize(): void
}

const COLORS = {
    background: "#fff",
    wall: "#000",
    dot: "#000",
    // Ice floor: a pale blue tile under the dot.
    ice: "#d6f0fb",
    text: "#000",
    // The fog's darkness, as RGB so the soft edge can fade it in.
    fog: "17, 17, 17",
    // The energy meter: its frame and cost marks, the fill while a breath
    // is ready, and the fill while it isn't (too little energy or cooling
    // down).
    meter: "#000",
    meterReady: "#f59e0b",
    meterCharging: "#9ca3af",
}

// The width of the fog's soft edge in cells: the darkness fades in over this
// much, ending fully dark at the radius (or over the whole radius when it is
// smaller).
const FOG_SOFT_EDGE = 1.5
// How far past the radius a cell's or sprite's centre can be while part of
// it is still in the light: half a cell's diagonal. Things that far out are
// drawn (the darkness covers what is past the radius) so they fade in as the
// player nears rather than popping in.
const FOG_REACH = Math.SQRT1_2

// The player is drawn as the playing character's emoji (ANIMALS in
// roster.ts), as are the HUD's lives.
function playerSprite(state: GameState): string {
    return ANIMALS[state.breather.breath.animal].emoji
}

// Enemies look like what they do: every enemy of one AI type shares a
// sprite. A Record over AiType, so a new AI type without a sprite is a type
// error.
const ENEMY_SPRITES: Record<AiType, string> = {
    [AiType.random]: "👺",
    [AiType.chase]: "👹",
    [AiType.ambusher]: "🦊",
    [AiType.patroller]: "🤖",
    [AiType.phantom]: "👻",
    [AiType.splitter]: "🦠",
}

// A Splitter's half (see splitter.ts) is drawn at this fraction of the usual
// sprite size.
export const HALF_SCALE = 0.65

// A status's badge emoji is this size, as a fraction of the sprite's.
const BADGE_SCALE = 0.5

// Wall blocks and dots keep the proportions of the old span grid: 30px blocks
// on a 35px pitch and 5px dots.
const WALL_SCALE = 30 / 35
const DOT_SCALE = 5 / 35

export type RendererOptions = {
    // The window to fit; defaults to the global one.
    view?: Pick<Window, "innerWidth" | "innerHeight" | "devicePixelRatio">
}

export function createRenderer(
    canvas: HTMLCanvasElement,
    options: RendererOptions = {}
): Renderer {
    const view = options.view ?? window
    const ctx = canvas.getContext("2d")
    let layout: Layout | undefined
    let cols = 0
    let rows = 0
    let last:
        | { state: GameState; alpha: number; hud: Hud; rules: LevelRules }
        | undefined

    function fit() {
        layout = computeLayout(
            view.innerWidth,
            view.innerHeight,
            cols,
            rows,
            view.devicePixelRatio
        )
        canvas.width = layout.pixelWidth
        canvas.height = layout.pixelHeight
        canvas.style.width = `${layout.width}px`
        canvas.style.height = `${layout.height}px`
    }

    function draw(
        state: GameState,
        alpha: number,
        hud: Hud = {},
        rules: LevelRules = {}
    ) {
        last = { state, alpha, hud, rules }
        const mapRows = state.cells.length
        const mapCols = state.cells[0]?.length ?? 0
        if (!layout || mapCols !== cols || mapRows !== rows) {
            cols = mapCols
            rows = mapRows
            fit()
        }
        if (!ctx || !layout) return
        const { cell, hudHeight, width, height, dpr } = layout

        // Work in CSS pixels; the transform scales to device pixels.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = COLORS.background
        ctx.fillRect(0, 0, width, height)

        drawHud(ctx, hud, playerSprite(state), width, hudHeight)

        ctx.save()
        ctx.translate(0, hudHeight)
        // Characters in a tunnel poke over the map edge; keep them on the map.
        ctx.beginPath()
        ctx.rect(0, 0, cols * cell, rows * cell)
        ctx.clip()
        const fog = rules.fog
            ? createFog(state, alpha, cols, rows, rules.fog.radius)
            : null
        drawCells(ctx, state, alpha, cell, fog)
        drawCharacters(ctx, state, alpha, cell, cols, rows, fog)
        if (fog) drawDarkness(ctx, fog, cell, cols, rows)
        ctx.restore()
    }

    function clear() {
        last = undefined
        if (!ctx) return
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.fillStyle = COLORS.background
        ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    return {
        draw,
        clear,
        resize() {
            if (layout) fit()
            if (last) draw(last.state, last.alpha, last.hud, last.rules)
            else clear()
        },
    }
}

// The fog for one frame: the light is centred on where the player is drawn
// (mid-glide), and anything wholly outside `radius` cells of it is hidden.
type Fog = {
    player: Vec2
    radius: number
    wrap: FogWrap
    // Whether something centred at `p` (cell units) reaches into the light.
    visible(p: Vec2): boolean
}

function createFog(
    state: GameState,
    alpha: number,
    cols: number,
    rows: number,
    radius: number
): Fog {
    const player = glidePos(state.player, alpha, cols, rows)
    const wrap = fogWrap(state.cells)
    return {
        player,
        radius,
        wrap,
        visible: (p) =>
            fogDistance(p, player, cols, rows, wrap) <= radius + FOG_REACH,
    }
}

// Darken the map outside the light: per light centre (the player and its
// copies across tunnels), a radial gradient over the part of the map nearest
// that centre, clear in the middle and fading to full darkness at the radius.
// The gradient's last colour carries on beyond it, so the rest is dark.
function drawDarkness(
    ctx: CanvasRenderingContext2D,
    fog: Fog,
    cell: number,
    cols: number,
    rows: number
) {
    const outer = fog.radius * cell
    const inner = Math.max(0, fog.radius - FOG_SOFT_EDGE) * cell
    for (const c of lightCentres(fog.player, cols, rows, fog.wrap)) {
        const band = lightBand(c, cols, rows, fog.wrap)
        if (!band) continue
        const x = (c.x + 0.5) * cell
        const y = (c.y + 0.5) * cell
        const gradient = ctx.createRadialGradient(x, y, inner, x, y, outer)
        gradient.addColorStop(0, `rgba(${COLORS.fog}, 0)`)
        gradient.addColorStop(1, `rgb(${COLORS.fog})`)
        ctx.fillStyle = gradient
        // Whole pixels, so neighbouring bands meet without a seam.
        const left = Math.round(band.left * cell)
        const top = Math.round(band.top * cell)
        ctx.fillRect(
            left,
            top,
            Math.round(band.right * cell) - left,
            Math.round(band.bottom * cell) - top
        )
    }
}

// Ice floor, walls and dots, plus the dot the player has just eaten while its
// glide hasn't reached it yet (see eatenDotVisible). Ice fills its whole
// cell, so a patch reads as one surface, with any dot drawn on top. Tile
// effects from breaths are drawn by their Look: the colour over the floor
// (under the dot), the emoji on top. In fog, only cells inside the light
// are drawn.
function drawCells(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    alpha: number,
    cell: number,
    fog: Fog | null
) {
    const wall = cell * WALL_SCALE
    const dot = Math.max(1, cell * DOT_SCALE)
    const eaten =
        state.eatenAt && eatenDotVisible(state.player, alpha)
            ? state.eatenAt
            : null
    // Whole pixels, so neighbouring filled cells meet without a seam.
    const fillCell = (x: number, y: number, color: string) => {
        const left = Math.round(x * cell)
        const top = Math.round(y * cell)
        ctx.fillStyle = color
        ctx.fillRect(
            left,
            top,
            Math.round((x + 1) * cell) - left,
            Math.round((y + 1) * cell) - top
        )
    }
    const looks = tileLooks(state)
    state.cells.forEach((row, y) => {
        row.forEach((value, x) => {
            if (fog && !fog.visible(vec2(x, y))) return
            const cx = (x + 0.5) * cell
            const cy = (y + 0.5) * cell
            if (state.ice[y][x]) fillCell(x, y, COLORS.ice)
            for (const look of looks?.[y][x] ?? []) {
                if (look.color) fillCell(x, y, look.color)
            }
            if (value === Cell.wall) {
                ctx.fillStyle = COLORS.wall
                ctx.fillRect(cx - wall / 2, cy - wall / 2, wall, wall)
            } else if (
                value === Cell.dot ||
                (eaten && eaten.x === x && eaten.y === y)
            ) {
                ctx.fillStyle = COLORS.dot
                ctx.fillRect(cx - dot / 2, cy - dot / 2, dot, dot)
            }
        })
    })
    if (!looks) return
    // Tile emoji go on top of everything in the cells, before characters.
    const emoji = looks.flatMap((row, y) =>
        row.flatMap((list, x) =>
            list.flatMap((look) =>
                look.emoji && !(fog && !fog.visible(vec2(x, y)))
                    ? [{ x, y, emoji: look.emoji }]
                    : []
            )
        )
    )
    if (emoji.length === 0) return
    ctx.font = `${Math.round(cell * SPRITE_SCALE)}px sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (const e of emoji) {
        ctx.fillText(e.emoji, (e.x + 0.5) * cell, (e.y + 0.5) * cell)
    }
}

// Per cell [y][x], the looks of the tile effects on it, oldest first, or
// null when there are no tile effects (the common case: no grid each frame).
function tileLooks(state: GameState): Look[][][] | null {
    if (state.tiles.length === 0) return null
    const looks: Look[][][] = state.cells.map((row) => row.map(() => []))
    for (const t of state.tiles) {
        if (t.effect.look) looks[t.pos.y][t.pos.x].push(t.effect.look)
    }
    return looks
}

function drawCharacters(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    alpha: number,
    cell: number,
    cols: number,
    rows: number,
    fog: Fog | null
) {
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    // Later characters are drawn on top of earlier ones. In fog, enemies
    // outside the light are hidden; the player is always in it. A defeated
    // enemy is hidden until it blinks before coming back (enemyVisible).
    // Statuses are drawn by their Look: the colour as a disc behind the
    // sprite, the emoji as a small badge at its top right. A held enemy
    // (e.g. frozen mid-glide) gets no frame alpha: its progress doesn't move
    // on, so it stays exactly where it is drawn instead of creeping forward
    // between ticks. A Splitter's half is drawn smaller (HALF_SCALE), its
    // disc and badges too.
    for (const character of [state.player, ...state.enemies]) {
        const isPlayer = character === state.player
        if (!isPlayer && !enemyVisible(character)) continue
        const held = !isPlayer && hasStatus(character, "holds")
        const pos = glidePos(character, held ? 0 : alpha, cols, rows)
        if (fog && !isPlayer && !fog.visible(pos)) continue
        const sprite = isPlayer
            ? playerSprite(state)
            : ENEMY_SPRITES[character.ai]
        const looks = character.statuses.flatMap((s) =>
            s.status.look ? [s.status.look] : []
        )
        const size =
            cell *
            SPRITE_SCALE *
            (!isPlayer && isSplitterHalf(character) ? HALF_SCALE : 1)
        for (const p of wrapCopies(pos, cols, rows)) {
            ctx.font = `${Math.round(size)}px sans-serif`
            const x = (p.x + 0.5) * cell
            const y = (p.y + 0.5) * cell
            for (const look of looks) {
                if (!look.color) continue
                ctx.fillStyle = look.color
                ctx.beginPath()
                ctx.arc(x, y, size / 2, 0, Math.PI * 2)
                ctx.fill()
            }
            ctx.fillText(sprite, x, y)
            const badges = looks.filter((look) => look.emoji)
            if (badges.length === 0) continue
            ctx.font = `${Math.round(size * BADGE_SCALE)}px sans-serif`
            badges.forEach((look, i) => {
                ctx.fillText(
                    look.emoji!,
                    x + size / 2 - i * size * BADGE_SCALE,
                    y - size / 2
                )
            })
        }
    }
}

// Score on the left, lives (as the player's emoji) on the right, the energy
// meter in the middle.
function drawHud(
    ctx: CanvasRenderingContext2D,
    hud: Hud,
    sprite: string,
    width: number,
    height: number
) {
    const pad = height * 0.25
    ctx.fillStyle = COLORS.text
    ctx.font = `${Math.round(height * 0.6)}px monospace`
    ctx.textBaseline = "middle"
    if (hud.score !== undefined) {
        ctx.textAlign = "left"
        ctx.fillText(`Score ${hud.score}`, pad, height / 2)
    }
    if (hud.lives !== undefined) {
        ctx.textAlign = "right"
        ctx.fillText(
            sprite.repeat(Math.max(0, hud.lives)),
            width - pad,
            height / 2
        )
    }
    if (hud.energy) drawMeter(ctx, hud.energy, width, height)
}

// The energy meter: a framed bar a quarter of the HUD wide, centred, filled
// up to the energy, with a mark at every multiple of the breath's cost (so
// the player sees how many breaths it holds). The fill is bright while a
// breath is ready and grey otherwise.
function drawMeter(
    ctx: CanvasRenderingContext2D,
    meter: EnergyHud,
    width: number,
    height: number
) {
    const w = width / 4
    const h = height * 0.4
    const left = (width - w) / 2
    const top = (height - h) / 2
    const fraction = meter.max > 0 ? Math.min(1, meter.energy / meter.max) : 0
    ctx.fillStyle = meter.ready ? COLORS.meterReady : COLORS.meterCharging
    ctx.fillRect(left, top, w * fraction, h)
    ctx.strokeStyle = COLORS.meter
    ctx.lineWidth = 1
    ctx.strokeRect(left, top, w, h)
    if (meter.cost <= 0) return
    ctx.fillStyle = COLORS.meter
    for (let e = meter.cost; e < meter.max; e += meter.cost) {
        ctx.fillRect(left + (w * e) / meter.max - 0.5, top, 1, h)
    }
}
