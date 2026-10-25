import { Cell, CharacterId, ENEMY_IDS } from "./constants"
import { enemyMove, type Random } from "./ai"
import { createCharacter, type Character } from "./character"
import { hasDots, loopPos, type Cells, type Level } from "./level"
import { levels } from "./levels"
import { samePos, vec2, type Vec2 } from "./vec2"

export type Outcome = "dead" | "won"

export type GameState = {
    cells: Cells
    player: Character
    enemies: Character[]
    // Set once the game has ended; blocks input and further end checks.
    locked: boolean
    intervalId: ReturnType<typeof setInterval> | undefined
}

export function createGameState(level: Level = levels[0]): GameState {
    // Copy everything out of the level, which is shared between games.
    const spawn = level.playerSpawns[0]
    const player = createCharacter(CharacterId.player, vec2(spawn.x, spawn.y))
    const cells = level.cells.map((row) => [...row])
    const enemies = level.enemies.map((enemy, i) =>
        createCharacter(ENEMY_IDS[i], vec2(enemy.pos.x, enemy.pos.y), enemy.ai)
    )
    return { cells, player, enemies, locked: false, intervalId: undefined }
}

// Try to move the player one step. Returns false only when the game is locked
// and the input was ignored; otherwise true, even if a wall blocked the step.
export function movePlayer(state: GameState, step: Vec2): boolean {
    if (state.locked) return false
    const { cells, player } = state
    const target = loopPos(
        cells,
        vec2(player.pos.x + step.x, player.pos.y + step.y)
    )
    const value = cells[target.y][target.x]

    player.lastPos = vec2(player.pos.x, player.pos.y)

    switch (value) {
        case Cell.none:
            player.pos = target
            break
        case Cell.wall:
            break
        case Cell.dot:
            cells[target.y][target.x] = Cell.none
            player.pos = target
            break
        default: {
            // Compile-time check that every Cell is handled above.
            const unhandled: never = value
            throw new Error(`Unknown cell: ${String(unhandled)}`)
        }
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

// Two characters collide when they share a cell, or when they have just
// swapped cells (each moved into where the other was) and so passed through
// each other.
//
// With today's loop, checkEnd runs after every single move (each key press,
// each enemy step), so a swap is always caught as a shared cell first and the
// swap branch can't trigger. It's here for the upcoming fixed-tick loop
// (KDA-193), where the player and enemies move simultaneously.
function collides(a: Character, b: Character): boolean {
    return (
        samePos(a.pos, b.pos) ||
        (samePos(a.pos, b.lastPos) && samePos(a.lastPos, b.pos))
    )
}

// Detect a collision (dead) or all dots eaten (won). The first detection
// locks the game; once locked this always returns null.
export function checkEnd(state: GameState): Outcome | null {
    if (state.locked) return null
    for (const enemy of state.enemies) {
        if (collides(state.player, enemy)) {
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
