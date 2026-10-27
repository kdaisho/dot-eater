import { footprint } from "./boss"
import { enemyVisible, hasStatus, type EnergyHud, type Look } from "./breath"
import { AiType, Cell, CharacterId, SPRITE_SCALE } from "./constants"
import {
    fogDistance,
    fogWrap,
    lightBand,
    lightCentres,
    type FogWrap,
} from "./fog"
import type { GameState, Player } from "./game"
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
    // With two players, each one's score and meter, player 1 first: drawn
    // in place of `score` and `energy`, player 1 on the left and player 2
    // on the right, in their marker colours, with the shared lives between.
    players?: readonly PlayerHud[]
}

export type PlayerHud = { score: number; energy: EnergyHud }

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
    // The boss's health bar: health left over a dark track, framed; and
    // its flash when hit.
    bossHealth: "#dc2626",
    bossTrack: "#374151",
    bossFrame: "#000",
    bossFlash: "#fff",
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

// Each player is drawn as its character's emoji (ANIMALS in roster.ts), as
// are the HUD's lives (player 1's).
function playerSprite(player: Player): string {
    return ANIMALS[player.breather.breath.animal].emoji
}

// With two players, each one's sprite has a ring and a small number in its
// colour, so two players of the same character can be told apart; their
// HUD scores and meters use the same colours.
export const PLAYER_COLORS = ["#2563eb", "#dc2626"] as const
// The ring's width and the number's size, as fractions of the sprite's.
const RING_WIDTH = 0.08
const LABEL_SCALE = 0.4

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

// The boss (see boss.ts): its sprite, drawn at this many times the usual
// sprite size, so it fills its 2x2 footprint as an enemy fills its cell.
export const BOSS_SPRITE = "🐙"
export const BOSS_SCALE = 2
// Its health bar runs along the top of the footprint, above the sprite: as
// wide as the sprite and this tall, as a fraction of a cell.
const BOSS_BAR_HEIGHT = 0.12
// How opaque the white flash over the sprite is just after a hit.
const BOSS_FLASH_ALPHA = 0.7

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
    // With two players, the fog's darkness is drawn on a canvas of its own
    // first (see drawDarkness); made, with its context, when first needed
    // and kept from frame to frame.
    let layer: Layer | undefined
    const darknessLayer = (): Layer => {
        if (!layer) {
            const layerCanvas = canvas.ownerDocument.createElement("canvas")
            layer = { canvas: layerCanvas, ctx: layerCanvas.getContext("2d") }
        }
        return layer
    }

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

        drawHud(ctx, hud, playerSprite(state.players[0]), width, hudHeight)

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
        drawBoss(ctx, state, alpha, cell, cols, rows, fog)
        drawCharacters(ctx, state, alpha, cell, cols, rows, fog)
        if (fog) drawDarkness(ctx, fog, cell, cols, rows, darknessLayer, dpr)
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

// The fog for one frame: the light is centred on where each player is
// drawn (mid-glide), and anything wholly outside `radius` cells of every
// player is hidden.
type Fog = {
    players: Vec2[]
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
    const players = state.players.map((p) =>
        glidePos(p.character, alpha, cols, rows, p.rate)
    )
    const wrap = fogWrap(state.cells)
    return {
        players,
        radius,
        wrap,
        visible: (p) =>
            players.some(
                (player) =>
                    fogDistance(p, player, cols, rows, wrap) <=
                    radius + FOG_REACH
            ),
    }
}

// Darken the map outside the light. With one player: per light centre (the
// player and its copies across tunnels), a radial gradient over the part of
// the map nearest that centre, clear in the middle and fading to full
// darkness at the radius. The gradient's last colour carries on beyond it,
// so the rest is dark.
//
// With two players the lights overlap, so the darkness is drawn on a layer
// of its own (`layer`, sized here when the map's size changes) and
// composited once: the layer is filled
// dark, every light centre of every player clears its circle out of it
// (destination-out, fading at the soft edge), and the layer goes over the
// map. Without a 2D context for the layer, only `visible` hides things.
function drawDarkness(
    ctx: CanvasRenderingContext2D,
    fog: Fog,
    cell: number,
    cols: number,
    rows: number,
    layer: () => Layer,
    dpr: number
) {
    const outer = fog.radius * cell
    const inner = Math.max(0, fog.radius - FOG_SOFT_EDGE) * cell
    if (fog.players.length > 1) {
        drawSharedDarkness(ctx, fog, cell, cols, rows, layer(), dpr)
        return
    }
    for (const c of lightCentres(fog.players[0], cols, rows, fog.wrap)) {
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

// The canvas the 2-player darkness is drawn on, and its 2D context (null if
// it has none).
type Layer = {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D | null
}

function drawSharedDarkness(
    ctx: CanvasRenderingContext2D,
    fog: Fog,
    cell: number,
    cols: number,
    rows: number,
    layer: Layer,
    dpr: number
) {
    const width = cols * cell
    const height = rows * cell
    const dark = layer.ctx
    if (!dark) return
    // Resizing a canvas reallocates it, so only when the size changes.
    const pixelWidth = Math.ceil(width * dpr)
    const pixelHeight = Math.ceil(height * dpr)
    if (layer.canvas.width !== pixelWidth) layer.canvas.width = pixelWidth
    if (layer.canvas.height !== pixelHeight) layer.canvas.height = pixelHeight
    const outer = fog.radius * cell
    const inner = Math.max(0, fog.radius - FOG_SOFT_EDGE) * cell
    // Last frame's darkness is still there: start from a clear layer.
    dark.setTransform(1, 0, 0, 1, 0, 0)
    dark.globalCompositeOperation = "source-over"
    dark.clearRect(0, 0, pixelWidth, pixelHeight)
    dark.setTransform(dpr, 0, 0, dpr, 0, 0)
    dark.globalCompositeOperation = "source-over"
    dark.fillStyle = `rgb(${COLORS.fog})`
    dark.fillRect(0, 0, width, height)
    dark.globalCompositeOperation = "destination-out"
    for (const player of fog.players) {
        for (const c of lightCentres(player, cols, rows, fog.wrap)) {
            const x = (c.x + 0.5) * cell
            const y = (c.y + 0.5) * cell
            const light = dark.createRadialGradient(x, y, inner, x, y, outer)
            light.addColorStop(0, "rgba(0, 0, 0, 1)")
            light.addColorStop(1, "rgba(0, 0, 0, 0)")
            dark.fillStyle = light
            dark.fillRect(x - outer, y - outer, outer * 2, outer * 2)
        }
    }
    dark.globalCompositeOperation = "source-over"
    ctx.drawImage(layer.canvas, 0, 0, width, height)
}

// Ice floor, walls and dots, plus the dot each player has just eaten while its
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
    // Each player's eaten dot, while it is still to be drawn.
    const eaten = state.players.flatMap((p) =>
        p.eatenAt && eatenDotVisible(p.character, alpha, p.rate)
            ? [p.eatenAt]
            : []
    )
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
                eaten.some((e) => e.x === x && e.y === y)
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

// The boss, unless it is defeated (gone for good): its sprite centred on
// its gliding 2x2 footprint, under the other characters, with a thin health
// bar above the sprite and a white flash over it just after a hit. In fog
// it is hidden once none of its four cells reaches into the light. Boss
// levels have no tunnels, so it never needs wrap copies.
function drawBoss(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    alpha: number,
    cell: number,
    cols: number,
    rows: number,
    fog: Fog | null
) {
    const { boss } = state
    if (!boss || boss.defeated) return
    const pos = glidePos(boss, alpha, cols, rows)
    if (fog && !footprint(pos).some((p) => fog.visible(p))) return
    const size = cell * SPRITE_SCALE * BOSS_SCALE
    const x = (pos.x + 1) * cell
    const y = (pos.y + 1) * cell
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = `${Math.round(size)}px sans-serif`
    ctx.fillText(BOSS_SPRITE, x, y)
    if (boss.flash > 0) {
        ctx.save()
        ctx.globalAlpha = BOSS_FLASH_ALPHA
        ctx.fillStyle = COLORS.bossFlash
        ctx.beginPath()
        ctx.arc(x, y, size / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
    }
    // Between the top of the footprint and the top of the sprite.
    const h = cell * BOSS_BAR_HEIGHT
    const left = x - size / 2
    const top = y - size / 2 - h * 1.5
    const fraction =
        boss.maxHealth > 0 ? Math.max(0, boss.health / boss.maxHealth) : 0
    ctx.fillStyle = COLORS.bossTrack
    ctx.fillRect(left, top, size, h)
    ctx.fillStyle = COLORS.bossHealth
    ctx.fillRect(left, top, size * fraction, h)
    ctx.strokeStyle = COLORS.bossFrame
    ctx.lineWidth = 1
    ctx.strokeRect(left, top, size, h)
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
    // Later characters are drawn on top of earlier ones: the players (player
    // 1 first), then the enemies. In fog, enemies outside the light are
    // hidden; the players are always in it. A defeated enemy is hidden until
    // it blinks before coming back (enemyVisible). Statuses are drawn by
    // their Look: the colour as a disc behind the sprite, the emoji as a
    // small badge at its top right. A held enemy (e.g. frozen mid-glide) gets
    // no frame alpha: its progress doesn't move on, so it stays exactly where
    // it is drawn instead of creeping forward between ticks. Each player
    // glides at its current rate (Player.rate), as the ticks move it, and
    // with two players wears its marker (see PLAYER_COLORS). A Splitter's
    // half is drawn smaller (HALF_SCALE), its disc and badges too.
    const marked = state.players.length > 1
    const sprites = [
        ...state.players.map((player, i) => ({
            character: player.character,
            sprite: playerSprite(player),
            rate: player.rate,
            marker: marked ? i : null,
        })),
        ...state.enemies.map((enemy) => ({
            character: enemy,
            sprite: ENEMY_SPRITES[enemy.ai],
            rate: 1,
            marker: null,
        })),
    ]
    for (const { character, sprite, rate, marker } of sprites) {
        const isPlayer = character.id === CharacterId.player
        if (!isPlayer && !enemyVisible(character)) continue
        const held = !isPlayer && hasStatus(character, "holds")
        const pos = glidePos(character, held ? 0 : alpha, cols, rows, rate)
        if (fog && !isPlayer && !fog.visible(pos)) continue
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
            if (marker !== null) drawMarker(ctx, marker, x, y, size)
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

// Player `index`'s marker on its sprite centred at (x, y): a ring round it
// and its number at the bottom left, both in its colour.
function drawMarker(
    ctx: CanvasRenderingContext2D,
    index: number,
    x: number,
    y: number,
    size: number
) {
    const color = PLAYER_COLORS[index]
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, size * RING_WIDTH)
    ctx.beginPath()
    ctx.arc(x, y, size / 2 + ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.font = `bold ${Math.round(size * LABEL_SCALE)}px sans-serif`
    ctx.fillText(String(index + 1), x - size / 2, y + size / 2)
}

// Score on the left, lives (as the player's emoji) on the right, the energy
// meter in the middle. With two players (hud.players): player 1's score and
// meter on the left, player 2's on the right, each in its marker colour,
// and the shared lives (as hearts) in the middle.
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
    if (hud.players && hud.players.length > 1) {
        drawPlayersHud(ctx, hud, width, height, pad)
        return
    }
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
    if (hud.energy) {
        drawMeter(ctx, hud.energy, (width - width / 4) / 2, width / 4, height)
    }
}

// The HUD's share of each player's meter, as a fraction of its width.
const PLAYER_METER = 0.15

function drawPlayersHud(
    ctx: CanvasRenderingContext2D,
    hud: Hud,
    width: number,
    height: number,
    pad: number
) {
    const players = hud.players ?? []
    const w = width * PLAYER_METER
    players.slice(0, 2).forEach((player, i) => {
        const color = PLAYER_COLORS[i]
        const left = i === 0
        ctx.fillStyle = color
        ctx.textAlign = left ? "left" : "right"
        ctx.fillText(
            `${i + 1}P ${player.score}`,
            left ? pad : width - pad,
            height / 2
        )
        const meterLeft = left ? width * 0.2 : width * 0.8 - w
        drawMeter(ctx, player.energy, meterLeft, w, height, color)
    })
    if (hud.lives !== undefined) {
        ctx.fillStyle = COLORS.text
        ctx.textAlign = "center"
        ctx.fillText(LIFE.repeat(Math.max(0, hud.lives)), width / 2, height / 2)
    }
}

// The shared lives of a 2-player game, which aren't any one character's.
const LIFE = "❤️"

// The energy meter: a framed bar `w` wide from `left`, filled up to the
// energy, with a mark at every multiple of the breath's cost (so the player
// sees how many breaths it holds). The fill is bright while a breath is
// ready and grey otherwise. `frame` colours the frame (and the marks).
function drawMeter(
    ctx: CanvasRenderingContext2D,
    meter: EnergyHud,
    left: number,
    w: number,
    height: number,
    frame: string = COLORS.meter
) {
    const h = height * 0.4
    const top = (height - h) / 2
    const fraction = meter.max > 0 ? Math.min(1, meter.energy / meter.max) : 0
    ctx.fillStyle = meter.ready ? COLORS.meterReady : COLORS.meterCharging
    ctx.fillRect(left, top, w * fraction, h)
    ctx.strokeStyle = frame
    ctx.lineWidth = 1
    ctx.strokeRect(left, top, w, h)
    if (meter.cost <= 0) return
    ctx.fillStyle = frame
    for (let e = meter.cost; e < meter.max; e += meter.cost) {
        ctx.fillRect(left + (w * e) / meter.max - 0.5, top, 1, h)
    }
}
