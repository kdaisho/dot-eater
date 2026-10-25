import { Cell } from "./constants"
import { vec2, type Vec2 } from "./vec2"

export type Cells = Cell[][]

const MAP: readonly (readonly Cell[])[] = [
    [1, 1, 1, 1, 0, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 0, 0, 0, 1, 0, 0, 0, 0],
    [1, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1],
]

export const PLAYER_START: Vec2 = vec2(4, 1)
export const ENEMY_STARTS: readonly Vec2[] = [vec2(1, 4), vec2(7, 4)]

export function createCells(): Cells {
    return MAP.map((row) => [...row])
}

// Fill every empty cell with a dot, except the one the player stands on.
export function setDots(cells: Cells, playerPos: Vec2) {
    for (let i = 0; i < cells.length; i++) {
        for (let j = 0; j < cells[i].length; j++) {
            if (
                !(playerPos.y === i && playerPos.x === j) &&
                cells[i][j] === Cell.none
            ) {
                cells[i][j] = Cell.dot
            }
        }
    }
}

// Wrap a position that stepped off one edge of the map onto the opposite edge.
export function loopPos(cells: Cells, v: Vec2): Vec2 {
    let { x, y } = v
    if (x < 0) {
        x = cells[0].length - 1
    }
    if (x >= cells[0].length) {
        x = 0
    }
    if (y < 0) {
        y = cells.length - 1
    }
    if (y >= cells.length) {
        y = 0
    }
    return vec2(x, y)
}

export function hasDots(cells: Cells): boolean {
    for (let i = 0; i < cells.length; i++) {
        for (let j = 0; j < cells[i].length; j++) {
            if (cells[i][j] === Cell.dot) {
                return true
            }
        }
    }
    return false
}
