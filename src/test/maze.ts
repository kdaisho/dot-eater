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

// Steps between open cells that are the only way between two parts of the
// maze (bridges), as "(x, y)-(x, y)": with none, every passage has another
// way round, so whatever blocks one can be gone round. Wrap tunnels count.
export function bridges(cells: Cells): string[] {
    const open: Vec2[] = []
    cells.forEach((row, y) =>
        row.forEach((cell, x) => {
            if (cell !== Cell.wall) open.push(vec2(x, y))
        })
    )
    const key = (p: Vec2) => `${p.x},${p.y}`
    // How many cells `a` reaches without taking the step `a`-`b`.
    const reached = (a: Vec2, b: Vec2): number => {
        const seen = new Set([key(a)])
        const queue = [a]
        for (let head = 0; head < queue.length; head++) {
            const cur = queue[head]
            for (const next of openNeighbours(cells, cur)) {
                const k = key(next)
                const skipped =
                    (key(cur) === key(a) && k === key(b)) ||
                    (key(cur) === key(b) && k === key(a))
                if (skipped || seen.has(k)) continue
                seen.add(k)
                queue.push(next)
            }
        }
        return seen.size
    }
    const found: string[] = []
    for (const a of open) {
        for (const b of openNeighbours(cells, a)) {
            if (key(b) <= key(a)) continue
            if (reached(a, b) < open.length) {
                found.push(`(${a.x}, ${a.y})-(${b.x}, ${b.y})`)
            }
        }
    }
    return found
}
