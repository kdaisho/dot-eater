import { AiType, CELL_MAX, Cell, CharacterId } from "./constants"
import { enemyMove, type Random } from "./ai"
import { createCharacter, type Character } from "./character"
import {
    createCells,
    ENEMY_STARTS,
    hasDots,
    loopPos,
    PLAYER_START,
    setDots,
    type Cells,
} from "./level"
import { vec2, type Vec2 } from "./vec2"

export type Outcome = "dead" | "won"

export type GameState = {
    cells: Cells
    player: Character
    enemies: Character[]
    // Set once the game has ended; blocks input and further end checks.
    locked: boolean
    intervalId: number | undefined
}

export function createGameState(): GameState {
    const player = createCharacter(
        CharacterId.player,
        vec2(PLAYER_START.x, PLAYER_START.y)
    )
    const cells = createCells()
    setDots(cells, player.pos)
    const enemies = [
        createCharacter(
            CharacterId.enemy1,
            vec2(ENEMY_STARTS[0].x, ENEMY_STARTS[0].y),
            AiType.random
        ),
        createCharacter(
            CharacterId.enemy2,
            vec2(ENEMY_STARTS[1].x, ENEMY_STARTS[1].y),
            AiType.chase
        ),
    ]
    for (const enemy of enemies) {
        enemy.lastPos = vec2(enemy.pos.x, enemy.pos.y)
    }
    return { cells, player, enemies, locked: false, intervalId: undefined }
}

// Try to move the player one step. Returns false when the move was ignored
// entirely (game locked, or target cell out of range).
export function movePlayer(state: GameState, step: Vec2): boolean {
    if (state.locked) return false
    const { cells, player } = state
    const target = loopPos(
        cells,
        vec2(player.pos.x + step.x, player.pos.y + step.y)
    )
    const value = cells[target.y][target.x]

    if (value >= CELL_MAX) {
        return false
    }

    switch (value) {
        case Cell.none:
            player.pos = target
        // falls through
        case Cell.wall:
            break
        case Cell.dot:
            cells[target.y][target.x] = Cell.none
            player.pos = target
            break
        default:
            console.log("No element found")
    }
    return true
}

// Move every enemy once, checking for the end of the game after each move.
export function tick(state: GameState, random: Random): Outcome | null {
    let outcome: Outcome | null = null
    for (const enemy of state.enemies) {
        enemyMove(state.cells, enemy, state.player.pos, random)
        outcome = checkEnd(state) ?? outcome
    }
    return outcome
}

// Detect a collision (dead) or all dots eaten (won). The first detection
// locks the game; once locked this always returns null.
export function checkEnd(state: GameState): Outcome | null {
    if (state.locked) return null
    for (const enemy of state.enemies) {
        if (
            enemy.pos.x === state.player.pos.x &&
            enemy.pos.y === state.player.pos.y
        ) {
            state.locked = true
            return "dead"
        }
    }
    if (hasDots(state.cells)) {
        return null
    }
    state.locked = true
    return "won"
}
