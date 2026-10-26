import { AiType } from "./constants"
import type { Character } from "./character"
import type { Cells } from "./level"
import { distanceMap, openNeighbours } from "./path"
import { samePos, vec2, type Vec2 } from "./vec2"

export type Random = () => number

// Neighbouring cells the enemy may step into: not a wall, and not where it
// just came from. In a dead end, turning back is the only way out, so the
// previous cell is allowed after all. Empty only when boxed in on every side.
export function candidateMoves(cells: Cells, enemy: Character): Vec2[] {
    const open = openNeighbours(cells, enemy.pos)
    const forward = open.filter((v) => !samePos(v, enemy.lastPos))
    return forward.length > 0 ? forward : open
}

// Move one enemy according to its AI. `target` is the player's position.
export function enemyMove(
    cells: Cells,
    enemy: Character,
    target: Vec2,
    random: Random
) {
    const pos = candidateMoves(cells, enemy)

    enemy.lastPos = vec2(enemy.pos.x, enemy.pos.y)

    // Boxed in on every side: stay put.
    if (pos.length === 0) return

    switch (enemy.ai) {
        case AiType.random: {
            const r = Math.floor(random() * pos.length)
            enemy.pos = pos[r]
            break
        }
        case AiType.chase: {
            // Follow the shortest path (wrap-around included) to the target.
            // The enemy's own cell is blocked, so each candidate is scored by
            // its shortest path that doesn't double back through the enemy;
            // otherwise every forward candidate could score "back the way it
            // came" and tie. Ties go to the first candidate in direction
            // order. If the target is unreachable every candidate is
            // Infinity, so this falls back to the first candidate and keeps
            // the enemy moving.
            const dist = distanceMap(cells, target, enemy.pos)
            let nearest = pos[0]
            for (let i = 1; i < pos.length; i++) {
                if (dist[pos[i].y][pos[i].x] < dist[nearest.y][nearest.x]) {
                    nearest = pos[i]
                }
            }
            enemy.pos = nearest
            break
        }
        default: {
            // Compile-time check that every AiType is handled above.
            const unhandled: never = enemy.ai
            throw new Error(`Unknown AI type: ${String(unhandled)}`)
        }
    }
}
