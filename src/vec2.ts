import { Direction } from "./constants"

export type Vec2 = {
    x: number
    y: number
}

export function vec2(x: number, y: number): Vec2 {
    return { x, y }
}

// Unit steps indexed by Direction.
export const directions: Record<Direction, Vec2> = {
    [Direction.up]: vec2(0, -1),
    [Direction.left]: vec2(-1, 0),
    [Direction.down]: vec2(0, 1),
    [Direction.right]: vec2(1, 0),
}

// In Direction order: up, left, down, right.
export const allDirections: readonly Direction[] = [
    Direction.up,
    Direction.left,
    Direction.down,
    Direction.right,
]
