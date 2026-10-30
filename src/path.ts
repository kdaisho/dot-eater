import { Cell } from "./constants"
import { loopPos, type Cells } from "./level"
import { allDirections, directions, vec2, type Vec2 } from "./vec2"

// Steps from one cell to another; Infinity when there is no path.
export type DistanceMap = number[][]

// Cells one step away from `pos` that are not walls, in Direction order.
// Steps off an edge wrap around to the opposite edge.
export function openNeighbours(cells: Cells, pos: Vec2): Vec2[] {
    const result: Vec2[] = []
    for (const d of allDirections) {
        const v = loopPos(
            cells,
            vec2(pos.x + directions[d].x, pos.y + directions[d].y)
        )
        if (cells[v.y][v.x] !== Cell.wall) {
            result.push(v)
        }
    }
    return result
}

// Breadth-first search from `source`: the number of steps from `source` to
// every cell, indexed [y][x]. Walls and cells that cannot be reached are
// Infinity. The source itself is 0, even if it is a wall. Moves are
// symmetric (wrap-around works both ways), so this is also the distance from
// every cell back to `source`. An optional `blocked` cell is treated like a
// wall (unless it is the source), so distances are along paths that avoid it.
export function distanceMap(
    cells: Cells,
    source: Vec2,
    blocked?: Vec2
): DistanceMap {
    const height = cells.length
    const width = cells[0].length
    const dist: DistanceMap = cells.map((row) => row.map(() => Infinity))
    dist[source.y][source.x] = 0
    // Cells as y * width + x, to search without making a Vec2 per step.
    const queue = [source.y * width + source.x]
    for (let head = 0; head < queue.length; head++) {
        const x = queue[head] % width
        const y = (queue[head] - x) / width
        const next = dist[y][x] + 1
        for (const d of allDirections) {
            // One step, wrapping round the edges as loopPos does.
            const vx = wrap(x + directions[d].x, width)
            const vy = wrap(y + directions[d].y, height)
            if (cells[vy][vx] === Cell.wall) continue
            if (blocked && blocked.x === vx && blocked.y === vy) continue
            if (dist[vy][vx] === Infinity) {
                dist[vy][vx] = next
                queue.push(vy * width + vx)
            }
        }
    }
    return dist
}

// `n` one step off either end of 0 to `size` - 1 wrapped round to the
// other end, as loopPos does.
export function wrap(n: number, size: number): number {
    return n < 0 ? size - 1 : n >= size ? 0 : n
}
