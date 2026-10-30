import { vec2, type Vec2 } from "./vec2"

// The view (KDA-266): the part of the maze on screen. Pure, no DOM; time
// comes in as `dt`. render.ts only applies it.
//
// A maze whose cells would be smaller than MIN_FIT_CELL_PX (layout.ts) to
// fit whole is drawn with MIN_CELL_PX cells instead, and the view follows
// the player: it is centred on the player's glide position, clamped so it
// never shows beyond the maze's edges, and eased (easeView) so it glides
// after the player rather than jumping a cell at a time. With two players
// it follows their midpoint and zooms out to keep both in view, down to the
// whole maze. A maze that fits whole is drawn whole, as before.
//
// `closeCellPx` below is the cell size the view zooms in to at most: the
// layout's cell (MIN_CELL_PX when the maze scrolls). When the whole maze
// fits at that size or bigger, the view never zooms in.
//
// Maze positions here are in cell units with cell centres at whole numbers,
// as glidePos returns. The view's centre is in edge units: the maze runs from
// 0 to cols across and 0 to rows down.

// The maze's size in cells.
export type MazeSize = { cols: number; rows: number }

// The part of the canvas the maze is drawn in, in CSS pixels.
export type Viewport = { width: number; height: number }

export type View = {
    // The maze point (edge units) at the middle of the viewport.
    x: number
    y: number
    // Side of one cell on screen, in CSS pixels.
    cell: number
}

// How much maze to keep in view round each player when zooming out to keep
// two in view, in cells on every side of their centres.
export const VIEW_MARGIN = 3

// How fast the view catches up with where it should be: the gap shrinks by
// a factor e every 1 / FOLLOW_RATE seconds, so a player walking at
// PLAYER_SPEED cells a second is followed about half a cell behind.
export const FOLLOW_RATE = 8

// How far outside the view (in cells) something's centre can be while part
// of it still shows: a sprite or tile is at most a cell across, the boss is
// culled per cell of its footprint, and a shake moves the maze by up to a
// quarter of a cell.
export const VIEW_REACH = 1.5

// The cell size that fits the whole maze into the viewport, and the largest
// the view zooms in to: closeCellPx, or the fitting size when that is
// bigger.
function cellRange(maze: MazeSize, viewport: Viewport, closeCellPx: number) {
    const fit = Math.min(
        viewport.width / maze.cols,
        viewport.height / maze.rows
    )
    return { fit, max: Math.max(fit, closeCellPx) }
}

// The view that shows `targets` (players in play): as close in as closeCellPx
// allows, centred on their midpoint, and zoomed out to keep them all in
// view with VIEW_MARGIN cells round each, down to the whole maze. No targets
// gives the whole maze.
export function viewFor(
    maze: MazeSize,
    viewport: Viewport,
    targets: readonly Vec2[],
    closeCellPx: number
): View {
    const { fit, max } = cellRange(maze, viewport, closeCellPx)
    if (targets.length === 0) {
        return { x: maze.cols / 2, y: maze.rows / 2, cell: fit }
    }
    const xs = targets.map((t) => t.x + 0.5)
    const ys = targets.map((t) => t.y + 0.5)
    const left = Math.min(...xs)
    const right = Math.max(...xs)
    const top = Math.min(...ys)
    const bottom = Math.max(...ys)
    // The margin is no wider than the view at its closest, so one player,
    // or two together, never zooms it out on a tiny screen.
    const marginX = Math.min(2 * VIEW_MARGIN, viewport.width / max)
    const marginY = Math.min(2 * VIEW_MARGIN, viewport.height / max)
    const cell = Math.min(
        viewport.width / (right - left + marginX),
        viewport.height / (bottom - top + marginY),
        max
    )
    return clampView(
        { x: (left + right) / 2, y: (top + bottom) / 2, cell },
        maze,
        viewport,
        closeCellPx
    )
}

// `view` kept within the maze: its cell size between the whole maze's and
// closeCellPx's, and its centre where the view shows no more than the maze
// along each axis. Along an axis the whole maze fits in, the maze is centred.
export function clampView(
    view: View,
    maze: MazeSize,
    viewport: Viewport,
    closeCellPx: number
): View {
    const { fit, max } = cellRange(maze, viewport, closeCellPx)
    const cell = Math.min(max, Math.max(fit, view.cell))
    return {
        x: clampAxis(view.x, viewport.width / cell, maze.cols),
        y: clampAxis(view.y, viewport.height / cell, maze.rows),
        cell,
    }
}

// A view centre `c` along an axis `size` cells long, showing `span` cells.
// The tolerance keeps a maze that fits exactly centred despite rounding.
function clampAxis(c: number, span: number, size: number): number {
    if (span >= size - 1e-9) return size / 2
    return Math.min(size - span / 2, Math.max(span / 2, c))
}

// Move `from` towards `to` over `dt` seconds, easing out: the same share of
// the gap closes in each equal stretch of time, however the frames fall.
export function easeView(
    from: View,
    to: View,
    dt: number,
    rate = FOLLOW_RATE
): View {
    const k = 1 - Math.exp(-rate * Math.max(0, dt))
    return {
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
        cell: from.cell + (to.cell - from.cell) * k,
    }
}

// The maze point (edge units) at the viewport's top left corner.
export function viewOrigin(view: View, viewport: Viewport): Vec2 {
    return vec2(
        view.x - viewport.width / view.cell / 2,
        view.y - viewport.height / view.cell / 2
    )
}

// Whether something centred at `p` (cell units, centres at whole numbers)
// shows in the view, or comes within `reach` cells of it.
export function inView(
    view: View,
    viewport: Viewport,
    p: Vec2,
    reach = VIEW_REACH
): boolean {
    const halfWidth = viewport.width / view.cell / 2 + reach
    const halfHeight = viewport.height / view.cell / 2 + reach
    return (
        Math.abs(p.x + 0.5 - view.x) <= halfWidth &&
        Math.abs(p.y + 0.5 - view.y) <= halfHeight
    )
}
