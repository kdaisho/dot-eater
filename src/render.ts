import { footprint, type Boss } from "./boss"
import { bossLooks, bossWarning, windingUp } from "./bossBreath"
import {
    defeatCentre,
    defeatZoom,
    hopHeight,
    hopOrder,
    type BossDefeat,
} from "./bossDefeat"
import {
    defeatMoment,
    drawDefeatBoss,
    drawDefeatFlash,
    drawDefeatFloor,
    drawDefeatFx,
    drawHeart,
    type DefeatSpot,
} from "./defeatRender"
import { enemyBreathLooks, enemyWarnings } from "./enemyBreath"
import {
    affordable,
    aimPreviews,
    canBreathe,
    chargeLevel,
    enemyVisible,
    hasStatus,
    MAX_CHARGE,
    type AimPreview,
    type Breather,
    type EnergyHud,
    type Look,
} from "./breath"
import {
    clampView,
    easeView,
    inView,
    viewFor,
    viewOrigin,
    type View,
    type Viewport,
} from "./camera"
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
import {
    eatenDotVisible,
    glidePos,
    glideT,
    moveStep,
    wrapCopies,
} from "./glide"
import { sneakAlpha } from "./intercept"
import { computeLayout, type Layout } from "./layout"
import type { LevelRules } from "./level"
import { particleAlpha, type Particle } from "./particles"
import type { FacingGuide } from "./settings"
import { isSplitterHalf } from "./splitter"
import {
    ANIMAL_SPRITES,
    BadgeId,
    BOSS_SPRITES,
    createSpriteCache,
    drawSprite,
    ENEMY_SPRITES,
    facesRight,
    mirrored,
    SpriteId,
    SPRITES,
    visibleTails,
    walkFrame,
    type SpriteCache,
    type SpriteLook,
} from "./sprites"
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
    // middle. A co-op story run (KDA-271) puts its total there too
    // ("Total 1230").
    round?: string
    // On a boss level, the boss's health (see bossHud in game.ts): the
    // stage's goal (KDA-267), drawn as a band along the bottom of the
    // strip, in every mode, so it shows wherever the boss is on the map.
    boss?: HealthHud
    // The difficulty's name (e.g. "Hard"), small: with one player between
    // the meter and the health gauge, with two in the middle (under the
    // round in versus).
    difficulty?: string
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
    // Whether the system asks for reduced motion: a full charge's glow
    // then doesn't flicker (see chargeAura).
    reducedMotion?: boolean
    // Whether the boss's wind-up shows (KDA-268; see bossBreath.ts): its
    // glow and the warning tint on the cells it will strike. Set while
    // playing, paused and in the ending outro, not on end screens. The
    // breathers' wind-ups (KDA-291, see enemyBreath.ts) show with it.
    bossBreath?: boolean
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
    // The fill a tile's emoji is drawn with. Opaque: canvas draws colour
    // emoji with the fill colour's alpha, so drawing one right after a
    // translucent look would leave it see-through.
    sprite: "#000",
    wall: "#000",
    dot: "#000",
    // Ice floor: a pale blue tile under the dot.
    ice: "#d6f0fb",
    text: "#000",
    // The fog's darkness, as RGB so the soft edge can fade it in.
    fog: "17, 17, 17",
    // The energy meter: its frame and cost marks, the fill while a breath
    // is ready, and the fill while it isn't (too little energy or cooling
    // down); and the levels a held breath has charged (KDA-289).
    meter: "#000",
    meterReady: "#f59e0b",
    meterCharging: "#9ca3af",
    meterCharge: "#dc2626",
    // The solo player's health gauge (with two players each one's is in
    // its marker colour).
    health: "#16a34a",
    // The boss's health bar: health left over a dark track, framed; and
    // its flash when hit.
    bossHealth: "#dc2626",
    bossTrack: "#374151",
    bossFrame: "#000",
    bossFlash: "#fff",
    // The HUD's boss band: the health lost, pale against the white strip
    // and the maze's black top edge (the health left is bossHealth).
    bossBandTrack: "#fecaca",
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

// Each player is drawn as its character's sprite (see sprites.ts).
function playerSprite(player: Player): SpriteId {
    return ANIMAL_SPRITES[player.breather.breath.animal]
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

// A player charging its breath (KDA-289) glows (user feedback 2026-11-01:
// the meter alone was hard to watch while playing), during the cooldown
// too and while a charge let go then waits to fire (KDA-295): a disc behind
// its sprite, CHARGE_AURA_BASE times as wide as the sprite at level 1 and
// CHARGE_AURA_GROWTH of the sprite wider each level. In amber like a ready meter, then in the
// meter's charge red, flickering CHARGE_FLICKER_HZ times a second, once
// it is fully charged (MAX_CHARGE, or all the meter pays for). With reduced
// motion it doesn't flicker. Placeholders to tune at preview.
export const CHARGE_AURA_BASE = 1.2
export const CHARGE_AURA_GROWTH = 0.15
export const CHARGE_AURA_ALPHA = 0.45
export const CHARGE_AURA_FULL_ALPHA = 0.6
export const CHARGE_FLICKER_HZ = 8

// The aim preview (see Effects.aim) is a tint in the player's colour: a
// faint fill over each cell its breath would hit, and a slightly stronger
// edge round the outside of those cells, this wide as a fraction of a cell.
const AIM_FILL_ALPHA = 0.1
const AIM_EDGE_ALPHA = 0.3
const AIM_EDGE_WIDTH = 0.05

// Enemies look like what they do (ENEMY_SPRITES in sprites.ts, a Record
// over AiType, so a new AI type without a sprite is a type error). A
// Splitter's half (see splitter.ts) has a sprite of its own, drawn at this
// fraction of the usual sprite size.
export const HALF_SCALE = 0.65

// The boss (see boss.ts): its kind's sprite (BOSS_SPRITES: the Kitsune or
// the final boss), drawn at this many times the usual sprite size, so it
// fills its 2x2 footprint as an enemy fills its cell.
export const BOSS_SCALE = 2
// Its health bar runs along the top of the footprint, above the sprite: as
// wide as the sprite and this tall, as a fraction of a cell.
const BOSS_BAR_HEIGHT = 0.12
// How opaque the white flash over the sprite is just after a hit.
const BOSS_FLASH_ALPHA = 0.7
// The disc of a look on the boss (its glow while it winds up) is this much
// wider than the sprite, so it shows round it.
const BOSS_GLOW_SCALE = 1.15

// A status's pixel badge (BADGES in sprites.ts) is this size, as a
// fraction of the sprite's.
const BADGE_SCALE = 0.5

// Wall blocks and dots keep the proportions of the old span grid: 30px blocks
// on a 35px pitch and 5px dots.
const WALL_SCALE = 30 / 35
const DOT_SCALE = 5 / 35

export type RendererOptions = {
    // The window to fit; defaults to the global one.
    view?: Pick<Window, "innerWidth" | "innerHeight" | "devicePixelRatio">
    // The time in milliseconds, for easing the view after the players
    // (camera.ts); defaults to performance.now.
    now?: () => number
}

export function createRenderer(
    canvas: HTMLCanvasElement,
    options: RendererOptions = {}
): Renderer {
    const view = options.view ?? window
    const now = options.now ?? (() => performance.now())
    const ctx = canvas.getContext("2d")
    // The sprites' rasters, made on first use per look and size.
    const sprites = createSpriteCache(() =>
        canvas.ownerDocument.createElement("canvas")
    )
    // Which way each character faced last (see facesRight), so one going
    // up or down keeps its side; forgotten with the character.
    const facing = new WeakMap<object, boolean>()
    let layout: Layout | undefined
    // The part of the maze on screen (see camera.ts), the game it follows
    // and when it last moved. A new game or a new layout starts it afresh,
    // right on the players.
    let camera: { view: View; state: GameState; time: number } | undefined
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
        camera = undefined
    }

    // Where the view is this frame: eased after the players in play (their
    // midpoint, both kept in view), or held where it was while nobody is in
    // play. A fresh view starts right on the players (all of them when none
    // is in play). It zooms in no closer than the layout's cell size.
    function follow(
        state: GameState,
        alpha: number,
        viewport: Viewport,
        close: number
    ) {
        const maze = { cols, rows }
        const time = now()
        const inPlay = state.players.filter((p) => !p.out)
        const viewOf = (players: readonly Player[]) =>
            viewFor(
                maze,
                viewport,
                players.map((p) =>
                    glidePos(p.character, alpha, cols, rows, p.rate)
                ),
                close
            )
        let next: View
        if (state.defeat && camera?.state === state) {
            // The boss's defeat (KDA-301): the view eases over to where it
            // fell, on a maze that scrolls.
            const dt = (time - camera.time) / 1000
            const onBoss = viewFor(
                maze,
                viewport,
                [defeatCentre(state.defeat)],
                close
            )
            next = clampView(
                easeView(camera.view, onBoss, dt),
                maze,
                viewport,
                close
            )
        } else if (!camera || camera.state !== state) {
            next = viewOf(inPlay.length > 0 ? inPlay : state.players)
        } else if (inPlay.length === 0) {
            next = camera.view
        } else {
            const dt = (time - camera.time) / 1000
            const eased = easeView(camera.view, viewOf(inPlay), dt)
            next = clampView(eased, maze, viewport, close)
        }
        camera = { view: next, state, time }
        return next
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
        const { hudHeight, width, height, dpr } = layout
        const viewport = { width, height: height - hudHeight }
        // The view this frame (see camera.ts). From here on `cell` is its
        // cell size: the layout's, or less while the view zooms out to keep
        // two players in view.
        const shot = follow(state, alpha, viewport, layout.cell)
        const cell = shot.cell
        const origin = viewOrigin(shot, viewport)
        // The part of the maze on screen, in maze pixels; its corner on a
        // whole device pixel so cell edges stay crisp.
        const screen = {
            x: Math.round(origin.x * cell * dpr) / dpr || 0,
            y: Math.round(origin.y * cell * dpr) / dpr || 0,
            ...viewport,
        }

        // Work in CSS pixels; the transform scales to device pixels.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = COLORS.background
        ctx.fillRect(0, 0, width, height)

        drawHud(ctx, hud, width, hudHeight)

        ctx.save()
        ctx.translate(0, hudHeight)
        // Characters in a tunnel poke over the map edge; keep them on the map,
        // and the map off the HUD.
        const clipLeft = Math.max(0, -screen.x)
        const clipTop = Math.max(0, -screen.y)
        ctx.beginPath()
        ctx.rect(
            clipLeft,
            clipTop,
            Math.min(viewport.width, cols * cell - screen.x) - clipLeft,
            Math.min(viewport.height, rows * cell - screen.y) - clipTop
        )
        ctx.clip()
        // Everything below is drawn in maze space, moved by the view.
        if (screen.x !== 0 || screen.y !== 0) {
            ctx.translate(-screen.x, -screen.y)
        }
        const fog = rules.fog
            ? createFog(state, alpha, cols, rows, rules.fog.radius)
            : null
        const seen = sight(fog, shot, viewport, cols, rows)
        // A shake moves everything in the maze, inside the still clip; the
        // fog's darkness doesn't move, so it covers the edge a shake bares.
        ctx.save()
        const shake = effects.shake
        if (shake && (shake.x !== 0 || shake.y !== 0)) {
            ctx.translate(shake.x * cell, shake.y * cell)
        }
        // A boss's defeat (KDA-301, see defeatRender.ts): the moment to draw,
        // and the view zoomed in on where the boss fell.
        const fall = defeatScene(state, alpha, cell)
        if (fall) {
            const z = defeatZoom(fall.defeat, fall.e)
            ctx.translate(fall.spot.x, fall.spot.y)
            ctx.scale(z, z)
            ctx.translate(-fall.spot.x, -fall.spot.y)
        }
        const aims =
            effects.aim && effects.guide === "aim" ? aimPreviews(state) : []
        const windUp = effects.bossBreath === true
        drawCells(ctx, state, alpha, cell, seen, tintsFor(state, aims, windUp))
        const art = { sprites, facing, dpr }
        if (fall) drawDefeatFloor(ctx, fall.defeat, fall.spot, fall.e)
        drawBoss(ctx, art, state, alpha, cell, cols, rows, seen, windUp)
        if (fall && state.boss) {
            drawDefeatBoss(ctx, fall.defeat, state.boss, fall.spot, fall.e)
        }
        drawCharacters(
            ctx,
            art,
            state,
            alpha,
            cell,
            cols,
            rows,
            seen,
            effects.guide === "arrow",
            effects.reducedMotion === true,
            windUp,
            fall
        )
        if (effects.particles) drawParticles(ctx, effects.particles, cell, seen)
        if (fall && state.boss) {
            drawDefeatFx(ctx, fall.defeat, state.boss, fall.spot, fall.e)
        }
        ctx.restore()
        if (fog) {
            drawDarkness(ctx, fog, cell, cols, rows, darknessLayer, dpr, screen)
        }
        ctx.restore()
        // The defeat's white flashes cover the maze, not the HUD.
        if (fall) {
            ctx.save()
            ctx.translate(0, hudHeight)
            drawDefeatFlash(
                ctx,
                fall.defeat,
                viewport.width,
                viewport.height,
                fall.e
            )
            ctx.restore()
        }
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

// The fog for one frame: each player's light is centred on where it is
// drawn (mid-glide), `radius` cells across times its breath's sightScale
// (the Owl sees further), and anything wholly outside every light is
// hidden.
type Light = { pos: Vec2; radius: number }

type Fog = {
    lights: Light[]
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
    const lights = lit.map((p) => ({
        pos: glidePos(p.character, alpha, cols, rows, p.rate),
        radius: radius * (p.breather.breath.sightScale ?? 1),
    }))
    const wrap = fogWrap(state.cells)
    return {
        lights,
        wrap,
        visible: (p) =>
            lights.some(
                (light) =>
                    fogDistance(p, light.pos, cols, rows, wrap) <=
                    light.radius + FOG_REACH
            ),
    }
}

// What shows this frame: things in the view (or whose copy across a
// tunnel is) and, in fog, in the light. The draw functions' `fog` parameter
// takes it, and skips anything it hides.
type Sight = { visible(p: Vec2): boolean }

function sight(
    fog: Fog | null,
    view: View,
    viewport: Viewport,
    cols: number,
    rows: number
): Sight {
    return {
        visible: (p) =>
            wrapCopies(p, cols, rows).some((c) => inView(view, viewport, c)) &&
            (!fog || fog.visible(p)),
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
// `screen` is the part of the map on screen, in the map's pixels: the layer
// covers just that, so it keeps its size as the view moves and zooms.
function drawDarkness(
    ctx: CanvasRenderingContext2D,
    fog: Fog,
    cell: number,
    cols: number,
    rows: number,
    layer: () => Layer,
    dpr: number,
    screen: Rect
) {
    if (fog.lights.length > 1) {
        drawSharedDarkness(ctx, fog, cell, cols, rows, layer(), dpr, screen)
        return
    }
    const [{ pos, radius }] = fog.lights
    const outer = radius * cell
    const inner = Math.max(0, radius - FOG_SOFT_EDGE) * cell
    for (const c of lightCentres(pos, cols, rows, fog.wrap)) {
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

// A rectangle, in pixels.
type Rect = { x: number; y: number; width: number; height: number }

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
    dpr: number,
    screen: Rect
) {
    const dark = layer.ctx
    if (!dark) return
    // Resizing a canvas reallocates it, so only when the size changes.
    const pixelWidth = Math.ceil(screen.width * dpr)
    const pixelHeight = Math.ceil(screen.height * dpr)
    if (layer.canvas.width !== pixelWidth) layer.canvas.width = pixelWidth
    if (layer.canvas.height !== pixelHeight) layer.canvas.height = pixelHeight
    // Last frame's darkness is still there: start from a clear layer.
    dark.setTransform(1, 0, 0, 1, 0, 0)
    dark.globalCompositeOperation = "source-over"
    dark.clearRect(0, 0, pixelWidth, pixelHeight)
    dark.setTransform(dpr, 0, 0, dpr, -screen.x * dpr, -screen.y * dpr)
    dark.globalCompositeOperation = "source-over"
    dark.fillStyle = `rgb(${COLORS.fog})`
    dark.fillRect(0, 0, cols * cell, rows * cell)
    dark.globalCompositeOperation = "destination-out"
    for (const { pos, radius } of fog.lights) {
        const outer = radius * cell
        const inner = Math.max(0, radius - FOG_SOFT_EDGE) * cell
        for (const c of lightCentres(pos, cols, rows, fog.wrap)) {
            const x = (c.x + 0.5) * cell
            const y = (c.y + 0.5) * cell
            // A light wholly off screen clears nothing that shows.
            if (
                x + outer < screen.x ||
                x - outer > screen.x + screen.width ||
                y + outer < screen.y ||
                y - outer > screen.y + screen.height
            ) {
                continue
            }
            const light = dark.createRadialGradient(x, y, inner, x, y, outer)
            light.addColorStop(0, "rgba(0, 0, 0, 1)")
            light.addColorStop(1, "rgba(0, 0, 0, 0)")
            dark.fillStyle = light
            dark.fillRect(x - outer, y - outer, outer * 2, outer * 2)
        }
    }
    dark.globalCompositeOperation = "source-over"
    ctx.drawImage(layer.canvas, screen.x, screen.y, screen.width, screen.height)
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
    fog: Sight | null,
    tints: readonly Tint[]
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
    const tinted = tintGrid(state, tints)
    state.cells.forEach((row, y) => {
        row.forEach((value, x) => {
            if (fog && !fog.visible(vec2(x, y))) return
            const cx = (x + 0.5) * cell
            const cy = (y + 0.5) * cell
            if (state.ice[y][x]) fillCell(x, y, COLORS.ice)
            for (const look of looks?.[y][x] ?? []) {
                if (look.color) fillCell(x, y, look.color)
            }
            for (const color of tinted?.[y][x] ?? []) {
                ctx.globalAlpha = AIM_FILL_ALPHA
                fillCell(x, y, color)
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
    for (const tint of tints) drawTintEdge(ctx, tint, cell, fog)
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
    ctx.fillStyle = COLORS.sprite
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

// A faint tint over some cells, with a slightly stronger edge round them,
// drawn under the dots: a player's aim preview in its colour, or the
// boss's warning while it winds up its breath (see bossWarning).
type Tint = { cells: readonly Vec2[]; color: string }

// The tints to draw this frame: each aim preview in its player's colour
// (player 1 first), then, with `windUp` (Effects.bossBreath), the boss's
// warning if it is winding up, and each breather's that is (KDA-291). The
// warnings come from their state and their own colours (BOSS_BREATH in
// bossBreath.ts, ENEMY_BREATH in enemyBreath.ts), so nothing here knows the
// breaths.
function tintsFor(
    state: GameState,
    aims: readonly AimPreview[],
    windUp: boolean
): Tint[] {
    const tints: Tint[] = aims.map(({ player, cells }) => ({
        cells,
        color: PLAYER_COLORS[player],
    }))
    if (!windUp) return tints
    const warning = bossWarning(state)
    if (warning && warning.cells.length > 0) tints.push(warning)
    tints.push(...enemyWarnings(state))
    return tints
}

// Per cell [y][x], the colours of the tints covering it, in order, or null
// with no tints (the common case: no grid each frame).
function tintGrid(
    state: GameState,
    tints: readonly Tint[]
): string[][][] | null {
    if (tints.length === 0) return null
    const grid: string[][][] = state.cells.map((row) => row.map(() => []))
    for (const { color, cells } of tints) {
        for (const c of cells) grid[c.y][c.x].push(color)
    }
    return grid
}

// The edge of one tint: a line along every side of its cells that doesn't
// border another of them, so it outlines the whole shape. In fog, cells
// outside the light get none, as they get no fill.
function drawTintEdge(
    ctx: CanvasRenderingContext2D,
    tint: Tint,
    cell: number,
    fog: Sight | null
) {
    const inTint = new Set(tint.cells.map((c) => `${c.x},${c.y}`))
    const has = (x: number, y: number) => inTint.has(`${x},${y}`)
    ctx.save()
    ctx.globalAlpha = AIM_EDGE_ALPHA
    ctx.strokeStyle = tint.color
    ctx.lineWidth = Math.max(1, cell * AIM_EDGE_WIDTH)
    ctx.beginPath()
    for (const { x, y } of tint.cells) {
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

// What the sprite drawing needs from the renderer: the raster cache, each
// character's last facing (see facesRight) and the device pixel ratio.
type Art = {
    sprites: SpriteCache
    facing: WeakMap<object, boolean>
    dpr: number
}

// A boss's defeat as this frame draws it (KDA-301), or null for none: the
// defeat, its moment and where the boss fell, in maze pixels at `cell`.
type DefeatScene = { defeat: BossDefeat; e: number; spot: DefeatSpot }

function defeatScene(
    state: GameState,
    alpha: number,
    cell: number
): DefeatScene | null {
    const { defeat } = state
    if (!defeat) return null
    const centre = defeatCentre(defeat)
    return {
        defeat,
        e: defeatMoment(defeat, alpha),
        spot: {
            x: (centre.x + 0.5) * cell,
            y: (centre.y + 0.5) * cell,
            size: cell * SPRITE_SCALE * BOSS_SCALE,
            cell,
        },
    }
}

// The boss, unless it is defeated (gone for good): its sprite centred on
// its gliding 2x2 footprint, under the other characters, with a thin health
// bar above the sprite and a white flash over it just after a hit. The
// Kitsune shows a tail per ninth of its health left (visibleTails), and the
// final boss blazes (its windUp grid) while it winds up its breath, with
// `windUp`. In fog it is hidden once none of its four cells reaches into
// the light. Boss levels have no tunnels, so it never needs wrap copies.
function drawBoss(
    ctx: CanvasRenderingContext2D,
    art: Art,
    state: GameState,
    alpha: number,
    cell: number,
    cols: number,
    rows: number,
    fog: Sight | null,
    windUp: boolean
) {
    const { boss } = state
    if (!boss || boss.defeated) return
    const pos = glidePos(boss, alpha, cols, rows)
    if (fog && !footprint(pos).some((p) => fog.visible(p))) return
    const size = cell * SPRITE_SCALE * BOSS_SCALE
    const x = (pos.x + 1) * cell
    const y = (pos.y + 1) * cell
    // Its looks (see bossLooks: the glow while it winds up its breath, with
    // `windUp`), each colour as a disc behind the sprite, like an enemy
    // status's.
    for (const look of windUp ? bossLooks(state) : []) {
        if (!look.color) continue
        ctx.fillStyle = look.color
        ctx.beginPath()
        ctx.arc(x, y, (size / 2) * BOSS_GLOW_SCALE, 0, Math.PI * 2)
        ctx.fill()
    }
    drawSprite(ctx, art.sprites, bossLook(boss, windUp), x, y, size, art.dpr)
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
    art: Art,
    state: GameState,
    alpha: number,
    cell: number,
    cols: number,
    rows: number,
    fog: Sight | null,
    arrows: boolean,
    reducedMotion: boolean,
    windUp: boolean,
    fall: DefeatScene | null = null
) {
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    // Later characters are drawn on top of earlier ones: the held enemies
    // (e.g. frozen, which players walk onto), the players (player 1 first),
    // then the other enemies. In fog, enemies outside the light are
    // hidden; the players are always in it. A defeated enemy is hidden until
    // it blinks before coming back (enemyVisible). Statuses are drawn by
    // their Look: the colour as a disc behind the sprite, the badge as a
    // small pixel badge at its top right. A held enemy (e.g. frozen mid-glide) gets
    // no frame alpha: its progress doesn't move on, so it stays exactly where
    // it is drawn instead of creeping forward between ticks. Sprites face
    // the way they last went sideways (a player its breath's facing) and
    // step through their walk frames while gliding (characterLook). Each
    // player
    // glides at its current rate (Player.rate), as the ticks move it, and
    // with two players wears its marker (see PLAYER_COLORS). A Splitter's
    // half is drawn smaller (HALF_SCALE), its disc and badges too. With
    // `arrows`, each player who could breathe also gets its facing arrow (see
    // drawArrow). With `windUp`
    // (Effects.bossBreath), a breather winding up its breath glows, a disc
    // like a status's colour (see enemyBreathLooks, KDA-291). An
    // interceptor (KDA-292) sneaks: it is drawn faint away from the players
    // and fades in as it closes in on the nearest one in play (sneakAlpha),
    // its disc and badges with it; fog hides it as it does any enemy.
    // After the final boss falls (`fall`, KDA-303), everyone on the map
    // hops in place (hopHeight), and each enemy gets a heart over it.
    const marked = state.players.length > 1
    const wrap = fogWrap(state.cells)
    const hunted = state.players.flatMap((p) =>
        p.out ? [] : [glidePos(p.character, alpha, cols, rows, p.rate)]
    )
    const sneak = (pos: Vec2) =>
        sneakAlpha(
            Math.min(
                ...hunted.map((p) => fogDistance(pos, p, cols, rows, wrap))
            )
        )
    const enemySprite = (enemy: Character) => ({
        character: enemy,
        sprite: isSplitterHalf(enemy)
            ? SpriteId.splitterHalf
            : ENEMY_SPRITES[enemy.ai],
        rate: 1,
        facingX: null,
        marker: null,
        badge: null,
        arrow: null,
        aura: null,
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
                          facingX: player.breather.facing.x,
                          marker: marked ? i : null,
                          badge: versusBadge(player),
                          arrow:
                              arrows &&
                              !stunned(player) &&
                              canBreathe(player.breather)
                                  ? { index: i, facing: player.breather.facing }
                                  : null,
                          aura: stunned(player)
                              ? null
                              : chargeAura(player.breather, reducedMotion),
                      },
                  ]
        ),
        ...free.map(enemySprite),
    ]
    for (const sprite of sprites) {
        const { character, rate, marker, badge, arrow, aura } = sprite
        const isPlayer = character.id === CharacterId.player
        if (!isPlayer && !enemyVisible(character)) continue
        const held = !isPlayer && hasStatus(character, "holds")
        const pos = glidePos(character, held ? 0 : alpha, cols, rows, rate)
        if (fog && !isPlayer && !fog.visible(pos)) continue
        const looks = [
            ...character.statuses.flatMap((s) =>
                s.status.look ? [s.status.look] : []
            ),
            ...(windUp && !isPlayer ? enemyBreathLooks(character) : []),
        ]
        const size =
            cell *
            SPRITE_SCALE *
            (!isPlayer && isSplitterHalf(character) ? HALF_SCALE : 1)
        const faint = character.ai === AiType.interceptor && !isPlayer
        if (faint) ctx.globalAlpha = sneak(pos)
        const look = characterLook(
            sprite.sprite,
            character,
            held ? 0 : alpha,
            rate,
            sprite.facingX,
            art.facing,
            cols,
            rows
        )
        const order = fall
            ? isPlayer
                ? hopOrder(
                      fall.defeat,
                      "player",
                      state.players.findIndex(
                          (pl) => pl.character === character
                      )
                  )
                : hopOrder(
                      fall.defeat,
                      "enemy",
                      state.enemies.indexOf(character)
                  )
            : -1
        const hop =
            fall && order >= 0 ? hopHeight(fall.defeat, order, fall.e) : 0
        for (const p of wrapCopies(pos, cols, rows)) {
            const x = (p.x + 0.5) * cell
            const y = (p.y + 0.5 - hop) * cell
            if (aura) {
                ctx.globalAlpha = aura.alpha
                ctx.fillStyle = aura.color
                ctx.beginPath()
                ctx.arc(x, y, (size / 2) * aura.scale, 0, Math.PI * 2)
                ctx.fill()
                ctx.globalAlpha = 1
            }
            for (const look of looks) {
                if (!look.color) continue
                ctx.fillStyle = look.color
                ctx.beginPath()
                ctx.arc(x, y, size / 2, 0, Math.PI * 2)
                ctx.fill()
            }
            drawSprite(ctx, art.sprites, look, x, y, size, art.dpr)
            if (marker !== null) drawMarker(ctx, marker, x, y, size)
            // A stunned player (versus) wears the stun badge, and one
            // immune just after a stun the immune badge, like a status's.
            const badges = [
                ...looks.flatMap((look) => (look.badge ? [look.badge] : [])),
                ...(badge ? [badge] : []),
            ]
            badges.forEach((id, i) => {
                drawSprite(
                    ctx,
                    art.sprites,
                    { badge: id },
                    x + size / 2 - i * size * BADGE_SCALE,
                    y - size / 2,
                    size * BADGE_SCALE,
                    art.dpr
                )
            })
            if (fall && order >= 0 && !isPlayer) {
                drawHeart(
                    ctx,
                    art.sprites,
                    art.dpr,
                    fall.defeat,
                    order,
                    { x, y },
                    cell,
                    fall.e
                )
            }
        }
        if (faint) ctx.globalAlpha = 1
        if (!arrow) continue
        for (const p of wrapCopies(pos, cols, rows)) {
            drawArrow(ctx, arrow, (p.x + 0.5) * cell, (p.y + 0.5) * cell, cell)
        }
    }
}

// How the boss's sprite looks (see drawBoss): its kind's, with the
// Kitsune's tails by health and the final boss's wind-up grid while it
// winds up (and `windUp` shows wind-ups).
export function bossLook(boss: Boss, windUp: boolean): SpriteLook {
    const id = BOSS_SPRITES[boss.kind]
    return {
        id,
        ...(SPRITES[id].windUp ? { windUp: windUp && windingUp(boss) } : {}),
        ...(SPRITES[id].tails
            ? { tails: visibleTails(boss.health, boss.maxHealth) }
            : {}),
    }
}

// How a character's sprite `id` looks this frame: facing the way it last
// went sideways (an enemy by its latest move, a player by `facingX`, its
// breath's facing; right is mirrored for side views, and players start
// facing right as their breath does), and on frame 1 for the first half of
// each glide (walkFrame). `facing` remembers each one's side from frame to
// frame.
export function characterLook(
    id: SpriteId,
    character: Character,
    alpha: number,
    rate: number,
    facingX: number | null,
    facing: WeakMap<object, boolean>,
    cols: number,
    rows: number
): SpriteLook {
    const step = moveStep(character.lastPos, character.pos, cols, rows)
    const moving = step.x !== 0 || step.y !== 0
    const t = glideT(character, alpha, rate)
    const before = facing.get(character) ?? facingX !== null
    const right = facesRight(before, facingX ?? step.x)
    facing.set(character, right)
    return {
        id,
        frame: walkFrame(SPRITES[id].frames.length, moving, t),
        mirror: mirrored(id, right),
    }
}

// The glow round a player charging its breath (see CHARGE_AURA_GROWTH):
// its colour, its alpha and its size as a factor of the sprite's, or null
// while the breath isn't charging.
export type ChargeAura = { color: string; alpha: number; scale: number }

export function chargeAura(
    breather: Breather,
    reducedMotion: boolean
): ChargeAura | null {
    if (breather.charge === null) return null
    const level = chargeLevel(breather)
    const scale = CHARGE_AURA_BASE + (level - 1) * CHARGE_AURA_GROWTH
    const full = level >= MAX_CHARGE || level >= affordable(breather)
    if (!full) {
        return { color: COLORS.meterReady, alpha: CHARGE_AURA_ALPHA, scale }
    }
    // Bright on the first half of each flicker, faint on the second; steady
    // while a charge let go during the cooldown waits to fire (KDA-295: its
    // held time no longer runs).
    const bright =
        reducedMotion ||
        breather.fireAt !== null ||
        (breather.charge * CHARGE_FLICKER_HZ) % 1 < 0.5
    return {
        color: COLORS.meterCharge,
        alpha: bright ? CHARGE_AURA_FULL_ALPHA : CHARGE_AURA_ALPHA / 2,
        scale,
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
    fog: Sight | null
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
// and in versus the round in the middle. On a boss level, the boss's band
// along the bottom under all of them. The difficulty goes where there is
// room (see Hud).
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
    if (hud.boss) drawBossBand(ctx, hud.boss, width, height, pad)
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
    if (hud.difficulty !== undefined) {
        // In the gap between the meter's right end and the gauge.
        const left = width * 0.625 + pad
        const right = width - pad - width * HEALTH_WIDTH - pad
        drawLabel(ctx, hud.difficulty, (left + right) / 2, height / 2, {
            width: right - left,
            size: height * LABEL_SIZE,
        })
    }
}

// The difficulty label's text size, and the versus round's when it shares
// the middle with it, as a fraction of the HUD strip's height.
const LABEL_SIZE = 0.45

// Centred text at (x, y) in the HUD's text colour, `size` high, squeezed
// into `width` if it is wider.
function drawLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    { width, size }: { width: number; size: number }
) {
    ctx.save()
    ctx.fillStyle = COLORS.text
    ctx.textAlign = "center"
    ctx.font = `${Math.round(size)}px monospace`
    ctx.fillText(text, x, y, Math.max(width, 1))
    ctx.restore()
}

// The bars' height, as a fraction of the HUD strip's.
const METER_HEIGHT = 0.4
// The boss band's height, as a fraction of the HUD strip's: below the
// solo bars (which end at 0.7) and the 2-player health gauges (0.88).
const BOSS_BAND = 0.1

// The boss's health as a band along the bottom of the HUD strip, from `pad`
// to `pad` off the right edge: the health left in the boss's colour (as
// its bar on the map), the rest pale. Text and bars are drawn over it.
function drawBossBand(
    ctx: CanvasRenderingContext2D,
    gauge: HealthHud,
    width: number,
    height: number,
    pad: number
) {
    const fraction =
        gauge.max > 0 ? Math.max(0, Math.min(1, gauge.health / gauge.max)) : 0
    const h = height * BOSS_BAND
    const top = height - h
    const w = width - 2 * pad
    ctx.save()
    ctx.fillStyle = COLORS.bossBandTrack
    ctx.fillRect(pad, top, w, h)
    ctx.fillStyle = COLORS.bossHealth
    ctx.fillRect(pad, top, w * fraction, h)
    ctx.restore()
}
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
    // The middle, between the two meters: the round and the difficulty, one
    // above the other when there are both, the lower one clear of a boss
    // band. Player 1's meter ends at 35% of the width, and player 2's starts
    // at 65%.
    const middle = width * 0.3 - 2 * pad
    if (hud.round !== undefined && hud.difficulty !== undefined) {
        const size = height * LABEL_SIZE
        drawLabel(ctx, hud.round, width / 2, height * 0.29, {
            width: middle,
            size,
        })
        drawLabel(ctx, hud.difficulty, width / 2, height * 0.69, {
            width: middle,
            size,
        })
    } else if (hud.round !== undefined) {
        ctx.fillStyle = COLORS.text
        ctx.textAlign = "center"
        ctx.fillText(hud.round, width / 2, height / 2)
    } else if (hud.difficulty !== undefined) {
        drawLabel(ctx, hud.difficulty, width / 2, height / 2, {
            width: middle,
            size: height * LABEL_SIZE,
        })
    }
}

// Marks a versus player's dot count in the HUD.
const DOT_MARK = "●"

// What a stunned player's HUD slot shows: the whole seconds left (rounded
// up), like an out player's "back in".
export function stunLabel(seconds: number): string {
    return `stunned ${Math.max(1, Math.ceil(seconds - 1e-9))}`
}

// Drawn on a stunned player's sprite.
export const STUN_BADGE = BadgeId.stunned

// Drawn on a versus player's sprite while it is immune to stuns, just after
// one wore off (see STUN_IMMUNITY_SECONDS in versus.ts).
export const IMMUNE_BADGE = BadgeId.immune

// The badge a versus player's sprite wears: the stun badge while stunned,
// the immune badge while immune, else none.
function versusBadge(player: Player): BadgeId | null {
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
// to the energy, with a mark at every multiple of the breath's cost per
// level (so the player sees how many levels it holds). The fill is bright
// while a breath is ready and grey otherwise. While the breath charges
// (KDA-289), the energy the level reached would spend, one segment a
// level, is filled in the charge colour over it. `frame` colours the frame
// (and the marks).
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
    const charged =
        meter.max > 0 ? ((meter.charge ?? 0) * meter.cost) / meter.max : 0
    if (charged > 0) {
        ctx.fillStyle = COLORS.meterCharge
        ctx.fillRect(left, top, w * Math.min(1, charged), h)
    }
    ctx.strokeStyle = frame
    ctx.lineWidth = 1
    ctx.strokeRect(left, top, w, h)
    if (meter.cost <= 0) return
    ctx.fillStyle = frame
    for (let e = meter.cost; e < meter.max; e += meter.cost) {
        ctx.fillRect(left + (w * e) / meter.max - 0.5, top, 1, h)
    }
}
