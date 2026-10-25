import { AiType, Cell, CharacterId } from "../constants"
import { createCharacter, type Character } from "../character"
import type { GameState } from "../game"
import type { Cells } from "../level"
import { vec2 } from "../vec2"

export type MapLiteral = readonly (readonly Cell[])[]

// Copy a literal map into a fresh, mutable Cells grid.
export function cellsFrom(map: MapLiteral): Cells {
    return map.map((row) => [...row])
}

export function makeEnemy(
    x: number,
    y: number,
    ai: AiType = AiType.random,
    last: { x: number; y: number } = { x, y },
    id: CharacterId = CharacterId.enemy1
): Character {
    const enemy = createCharacter(id, vec2(x, y), ai)
    enemy.lastPos = vec2(last.x, last.y)
    return enemy
}

// Like createGameState, the player's start cell never holds a dot.
export function makeState(
    map: MapLiteral,
    player: { x: number; y: number },
    enemies: Character[] = []
): GameState {
    const cells = cellsFrom(map)
    if (cells[player.y][player.x] === Cell.dot) {
        cells[player.y][player.x] = Cell.none
    }
    return {
        cells,
        player: createCharacter(CharacterId.player, vec2(player.x, player.y)),
        enemies,
        locked: false,
        intervalId: undefined,
    }
}

// A random source that always returns the same value.
export const fixedRandom = (value: number) => () => value
