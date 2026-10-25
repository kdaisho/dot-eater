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
// every cell back to `source`.
export function distanceMap(cells: Cells, source: Vec2): DistanceMap {
    const dist: DistanceMap = cells.map((row) => row.map(() => Infinity))
    dist[source.y][source.x] = 0
    const queue: Vec2[] = [source]
    for (let head = 0; head < queue.length; head++) {
        const pos = queue[head]
        const next = dist[pos.y][pos.x] + 1
        for (const v of openNeighbours(cells, pos)) {
            if (dist[v.y][v.x] === Infinity) {
                dist[v.y][v.x] = next
                queue.push(v)
            }
        }
    }
    return dist
}
