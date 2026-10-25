import { Cell, CharacterId } from "./constants"
import type { GameState } from "./game"
import { glidePos, wrapCopies } from "./glide"
import { computeLayout, type Layout } from "./layout"

// What the HUD strip above the maze shows. Fields left out aren't drawn.
export type Hud = {
    score?: number
    lives?: number
}

export type Renderer = {
    // Draw the game. `alpha` in [0, 1) is how far the loop is between the last
    // logic tick and the next; characters glide between cells with it.
    draw(state: GameState, alpha: number, hud?: Hud): void
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
    text: "#000",
}

const sprites: Record<CharacterId, string> = {
    [CharacterId.player]: "🪰",
    [CharacterId.enemy1]: "👹",
    [CharacterId.enemy2]: "👺",
}

// Wall blocks and dots keep the proportions of the old span grid: 30px blocks
// on a 35px pitch and 5px dots.
const WALL_SCALE = 30 / 35
const DOT_SCALE = 5 / 35
const SPRITE_SCALE = 0.8

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
    let last: { state: GameState; alpha: number; hud: Hud } | undefined

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

    function draw(state: GameState, alpha: number, hud: Hud = {}) {
        last = { state, alpha, hud }
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
        drawCells(ctx, state, cell)
        drawCharacters(ctx, state, alpha, cell, cols, rows)
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
            if (last) draw(last.state, last.alpha, last.hud)
            else clear()
        },
    }
}

function drawCells(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    cell: number
) {
    const wall = cell * WALL_SCALE
    const dot = Math.max(1, cell * DOT_SCALE)
    state.cells.forEach((row, y) => {
        row.forEach((value, x) => {
            const cx = (x + 0.5) * cell
            const cy = (y + 0.5) * cell
            if (value === Cell.wall) {
                ctx.fillStyle = COLORS.wall
                ctx.fillRect(cx - wall / 2, cy - wall / 2, wall, wall)
            } else if (value === Cell.dot) {
                ctx.fillStyle = COLORS.dot
                ctx.fillRect(cx - dot / 2, cy - dot / 2, dot, dot)
            }
        })
    })
}

function drawCharacters(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    alpha: number,
    cell: number,
    cols: number,
    rows: number
) {
    ctx.font = `${Math.round(cell * SPRITE_SCALE)}px sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    // Later characters are drawn on top of earlier ones.
    for (const character of [state.player, ...state.enemies]) {
        const pos = glidePos(character, alpha, cols, rows)
        for (const p of wrapCopies(pos, cols, rows)) {
            ctx.fillText(
                sprites[character.id],
                (p.x + 0.5) * cell,
                (p.y + 0.5) * cell
            )
        }
    }
}

// Score on the left, lives on the right. The middle is free for the energy
// meter later.
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
    if (hud.score !== undefined) {
        ctx.textAlign = "left"
        ctx.fillText(`Score ${hud.score}`, pad, height / 2)
    }
    if (hud.lives !== undefined) {
        ctx.textAlign = "right"
        ctx.fillText(
            "🪰".repeat(Math.max(0, hud.lives)),
            width - pad,
            height / 2
        )
    }
}
