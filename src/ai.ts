import { AiType, Cell } from "./constants"
import type { Character } from "./character"
import { loopPos, type Cells } from "./level"
import { allDirections, directions, samePos, vec2, type Vec2 } from "./vec2"

export type Random = () => number

// Neighbouring cells the enemy may step into: not a wall, and not where it
// just came from.
export function candidateMoves(cells: Cells, enemy: Character): Vec2[] {
    const pos: Vec2[] = []
    for (const d of allDirections) {
        const v = loopPos(
            cells,
            vec2(enemy.pos.x + directions[d].x, enemy.pos.y + directions[d].y)
        )
        if (cells[v.y][v.x] === Cell.wall) {
            continue
        }
        if (samePos(v, enemy.lastPos)) {
            continue
        }
        pos.push(v)
    }
    return pos
}

// Move one enemy according to its AI. `target` is the player's position.
export function enemyMove(
    cells: Cells,
    enemy: Character,
    target: Vec2,
    random: Random
) {
    const pos = candidateMoves(cells, enemy)
    const back = enemy.lastPos
    if (
        pos.length === 0 &&
        cells[back.y][back.x] !== Cell.wall &&
        !(back.x === enemy.pos.x && back.y === enemy.pos.y)
    ) {
        // Dead end: turning back is the only way out.
        pos.push(vec2(back.x, back.y))
    }

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
