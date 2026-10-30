import { Cell } from "../constants"
import type { Cells } from "../level"
import { openNeighbours } from "../path"
import { vec2, type Vec2 } from "../vec2"

// Shape checks for stage tests: walls only, so ice and enemies don't count.

// Open cells with fewer than two ways out, as "(x, y)".
export function deadEnds(cells: Cells): string[] {
    const found: string[] = []
    cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            if (
                cell !== Cell.wall &&
                openNeighbours(cells, vec2(x, y)).length < 2
            ) {
                found.push(`(${x}, ${y})`)
            }
        })
    )
    return found
}

// Open cells that are the only link between two parts of the maze, as
// "(x, y)": with this one cell blocked (an enemy standing on it), the rest
// of the open cells no longer all reach each other. With none, whatever
// stands in the way can always be gone round. Wrap tunnels count. A dead
// end's cell isn't one (nothing lies past it); see deadEnds for those.
export function chokepoints(cells: Cells): string[] {
    const open: Vec2[] = []
    cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            if (cell !== Cell.wall) open.push(vec2(x, y))
        })
    )
    const key = (p: Vec2) => `${p.x},${p.y}`
    // How many open cells `start` reaches without going through `blocked`.
    const reached = (start: Vec2, blocked: Vec2): number => {
        const seen = new Set([key(blocked), key(start)])
        const queue = [start]
        for (let head = 0; head < queue.length; head++) {
            for (const next of openNeighbours(cells, queue[head])) {
                const k = key(next)
                if (seen.has(k)) continue
                seen.add(k)
                queue.push(next)
            }
        }
        return seen.size - 1
    }
    const found: string[] = []
    for (const cell of open) {
        const [start] = openNeighbours(cells, cell)
        if (start === undefined) continue
        if (reached(start, cell) < open.length - 1) {
            found.push(`(${cell.x}, ${cell.y})`)
        }
    }
    return found
}
