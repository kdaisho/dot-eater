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
    // Set once the game has ended; nothing changes after that.
    locked: boolean
}

// Tolerance for moveProgress reaching 1, so floating-point sums of speed * dt
// still land on the intended tick.
const EPSILON = 1e-9

export function createGameState(level: Level = levels[0]): GameState {
    // Copy everything out of the level, which is shared between games.
    const spawn = level.playerSpawns[0]
    const player = createCharacter(CharacterId.player, vec2(spawn.x, spawn.y))
    const cells = level.cells.map((row) => [...row])
    const enemies = level.enemies.map((enemy, i) =>
        createCharacter(ENEMY_IDS[i], vec2(enemy.pos.x, enemy.pos.y), enemy.ai)
    )
    return { cells, player, enemies, locked: false }
}

// Try to move the player one step, eating any dot there. Returns true if the
// player moved; false if a wall blocked the step, the step was zero, or the
// game is locked.
export function movePlayer(state: GameState, step: Vec2): boolean {
    if (state.locked || (step.x === 0 && step.y === 0)) return false
    const { cells, player } = state
    const target = loopPos(
        cells,
        vec2(player.pos.x + step.x, player.pos.y + step.y)
    )
    const value = cells[target.y][target.x]

    switch (value) {
        case Cell.none:
            break
        case Cell.wall:
            return false
        case Cell.dot:
            cells[target.y][target.x] = Cell.none
            break
        default: {
            // Compile-time check that every Cell is handled above.
            const unhandled: never = value
            throw new Error(`Unknown cell: ${String(unhandled)}`)
        }
    }
    player.lastPos = vec2(player.pos.x, player.pos.y)
    player.pos = target
    return true
}

// Add one tick's progress. Returns true if the character may move this tick.
function advance(character: Character, dt: number): boolean {
    character.moveProgress = Math.min(
        character.moveProgress + character.speed * dt,
        1
    )
    return character.moveProgress >= 1 - EPSILON
}

// After a move, start working towards the next one.
function spend(character: Character) {
    character.moveProgress = Math.max(character.moveProgress - 1, 0)
}

// Advance the game by one fixed tick of `dt` seconds.
//
// Every character gains speed * dt of progress and moves one cell once it has
// a whole cell's worth. A character that can't move (the player holds no
// direction or walks into a wall, an enemy is boxed in) stays ready and moves
// on the first tick it can. All moves in a tick happen together: enemies aim
// at where the player stood at the start of the tick, and collisions are
// checked once, after everyone has moved. Once the game is locked nothing
// changes.
//
// `playerStep` is the direction the player wants to move this tick (zero for
// none), and `random` drives the enemy AI, so a tick is deterministic.
export function step(
    state: GameState,
    dt: number,
    playerStep: Vec2,
    random: Random
): Outcome | null {
    if (state.locked) return null
    const { cells, player, enemies } = state
    const from = positions(state)

    if (advance(player, dt) && movePlayer(state, playerStep)) {
        spend(player)
    }
    enemies.forEach((enemy, i) => {
        if (!advance(enemy, dt)) return
        enemyMove(cells, enemy, from[0], random)
        if (!samePos(enemy.pos, from[i + 1])) spend(enemy)
    })

    return checkEnd(state, from)
}

// Where every character stands: the player first, then the enemies in order.
function positions(state: GameState): Vec2[] {
    return [state.player, ...state.enemies].map((c) => vec2(c.pos.x, c.pos.y))
}

// Two characters collide when they share a cell, or when they have just
// swapped cells (each moved into where the other was) and so passed through
// each other. `aFrom` and `bFrom` are where they stood at the start of the
// tick. Everyone moves at once, so a swap never shows up as a shared cell and
// needs this check. Start-of-tick positions are used rather than lastPos,
// which only changes when a character moves and so may be from an older tick.
function collides(a: Vec2, aFrom: Vec2, b: Vec2, bFrom: Vec2): boolean {
    return samePos(a, b) || (samePos(a, bFrom) && samePos(aFrom, b))
}

// Detect a collision (dead) or all dots eaten (won). `from` holds where
// everyone stood at the start of the tick (see positions); without it only
// shared cells count as collisions. The first detection locks the game; once
// locked this always returns null.
export function checkEnd(
    state: GameState,
    from: readonly Vec2[] = positions(state)
): Outcome | null {
    if (state.locked) return null
    const { player, enemies } = state
    for (let i = 0; i < enemies.length; i++) {
        if (collides(player.pos, from[0], enemies[i].pos, from[i + 1])) {
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
