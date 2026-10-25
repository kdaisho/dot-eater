import { AiType, Cell } from "./constants"
import type { Character } from "./character"
import { loopPos, type Cells } from "./level"
import { allDirections, directions, samePos, vec2, type Vec2 } from "./vec2"

export type Random = () => number

// Neighbouring cells the enemy may step into: not a wall, and not where it
// just came from. In a dead end, turning back is the only way out, so the
// previous cell is allowed after all. Empty only when boxed in on every side.
export function candidateMoves(cells: Cells, enemy: Character): Vec2[] {
    const open: Vec2[] = []
    for (const d of allDirections) {
        const v = loopPos(
            cells,
            vec2(enemy.pos.x + directions[d].x, enemy.pos.y + directions[d].y)
        )
        if (cells[v.y][v.x] !== Cell.wall) {
            open.push(v)
        }
    }
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
            let nearest = pos[0]
            for (let i = 1; i < pos.length; i++) {
                if (distance(target, nearest) > distance(target, pos[i])) {
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

function distance(a: Vec2, b: Vec2) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))
}
