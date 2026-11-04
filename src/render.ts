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
    canBreathe,
    chargeLevel,
    enemyVisible,
    hasStatus,
    MAX_CHARGE,
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
import { AiType, CharacterId, SPRITE_SCALE, TICK_MS } from "./constants"
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
import {
    rushFrame,
    shifted,
    type DrawnFlier,
    type RushFlight,
    type RushFrame,
} from "./rushView"
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
import {
    ART,
    createMapArt,
    effectPixels,
    spriteOutline,
    styleFor,
    tileCodes,
    updateMapArt,
    type EffectTile,
    type MapArt,
    type TileStyle,
} from "./tiles"
import { panicked } from "./panic"

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
    // With two players, a co-op story run's (KDA-271) total so far
    // ("Total 1230"), drawn in the middle.
    total?: string
    // On a boss level, the boss's health (see bossHud in game.ts): the
    // stage's goal (KDA-267), drawn as a band along the bottom of the
    // strip, in every mode, so it shows wherever the boss is on the map.
    boss?: HealthHud
    // The difficulty's name (e.g. "Hard"), small: with one player between
    // the meter and the health gauge, with two in the middle (under the
    // total in a story run).
    difficulty?: string
}

export type PlayerHud = {
    score: number
    energy: EnergyHud
    // Its health gauge, drawn under its meter in its marker colour.
    health?: HealthHud
    // Whether the player is out of play (see takeOut in game.ts): OUT is
    // drawn in place of its meter.
    out?: boolean
}

// Visual effects drawn with the game (KDA-213), none of them part of it.
export type Effects = {
    // Drawn over the characters, under the fog (see particles.ts).
    particles?: readonly Particle[]
    // How far to move the maze this frame, in cells (see shake.ts). The
    // HUD stays put.
    shake?: Vec2
    // Whether each player in play shows which way it faces (KDA-247): an
    // arrow on its ring (see drawArrow). None when left out.
    arrows?: boolean
    // Whether the system asks for reduced motion: a full charge's glow
    // then doesn't flicker (see chargeAura).
    reducedMotion?: boolean
    // Whether the boss's wind-up shows (KDA-268; see bossBreath.ts): its
    // glow and the warning tint on the cells it will strike. Set while
    // playing, paused and in the ending outro, not on end screens. The
    // breathers' wind-ups (KDA-291, see enemyBreath.ts) show with it.
    bossBreath?: boolean
    // The stage being played (1 to 10), whose pixel tiles draw the maze
    // (KDA-300, see tiles.ts): its walls, floor, dots and fog. Stage 1's
    // when left out.
    stage?: number
    // The Boar's Rushes still landing (KDA-307, see rushView.ts): each
    // rammed enemy drawn flying, and the chain in front sliding.
    rush?: readonly RushFlight[]
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
    text: "#000",
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

// The facing arrow (see Effects.arrows): a filled triangle in the player's
// colour just outside its ring, pointing the way it faces, shown only while
// its breath could fire (charged, not panicked).
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

// A warning tint (see Tint) is a faint fill over each cell it covers, and a
// slightly stronger edge round the outside of those cells, this wide as a
// fraction of a cell.
const TINT_FILL_ALPHA = 0.1
const TINT_EDGE_ALPHA = 0.3
const TINT_EDGE_WIDTH = 0.05

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

// A panicked player (KDA-316, see panic.ts), until KDA-317 gives each
// character a panic frame: a pixel "!" (BadgeId.panic) over its head,
// PANIC_MARK_SCALE of the sprite tall, its middle PANIC_MARK_RISE of the
// sprite above the sprite's middle; and its sprite jitters side to side,
// PANIC_JITTER cells either way, PANIC_JITTER_HZ times a second (not with
// reduced motion, where the mark alone shows it; see panicJitter).
const PANIC_MARK_SCALE = 0.45
const PANIC_MARK_RISE = 0.6
export const PANIC_JITTER = 0.05
export const PANIC_JITTER_HZ = 10

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
    // The maze's pixel tiles (see tiles.ts), painted once per stage and map
    // onto a canvas of their own, ART pixels a cell, and kept: each frame
    // repaints only the cells that changed (a dot eaten, a wall broken or
    // grown back, ice come or gone) and scales the canvas onto the map.
    let tiles: Tiles | undefined
    function mapArt(
        style: TileStyle,
        state: GameState,
        alpha: number
    ): HTMLCanvasElement | null {
        if (
            !tiles ||
            tiles.style !== style ||
            tiles.cols !== cols ||
            tiles.rows !== rows
        ) {
            tiles = createTiles(canvas.ownerDocument, style, cols, rows)
        }
        const { art } = tiles
        if (!art) return null
        tiles.codes = tileCodes(state, shownDots(state, alpha), tiles.codes)
        for (const r of updateMapArt(art.map, tiles.codes)) {
            art.ctx.putImageData(art.image, 0, 0, r.x, r.y, r.width, r.height)
        }
        return art.canvas
    }
    // The breaths' effect tiles, each on a small canvas of its own made
    // when first needed.
    const effectCanvases = new Map<EffectTile, HTMLCanvasElement | null>()
    const effectTile: EffectTiles = (tile) => {
        if (!effectCanvases.has(tile)) {
            effectCanvases.set(
                tile,
                createEffectTile(canvas.ownerDocument, tile)
            )
        }
        return effectCanvases.get(tile) ?? null
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
        const fall = defeatScene(
            state,
            alpha,
            cell,
            spriteOutline(effects.stage)
        )
        if (fall) {
            const z = defeatZoom(fall.defeat, fall.e)
            ctx.translate(fall.spot.x, fall.spot.y)
            ctx.scale(z, z)
            ctx.translate(-fall.spot.x, -fall.spot.y)
        }
        const windUp = effects.bossBreath === true
        const style = styleFor(effects.stage)
        drawCells(
            ctx,
            state,
            cell,
            seen,
            tintsFor(state, windUp),
            mapArt(style, state, alpha),
            effectTile
        )
        const art = {
            sprites,
            facing,
            dpr,
            outline: spriteOutline(effects.stage),
        }
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
            effects.arrows === true,
            effects.reducedMotion === true,
            windUp,
            effectTile,
            fall,
            effects.rush
                ? rushFrame(effects.rush, state, alpha, TICK_MS / 1000)
                : null
        )
        if (effects.particles) drawParticles(ctx, effects.particles, cell, seen)
        if (fall && state.boss) {
            drawDefeatFx(ctx, fall.defeat, state.boss, fall.spot, fall.e)
        }
        ctx.restore()
        if (fog) {
            drawDarkness(
                ctx,
                fog,
                cell,
                cols,
                rows,
                darknessLayer,
                dpr,
                screen,
                style.fog
            )
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
// `color` is the darkness, "r, g, b": the stage's tint (TileStyle.fog).
function drawDarkness(
    ctx: CanvasRenderingContext2D,
    fog: Fog,
    cell: number,
    cols: number,
    rows: number,
    layer: () => Layer,
    dpr: number,
    screen: Rect,
    color: string
) {
    if (fog.lights.length > 1) {
        drawSharedDarkness(
            ctx,
            fog,
            cell,
            cols,
            rows,
            layer(),
            dpr,
            screen,
            color
        )
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
        gradient.addColorStop(0, `rgba(${color}, 0)`)
        gradient.addColorStop(1, `rgb(${color})`)
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
    screen: Rect,
    color: string
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
    dark.fillStyle = `rgb(${color})`
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

// The maze: its pixel tiles (`art`, the map's walls, floor, ice, dots,
// rubble and tunnel marks, see tiles.ts) scaled onto the map with no
// smoothing, so the pixels stay crisp. Then tile effects from breaths by
// their Look: the colour over the cell, the warning tints, and
// each effect's pixel tile on top. In fog, the darkness covers the tiles
// outside the light; only cells inside it get looks and tints.
function drawCells(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    cell: number,
    fog: Sight | null,
    tints: readonly Tint[],
    art: HTMLCanvasElement | null,
    effectTile: EffectTiles
) {
    const rows = state.cells.length
    const cols = state.cells[0]?.length ?? 0
    if (art) {
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(art, 0, 0, cols * cell, rows * cell)
    }
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
    if (looks || tinted) {
        state.cells.forEach((row, y) => {
            row.forEach((_, x) => {
                if (fog && !fog.visible(vec2(x, y))) return
                for (const look of looks?.[y][x] ?? []) {
                    if (look.color) fillCell(x, y, look.color)
                }
                for (const color of tinted?.[y][x] ?? []) {
                    ctx.globalAlpha = TINT_FILL_ALPHA
                    fillCell(x, y, color)
                    ctx.globalAlpha = 1
                }
            })
        })
    }
    for (const tint of tints) drawTintEdge(ctx, tint, cell, fog)
    if (!looks) return
    // Effect tiles go on top of everything in the cells, before characters.
    looks.forEach((row, y) =>
        row.forEach((list, x) => {
            if (fog && !fog.visible(vec2(x, y))) return
            for (const look of list) {
                if (!look.tile) continue
                const tile = effectTile(look.tile)
                if (tile) drawTile(ctx, tile, x * cell, y * cell, cell)
            }
        })
    )
}

// The dots still drawn though eaten: each player's latest, until its glide
// reaches it (see eatenDotVisible), so the dot doesn't vanish a cell ahead
// of the player.
function shownDots(state: GameState, alpha: number): Vec2[] {
    return state.players.flatMap((p) =>
        p.eatenAt && eatenDotVisible(p.character, alpha, p.rate)
            ? [p.eatenAt]
            : []
    )
}

// The renderer's maze art (see mapArt in createRenderer): for which style
// and map size, the cells' latest TileCodes, and the canvas it is painted
// on with its pixels (null without a 2D context or ImageData for it).
type Tiles = {
    style: TileStyle
    cols: number
    rows: number
    codes: Uint8Array | undefined
    art: {
        map: MapArt
        canvas: HTMLCanvasElement
        ctx: CanvasRenderingContext2D
        image: ImageData
    } | null
}

function createTiles(
    doc: Document,
    style: TileStyle,
    cols: number,
    rows: number
): Tiles {
    const tiles: Tiles = { style, cols, rows, codes: undefined, art: null }
    if (cols === 0 || rows === 0) return tiles
    const canvas = doc.createElement("canvas")
    canvas.width = cols * ART
    canvas.height = rows * ART
    const ctx = canvas.getContext("2d")
    const image = ctx?.createImageData(cols * ART, rows * ART)
    if (!ctx || !image) return tiles
    const map = createMapArt(style, cols, rows, image.data)
    tiles.art = { map, canvas, ctx, image }
    return tiles
}

// The canvas of a breath's effect tile (see EFFECT_TILES in tiles.ts), or
// null without a 2D context for it.
type EffectTiles = (tile: EffectTile) => HTMLCanvasElement | null

function createEffectTile(
    doc: Document,
    tile: EffectTile
): HTMLCanvasElement | null {
    const canvas = doc.createElement("canvas")
    canvas.width = ART
    canvas.height = ART
    const ctx = canvas.getContext("2d")
    const image = ctx?.createImageData(ART, ART)
    if (!ctx || !image) return null
    image.data.set(effectPixels(tile))
    ctx.putImageData(image, 0, 0)
    return canvas
}

// Draw a pixel tile `size` square from (x, y), crisp.
function drawTile(
    ctx: CanvasRenderingContext2D,
    tile: HTMLCanvasElement,
    x: number,
    y: number,
    size: number
) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tile, x, y, size, size)
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
// drawn under the dots: the boss's warning while it winds up its breath
// (see bossWarning), or a breather's.
type Tint = { cells: readonly Vec2[]; color: string }

// The tints to draw this frame: with `windUp` (Effects.bossBreath), the
// boss's warning if it is winding up, and each breather's that is
// (KDA-291). The warnings come from their state and their own colours
// (BOSS_BREATH in bossBreath.ts, ENEMY_BREATH in enemyBreath.ts), so
// nothing here knows the breaths.
function tintsFor(state: GameState, windUp: boolean): Tint[] {
    if (!windUp) return []
    const tints: Tint[] = []
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
    ctx.globalAlpha = TINT_EDGE_ALPHA
    ctx.strokeStyle = tint.color
    ctx.lineWidth = Math.max(1, cell * TINT_EDGE_WIDTH)
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
// character's last facing (see facesRight), the device pixel ratio and the
// stage's outline colour (TileStyle.outline: light on a dark floor).
type Art = {
    sprites: SpriteCache
    facing: WeakMap<object, boolean>
    dpr: number
    outline: string
}

// A boss's defeat as this frame draws it (KDA-301), or null for none: the
// defeat, its moment and where the boss fell, in maze pixels at `cell`,
// with the stage's sprite outline (`outline`, see spriteOutline).
type DefeatScene = { defeat: BossDefeat; e: number; spot: DefeatSpot }

function defeatScene(
    state: GameState,
    alpha: number,
    cell: number,
    outline: string
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
            outline,
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
    drawSprite(
        ctx,
        art.sprites,
        bossLook(boss, windUp),
        x,
        y,
        size,
        art.dpr,
        art.outline
    )
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
    effectTile: EffectTiles,
    fall: DefeatScene | null = null,
    rush: RushFrame | null = null
) {
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    // Later characters are drawn on top of earlier ones: the held enemies
    // (e.g. frozen, which players walk onto), the players (player 1 first),
    // then the other enemies. In fog, enemies outside the light are
    // hidden; the players are always in it. A defeated enemy is hidden until
    // it blinks before coming back (enemyVisible). Statuses are drawn by
    // their Look: the colour as a disc behind the sprite, the pixel tile
    // over it (e.g. the frozen ice block), sized to the cell as the sprite
    // is to its box, and the badge as a small pixel badge at its top
    // right. A held enemy (e.g. frozen mid-glide) gets
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
    // With a Rush landing (`rush`, KDA-307), the chain it shoved is drawn
    // back along the rush line, sliding in, and its fliers over everyone
    // (drawFlier).
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
        arrow: null,
        aura: null,
        panicked: false,
        jitter: 0,
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
                          arrow:
                              arrows &&
                              !panicked(player) &&
                              canBreathe(player.breather)
                                  ? { index: i, facing: player.breather.facing }
                                  : null,
                          aura: panicked(player)
                              ? null
                              : chargeAura(player.breather, reducedMotion),
                          panicked: panicked(player),
                          jitter: panicJitter(player, reducedMotion),
                      },
                  ]
        ),
        ...free.map(enemySprite),
    ]
    for (const sprite of sprites) {
        const { character, rate, marker, arrow, aura, jitter } = sprite
        const isPlayer = character.id === CharacterId.player
        if (!isPlayer && !enemyVisible(character)) continue
        const index = isPlayer
            ? state.players.findIndex((p) => p.character === character)
            : state.enemies.indexOf(character)
        if (!isPlayer && rush?.hidden.has(index)) continue
        const held = !isPlayer && hasStatus(character, "holds")
        const glided = glidePos(character, held ? 0 : alpha, cols, rows, rate)
        const shift = (isPlayer ? rush?.playerShift : rush?.enemyShift)?.get(
            index
        )
        const pos = shift ? shifted(glided, shift, cols, rows) : glided
        if (fog && !isPlayer && !fog.visible(pos)) continue
        const looks = [
            ...character.statuses.flatMap((s) =>
                s.status.look ? [s.status.look] : []
            ),
            ...(windUp && !isPlayer ? enemyBreathLooks(character) : []),
        ]
        const scale = !isPlayer && isSplitterHalf(character) ? HALF_SCALE : 1
        const size = cell * SPRITE_SCALE * scale
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
        if (sprite.panicked) look.panicked = true
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
            const x = (p.x + 0.5 + jitter) * cell
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
            drawSprite(ctx, art.sprites, look, x, y, size, art.dpr, art.outline)
            for (const status of looks) {
                const tile = status.tile && effectTile(status.tile)
                if (!tile) continue
                const box = cell * scale
                drawTile(ctx, tile, x - box / 2, y - box / 2, box)
            }
            if (marker !== null) drawMarker(ctx, marker, x, y, size)
            if (sprite.panicked) {
                drawSprite(
                    ctx,
                    art.sprites,
                    { badge: BadgeId.panic },
                    x,
                    y - size * PANIC_MARK_RISE,
                    size * PANIC_MARK_SCALE,
                    art.dpr,
                    art.outline
                )
            }
            const badges = looks.flatMap((look) =>
                look.badge ? [look.badge] : []
            )
            badges.forEach((id, i) => {
                drawSprite(
                    ctx,
                    art.sprites,
                    { badge: id },
                    x + size / 2 - i * size * BADGE_SCALE,
                    y - size / 2,
                    size * BADGE_SCALE,
                    art.dpr,
                    art.outline
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
                    fall.e,
                    art.outline
                )
            }
        }
        if (faint) ctx.globalAlpha = 1
        if (!arrow) continue
        for (const p of wrapCopies(pos, cols, rows)) {
            drawArrow(ctx, arrow, (p.x + 0.5) * cell, (p.y + 0.5) * cell, cell)
        }
    }
    for (const flier of rush?.fliers ?? []) {
        if (fog && !fog.visible(flier.pos)) continue
        drawFlier(ctx, art, state, flier, cell, cols, rows)
    }
}

// A Rush's flier (KDA-307, see rushView.ts): the enemy it rammed, defeated
// in the game already, drawn where its flight has it, tumbling. A whole
// Splitter flies whole (it splits on the slam), a half as a half.
function drawFlier(
    ctx: CanvasRenderingContext2D,
    art: Art,
    state: GameState,
    flier: DrawnFlier,
    cell: number,
    cols: number,
    rows: number
) {
    const enemy = state.enemies[flier.index]
    if (!enemy) return
    const half = enemy.ai === AiType.splitter && !flier.split
    const id = half ? SpriteId.splitterHalf : ENEMY_SPRITES[enemy.ai]
    const look = { id, mirror: mirrored(id, art.facing.get(enemy) ?? false) }
    const size = cell * SPRITE_SCALE * (half ? HALF_SCALE : 1)
    for (const p of wrapCopies(flier.pos, cols, rows)) {
        ctx.save()
        ctx.translate((p.x + 0.5) * cell, (p.y + 0.5) * cell)
        ctx.rotate(flier.spin)
        drawSprite(ctx, art.sprites, look, 0, 0, size, art.dpr, art.outline)
        ctx.restore()
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

// How far a panicked player's sprite is drawn off its spot this frame, in
// cells along x (see PANIC_JITTER): right on the first half of each
// jitter, left on the second, timed by the panic's own countdown so it
// keeps to the game; 0 when it isn't panicked or with reduced motion.
export function panicJitter(player: Player, reducedMotion: boolean): number {
    if (reducedMotion || !panicked(player)) return 0
    return (player.panickedFor * PANIC_JITTER_HZ) % 1 < 0.5
        ? PANIC_JITTER
        : -PANIC_JITTER
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

// The facing arrow's outline (KDA-325), so it reads on every stage's floor:
// a white band round the triangle and a thin black edge outside that, the
// sprite outline's idea with both colours at once (white shows on the dark
// floors of stages 8 to 10, black on the light ones). Each is at least 1 px
// wide, else this fraction of a cell.
const ARROW_LIGHT = "#ffffff"
const ARROW_DARK = "#000000"
const ARROW_LIGHT_WIDTH = 0.06
const ARROW_DARK_WIDTH = 0.03

// Player `arrow.index`'s facing arrow, for its sprite centred at (x, y): a
// filled triangle in its colour, its base just outside the ring and its tip
// ARROW_TIP cells out along `facing` (a unit step), in its outline.
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
    // Strokes are centred on the path, so each is twice the width that
    // shows outside it; the dark one goes first, the light one over it and
    // the fill over both. Mitred corners keep the tip sharp.
    const light = Math.max(1, cell * ARROW_LIGHT_WIDTH)
    const dark = Math.max(1, cell * ARROW_DARK_WIDTH)
    ctx.lineJoin = "miter"
    ctx.strokeStyle = ARROW_DARK
    ctx.lineWidth = 2 * (light + dark)
    ctx.stroke()
    ctx.strokeStyle = ARROW_LIGHT
    ctx.lineWidth = 2 * light
    ctx.stroke()
    ctx.fill()
    ctx.restore()
}

// Score on the left, the health gauge on the right, the energy meter in the
// middle. With two players (hud.players): player 1's score, meter and
// health on the left, player 2's on the right, each in its marker colour,
// and in a story run the total in the middle. On a boss level, the boss's band
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

// The difficulty label's text size, and the run total's when it shares
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
            `${i + 1}P ${player.score}`,
            left ? pad : width - pad,
            height / 2
        )
        const meterLeft = left ? width * 0.2 : width * 0.8 - w
        if (player.out) {
            ctx.textAlign = "center"
            // Squeezed into the meter's width, so it never runs into the
            // score on a narrow screen.
            ctx.fillText(OUT_LABEL, meterLeft + w / 2, height / 2, w)
            return
        }
        // With a health gauge, the meter takes the top of the slot and the
        // gauge the bottom.
        const meter = player.health
            ? { top: height * 0.1, h: height * 0.38 }
            : { top: height * 0.3, h: height * METER_HEIGHT }
        drawMeter(ctx, player.energy, meterLeft, meter.top, w, meter.h, color)
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
    // The middle, between the two meters: the run total and the
    // difficulty, one above the other when there are both, the lower one
    // clear of a boss band. Player 1's meter ends at 35% of the width, and
    // player 2's starts at 65%.
    const middle = width * 0.3 - 2 * pad
    if (hud.total !== undefined && hud.difficulty !== undefined) {
        const size = height * LABEL_SIZE
        drawLabel(ctx, hud.total, width / 2, height * 0.29, {
            width: middle,
            size,
        })
        drawLabel(ctx, hud.difficulty, width / 2, height * 0.69, {
            width: middle,
            size,
        })
    } else if (hud.total !== undefined) {
        ctx.fillStyle = COLORS.text
        ctx.textAlign = "center"
        ctx.fillText(hud.total, width / 2, height / 2)
    } else if (hud.difficulty !== undefined) {
        drawLabel(ctx, hud.difficulty, width / 2, height / 2, {
            width: middle,
            size: height * LABEL_SIZE,
        })
    }
}

// What an out player's HUD slot shows in place of its meter: a co-op
// player knocked out is out for good.
export const OUT_LABEL = "OUT"

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
export function drawMeter(
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
