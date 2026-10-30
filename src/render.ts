import { footprint } from "./boss"
import {
    aimPreviews,
    canBreathe,
    enemyVisible,
    hasStatus,
    type AimPreview,
    type EnergyHud,
    type Look,
} from "./breath"
import type { Character } from "./character"
import { AiType, Cell, CharacterId, SPRITE_SCALE } from "./constants"
import {
    fogDistance,
    fogWrap,
    lightBand,
    lightCentres,
    type FogWrap,
} from "./fog"
import {
    playerVisible,
    type GameState,
    type HealthHud,
    type Player,
} from "./game"
import { eatenDotVisible, glidePos, wrapCopies } from "./glide"
import { computeLayout, type Layout } from "./layout"
import type { LevelRules } from "./level"
import { particleAlpha, type Particle } from "./particles"
import type { FacingGuide } from "./settings"
import { ANIMALS } from "./roster"
import { isSplitterHalf } from "./splitter"
import { vec2, type Vec2 } from "./vec2"
import { stunImmune, stunned } from "./versus"

// What the HUD strip above the maze shows. Fields left out aren't drawn.
export type Hud = {
    score?: number
    // The player's health gauge, on the right (KDA-257).
    health?: HealthHud
    // The energy meter, in the middle (see energyHud in breath.ts).
    energy?: EnergyHud
    // With two players, each one's score, meter and health, player 1
    // first: drawn in place of `score`, `energy` and `health`, player 1 on
    // the left and player 2 on the right, in their marker colours.
    players?: readonly PlayerHud[]
    // Versus: the round and tally (e.g. "Round 2 · 1–0"), drawn in the
    // middle.
    round?: string
}

export type PlayerHud = {
    score: number
    energy: EnergyHud
    // Its health gauge, drawn under its meter in its marker colour.
    health?: HealthHud
    // Set while the player is out of play (see takeOut in game.ts): the
    // seconds until it is back, or null if it is out for good. Drawn in
    // place of its meter.
    out?: { respawnIn: number | null }
    // Versus: the player's dot count, drawn in place of its score.
    dots?: number
    // Versus: the seconds left of a stun, drawn in place of its meter.
    stunned?: number
}

// Visual effects drawn with the game (KDA-213), none of them part of it.
export type Effects = {
    // Drawn over the characters, under the fog (see particles.ts).
    particles?: readonly Particle[]
    // How far to move the maze this frame, in cells (see shake.ts). The
    // HUD stays put.
    shake?: Vec2
    // How to show which way each player faces (KDA-247; the Facing guide
    // setting): "arrow", an arrow on each player in play, or "aim", the aim
    // preview while `aim` is set too. Neither when left out.
    guide?: FacingGuide
    // Whether the aim preview may show (only while playing, not paused or
    // on end screens): with `guide` "aim", each charged player's preview
    // (see aimPreviews in breath.ts), a faint tint in its colour on the
    // cells its breath would hit, under the dots.
    aim?: boolean
}

export type Renderer = {
    // Draw the game. `alpha` in [0, 1) is how far the loop is between the last
    // logic tick and the next; characters glide between cells with it.
    // `rules` are the level's special rules that change how it looks (fog).
    draw(
        state: GameState,
        alpha: number,
        hud?: Hud,
        rules?: LevelRules,
        effects?: Effects
    ): void
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
    // The solo player's health gauge (with two players each one's is in
    // its marker colour).
    health: "#16a34a",
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

// Each player is drawn as its character's emoji (ANIMALS in roster.ts).
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

// The facing arrow (see Effects.guide): a filled triangle in the player's
// colour just outside its ring, pointing the way it faces, shown only while
// its breath could fire (the aim preview's rule: charged, not stunned).
// Its tip is this far from the sprite's centre and its base this wide, in
// cells.
const ARROW_TIP = 0.7
const ARROW_WIDTH = 0.3

// The aim preview (see Effects.aim) is a tint in the player's colour: a
// faint fill over each cell its breath would hit, and a slightly stronger
// edge round the outside of those cells, this wide as a fraction of a cell.
const AIM_FILL_ALPHA = 0.1
const AIM_EDGE_ALPHA = 0.3
const AIM_EDGE_WIDTH = 0.05

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
        | {
              state: GameState
              alpha: number
              hud: Hud
              rules: LevelRules
              effects: Effects
          }
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
        rules: LevelRules = {},
        effects: Effects = {}
    ) {
        last = { state, alpha, hud, rules, effects }
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

        drawHud(ctx, hud, width, hudHeight)

        ctx.save()
        ctx.translate(0, hudHeight)
        // Characters in a tunnel poke over the map edge; keep them on the map.
        ctx.beginPath()
        ctx.rect(0, 0, cols * cell, rows * cell)
        ctx.clip()
        const fog = rules.fog
            ? createFog(state, alpha, cols, rows, rules.fog.radius)
            : null
        // A shake moves everything in the maze, inside the still clip; the
        // fog's darkness doesn't move, so it covers the edge a shake bares.
        ctx.save()
        const shake = effects.shake
        if (shake && (shake.x !== 0 || shake.y !== 0)) {
            ctx.translate(shake.x * cell, shake.y * cell)
        }
        const aims =
            effects.aim && effects.guide === "aim" ? aimPreviews(state) : []
        drawCells(ctx, state, alpha, cell, fog, aims)
        drawBoss(ctx, state, alpha, cell, cols, rows, fog)
        drawCharacters(
            ctx,
            state,
            alpha,
            cell,
            cols,
            rows,
            fog,
            effects.guide === "arrow"
        )
        if (effects.particles) drawParticles(ctx, effects.particles, cell, fog)
        ctx.restore()
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
            if (last) {
                draw(last.state, last.alpha, last.hud, last.rules, last.effects)
            } else clear()
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
    // Players out of play give no light, unless nobody is in play: then
    // the light stays where they went out.
    const inPlay = state.players.filter((p) => !p.out)
    const lit = inPlay.length > 0 ? inPlay : state.players
    const players = lit.map((p) =>
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
    fog: Fog | null,
    aims: readonly AimPreview[]
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
    const aimed = aimGrid(state, aims)
    state.cells.forEach((row, y) => {
        row.forEach((value, x) => {
            if (fog && !fog.visible(vec2(x, y))) return
            const cx = (x + 0.5) * cell
            const cy = (y + 0.5) * cell
            if (state.ice[y][x]) fillCell(x, y, COLORS.ice)
            for (const look of looks?.[y][x] ?? []) {
                if (look.color) fillCell(x, y, look.color)
            }
            for (const player of aimed?.[y][x] ?? []) {
                ctx.globalAlpha = AIM_FILL_ALPHA
                fillCell(x, y, PLAYER_COLORS[player])
                ctx.globalAlpha = 1
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
    for (const aim of aims) drawAimEdge(ctx, aim, cell, fog)
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

// Per cell [y][x], the players whose aim preview covers it, player 1
// first, or null with no previews (the common case: no grid each frame).
function aimGrid(
    state: GameState,
    aims: readonly AimPreview[]
): number[][][] | null {
    if (aims.length === 0) return null
    const grid: number[][][] = state.cells.map((row) => row.map(() => []))
    for (const { player, cells } of aims) {
        for (const c of cells) grid[c.y][c.x].push(player)
    }
    return grid
}

// The edge of one aim preview: a line along every side of its cells that
// doesn't border another of them, so it outlines the whole shape. In fog,
// cells outside the light get none, as they get no fill.
function drawAimEdge(
    ctx: CanvasRenderingContext2D,
    aim: AimPreview,
    cell: number,
    fog: Fog | null
) {
    const inAim = new Set(aim.cells.map((c) => `${c.x},${c.y}`))
    const has = (x: number, y: number) => inAim.has(`${x},${y}`)
    ctx.save()
    ctx.globalAlpha = AIM_EDGE_ALPHA
    ctx.strokeStyle = PLAYER_COLORS[aim.player]
    ctx.lineWidth = Math.max(1, cell * AIM_EDGE_WIDTH)
    ctx.beginPath()
    for (const { x, y } of aim.cells) {
        if (fog && !fog.visible(vec2(x, y))) continue
        const left = x * cell
        const top = y * cell
        const right = left + cell
        const bottom = top + cell
        if (!has(x, y - 1)) {
            ctx.moveTo(left, top)
            ctx.lineTo(right, top)
        }
        if (!has(x, y + 1)) {
            ctx.moveTo(left, bottom)
            ctx.lineTo(right, bottom)
        }
        if (!has(x - 1, y)) {
            ctx.moveTo(left, top)
            ctx.lineTo(left, bottom)
        }
        if (!has(x + 1, y)) {
            ctx.moveTo(right, top)
            ctx.lineTo(right, bottom)
        }
    }
    ctx.stroke()
    ctx.restore()
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
    fog: Fog | null,
    arrows: boolean
) {
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    // Later characters are drawn on top of earlier ones: the held enemies
    // (e.g. frozen, which players walk onto), the players (player 1 first),
    // then the other enemies. In fog, enemies outside the light are
    // hidden; the players are always in it. A defeated enemy is hidden until
    // it blinks before coming back (enemyVisible). Statuses are drawn by
    // their Look: the colour as a disc behind the sprite, the emoji as a
    // small badge at its top right. A held enemy (e.g. frozen mid-glide) gets
    // no frame alpha: its progress doesn't move on, so it stays exactly where
    // it is drawn instead of creeping forward between ticks. Each player
    // glides at its current rate (Player.rate), as the ticks move it, and
    // with two players wears its marker (see PLAYER_COLORS). A Splitter's
    // half is drawn smaller (HALF_SCALE), its disc and badges too. With
    // `arrows`, each player who could breathe also gets its facing arrow (see
    // drawArrow).
    const marked = state.players.length > 1
    const enemySprite = (enemy: Character) => ({
        character: enemy,
        sprite: ENEMY_SPRITES[enemy.ai],
        rate: 1,
        marker: null,
        badge: null,
        arrow: null,
    })
    const held = state.enemies.filter((e) => hasStatus(e, "holds"))
    const free = state.enemies.filter((e) => !hasStatus(e, "holds"))
    // A player out of play (see takeOut in game.ts) isn't drawn, and one
    // invulnerable after a hit blinks (see playerVisible).
    const sprites = [
        ...held.map(enemySprite),
        ...state.players.flatMap((player, i) =>
            !playerVisible(player)
                ? []
                : [
                      {
                          character: player.character,
                          sprite: playerSprite(player),
                          rate: player.rate,
                          marker: marked ? i : null,
                          badge: versusBadge(player),
                          arrow:
                              arrows &&
                              !stunned(player) &&
                              canBreathe(player.breather)
                                  ? { index: i, facing: player.breather.facing }
                                  : null,
                      },
                  ]
        ),
        ...free.map(enemySprite),
    ]
    for (const { character, sprite, rate, marker, badge, arrow } of sprites) {
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
            if (arrow) drawArrow(ctx, arrow, x, y, cell)
            // A stunned player (versus) wears the stun badge, and one
            // immune just after a stun the immune badge, like a status's.
            const badges = [
                ...looks.filter((look) => look.emoji),
                ...(badge ? [{ emoji: badge }] : []),
            ]
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

// Particles (see particles.ts), each a disc or a square of its colour,
// fading out over its life. In fog, those outside the light are hidden like
// any other thing. They aren't wrapped through tunnels: one flying off the
// map is clipped.
function drawParticles(
    ctx: CanvasRenderingContext2D,
    particles: readonly Particle[],
    cell: number,
    fog: Fog | null
) {
    if (particles.length === 0) return
    ctx.save()
    for (const p of particles) {
        if (fog && !fog.visible(p)) continue
        const alpha = particleAlpha(p)
        if (alpha <= 0) continue
        ctx.globalAlpha = alpha
        ctx.fillStyle = p.color
        const x = (p.x + 0.5) * cell
        const y = (p.y + 0.5) * cell
        const size = Math.max(1, p.size * cell)
        if (p.shape === "square") {
            ctx.fillRect(x - size / 2, y - size / 2, size, size)
        } else {
            ctx.beginPath()
            ctx.arc(x, y, size / 2, 0, Math.PI * 2)
            ctx.fill()
        }
    }
    ctx.restore()
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

// Player `arrow.index`'s facing arrow, for its sprite centred at (x, y): a
// filled triangle in its colour, its base just outside the ring and its tip
// ARROW_TIP cells out along `facing` (a unit step).
function drawArrow(
    ctx: CanvasRenderingContext2D,
    arrow: { index: number; facing: Vec2 },
    x: number,
    y: number,
    cell: number
) {
    const { x: fx, y: fy } = arrow.facing
    const size = cell * SPRITE_SCALE
    // The ring's outer edge (see drawMarker), drawn or not.
    const base = size / 2 + Math.max(1, size * RING_WIDTH)
    const tip = Math.max(base + 2, ARROW_TIP * cell)
    const half = (ARROW_WIDTH * cell) / 2
    ctx.save()
    ctx.fillStyle = PLAYER_COLORS[arrow.index]
    ctx.beginPath()
    ctx.moveTo(x + fx * tip, y + fy * tip)
    // Across the facing: (-fy, fx).
    ctx.lineTo(x + fx * base - fy * half, y + fy * base + fx * half)
    ctx.lineTo(x + fx * base + fy * half, y + fy * base - fx * half)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
}

// Score on the left, the health gauge on the right, the energy meter in the
// middle. With two players (hud.players): player 1's score, meter and
// health on the left, player 2's on the right, each in its marker colour,
// and in versus the round in the middle.
function drawHud(
    ctx: CanvasRenderingContext2D,
    hud: Hud,
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
    const h = height * METER_HEIGHT
    const top = (height - h) / 2
    if (hud.health) {
        const w = width * HEALTH_WIDTH
        const left = width - pad - w
        drawGauge(ctx, hud.health, left, top, w, h, COLORS.health)
    }
    if (hud.energy) {
        const w = width / 4
        drawMeter(ctx, hud.energy, (width - w) / 2, top, w, h)
    }
}

// The bars' height, as a fraction of the HUD strip's.
const METER_HEIGHT = 0.4
// The solo health gauge's width, as a fraction of the HUD's.
const HEALTH_WIDTH = 0.2

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
            player.dots === undefined
                ? `${i + 1}P ${player.score}`
                : `${i + 1}P ${DOT_MARK}${player.dots}`,
            left ? pad : width - pad,
            height / 2
        )
        const meterLeft = left ? width * 0.2 : width * 0.8 - w
        if (player.out) {
            ctx.textAlign = "center"
            // Squeezed into the meter's width, so it never runs into the
            // score on a narrow screen.
            ctx.fillText(outLabel(player.out), meterLeft + w / 2, height / 2, w)
            return
        }
        // With a health gauge, the meter (or the stun countdown) takes the
        // top of the slot and the gauge the bottom.
        const meter = player.health
            ? { top: height * 0.1, h: height * 0.38 }
            : { top: height * 0.3, h: height * METER_HEIGHT }
        if (player.stunned !== undefined) {
            ctx.textAlign = "center"
            const label = stunLabel(player.stunned)
            const y = meter.top + meter.h / 2
            ctx.save()
            // Sized to the meter's band, so it stays clear of the gauge.
            if (player.health) {
                ctx.font = `${Math.round(meter.h * 1.1)}px monospace`
            }
            ctx.fillText(label, meterLeft + w / 2, y, w)
            ctx.restore()
        } else {
            drawMeter(
                ctx,
                player.energy,
                meterLeft,
                meter.top,
                w,
                meter.h,
                color
            )
        }
        if (player.health) {
            const top = height * 0.6
            drawGauge(
                ctx,
                player.health,
                meterLeft,
                top,
                w,
                height * 0.28,
                color
            )
        }
    })
    if (hud.round !== undefined) {
        ctx.fillStyle = COLORS.text
        ctx.textAlign = "center"
        ctx.fillText(hud.round, width / 2, height / 2)
    }
}

// Marks a versus player's dot count in the HUD.
const DOT_MARK = "●"

// What a stunned player's HUD slot shows: the stun badge and the whole
// seconds left (rounded up).
export function stunLabel(seconds: number): string {
    return `${STUN_BADGE} ${Math.max(1, Math.ceil(seconds - 1e-9))}`
}

// Drawn on a stunned player's sprite, and in its HUD slot.
export const STUN_BADGE = "💫"

// Drawn on a versus player's sprite while it is immune to stuns, just after
// one wore off (see STUN_IMMUNITY_SECONDS in versus.ts).
export const IMMUNE_BADGE = "🛡️"

// The badge a versus player's sprite wears: the stun badge while stunned,
// the immune badge while immune, else none.
function versusBadge(player: Player): string | null {
    if (stunned(player)) return STUN_BADGE
    return stunImmune(player) ? IMMUNE_BADGE : null
}

// What an out player's HUD slot shows: the whole seconds left until it is
// back (rounded up, so it counts 3, 2, 1), "back soon" once it is due but
// waiting for its spawn to be clear, or that it is out for good.
export function outLabel(out: { respawnIn: number | null }): string {
    if (out.respawnIn === null) return "OUT"
    if (out.respawnIn <= 0) return "back soon"
    return `back in ${Math.max(1, Math.ceil(out.respawnIn - 1e-9))}`
}

// A health gauge: a bar `w` by `h` from (`left`, `top`), filled in `color`
// up to the health left, framed in it too.
function drawGauge(
    ctx: CanvasRenderingContext2D,
    gauge: HealthHud,
    left: number,
    top: number,
    w: number,
    h: number,
    color: string
) {
    const fraction =
        gauge.max > 0 ? Math.max(0, Math.min(1, gauge.health / gauge.max)) : 0
    ctx.fillStyle = color
    ctx.fillRect(left, top, w * fraction, h)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.strokeRect(left, top, w, h)
}

// The energy meter: a framed bar `w` by `h` from (`left`, `top`), filled up
// to the energy, with a mark at every multiple of the breath's cost (so the
// player sees how many breaths it holds). The fill is bright while a breath
// is ready and grey otherwise. `frame` colours the frame (and the marks).
function drawMeter(
    ctx: CanvasRenderingContext2D,
    meter: EnergyHud,
    left: number,
    top: number,
    w: number,
    h: number,
    frame: string = COLORS.meter
) {
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
