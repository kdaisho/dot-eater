import { AiType, Cell, CharacterId } from "../constants"
import { createCharacter, type Character } from "../character"
import type { GameState } from "../game"
import { parseLevel, type Cells, type Level, type LevelData } from "../level"
import { vec2 } from "../vec2"

export type MapLiteral = readonly (readonly Cell[])[]

// The map that was hard-coded before levels became data (KDA-195). Level 1
// kept its walls until Stage 1 replaced it.
export const OLD_MAP = [
    [1, 1, 1, 1, 0, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 0, 0, 0, 1, 0, 0, 0, 0],
    [1, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1],
] as const satisfies MapLiteral

// The old map as level data: level 1 until Stage 1 replaced it (KDA-203).
// Kept as a small, well-known fixture for tests that rely on its layout.
export const OLD_LEVEL_DATA: LevelData = {
    name: "Level 1",
    map: [
        "####.####",
        "#...P...#",
        "#.#.#.#.#",
        "#.#.#.#.#",
        ".E..#..E.",
        "#.#...#.#",
        "#.#####.#",
        "#.......#",
        "####.####",
    ],
    enemies: [{ ai: "random" }, { ai: "chase" }],
}

export const OLD_LEVEL: Level = parseLevel(OLD_LEVEL_DATA)

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

// A patroller at (x, y) walking `route` ([x, y] waypoints, looped).
export function makePatroller(
    x: number,
    y: number,
    route: readonly (readonly [number, number])[],
    last: { x: number; y: number } = { x, y }
): Character {
    const enemy = createCharacter(
        CharacterId.enemy1,
        vec2(x, y),
        AiType.patroller,
        undefined,
        route.map(([rx, ry]) => vec2(rx, ry))
    )
    enemy.lastPos = vec2(last.x, last.y)
    return enemy
}

// Like createGameState, the player's start cell never holds a dot, and the
// spawns are where the characters start. The player is on their last life
// unless `lives` says otherwise, so any collision ends the game.
export function makeState(
    map: MapLiteral,
    player: { x: number; y: number },
    enemies: Character[] = [],
    { lives = 1 }: { lives?: number } = {}
): GameState {
    const cells = cellsFrom(map)
    if (cells[player.y][player.x] === Cell.dot) {
        cells[player.y][player.x] = Cell.none
    }
    return {
        cells,
        player: createCharacter(CharacterId.player, vec2(player.x, player.y)),
        enemies,
        bufferedStep: vec2(0, 0),
        score: 0,
        lives,
        eatenAt: null,
        spawns: {
            player: vec2(player.x, player.y),
            enemies: enemies.map((e) => vec2(e.pos.x, e.pos.y)),
        },
    }
}

// A random source that always returns the same value.
export const fixedRandom = (value: number) => () => value
