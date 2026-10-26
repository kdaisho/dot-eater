import {
    Cell,
    CharacterId,
    DOT_POINTS,
    ENEMY_IDS,
    START_LIVES,
} from "./constants"
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
    // The direction most recently newly pressed (not just held); zero for
    // none. It is tried first at the player's next move opportunity and then
    // cleared, so a quick tap made mid-move isn't lost.
    bufferedStep: Vec2
    // Points so far: DOT_POINTS per dot eaten.
    score: number
    // Ticks stepped so far: the clear time, in ticks (TICK_RATE per second).
    // Only `step` counts, and it only runs during play (see flow.ts), so
    // pauses and the ending outro don't add to it. A lost life doesn't reset
    // it.
    ticks: number
    // Lives left, counting the one being played. A collision costs one;
    // losing the last ends the game.
    lives: number
    // Where everyone starts, and goes back to after losing a life (copied
    // from the level).
    spawns: Spawns
    // The cell of the dot eaten on the player's latest move, or null if that
    // move ate nothing (or the player hasn't moved since the start or a
    // respawn). The dot is gone from `cells` and scored at once, but the
    // renderer keeps drawing it until the player's glide reaches it (see
    // eatenDotVisible in glide.ts). Purely visual.
    eatenAt: Vec2 | null
}

export type Spawns = {
    player: Vec2
    // In the same order as GameState.enemies.
    enemies: readonly Vec2[]
}

// The player's movement input for one tick.
export type MoveInput = {
    // The directions being held, most recently pressed first (empty for
    // none). The player keeps moving the newest way that is open, so holding
    // an older direction still works while a newer one is blocked.
    held: readonly Vec2[]
    // The direction newly pressed this tick (zero for none), even if it was
    // already released again.
    pressed: Vec2
}

// Tolerance for moveProgress reaching 1, so floating-point sums of speed * dt
// still land on the intended tick.
const EPSILON = 1e-9

export function createGameState(level: Level = levels[0]): GameState {
    // Copy everything out of the level, which is shared between games.
    // Speeds the level leaves out fall back to createCharacter's defaults.
    const spawn = level.playerSpawns[0]
    const player = createCharacter(
        CharacterId.player,
        vec2(spawn.x, spawn.y),
        undefined,
        level.playerSpeed
    )
    // The player can move on the first tick; enemies start from 0, which
    // gives the player a short grace period before they move.
    player.moveProgress = 1
    const cells = level.cells.map((row) => [...row])
    const enemies = level.enemies.map((enemy, i) =>
        createCharacter(
            ENEMY_IDS[i],
            vec2(enemy.pos.x, enemy.pos.y),
            enemy.ai,
            enemy.speed,
            enemy.route
        )
    )
    return {
        cells,
        player,
        enemies,
        bufferedStep: vec2(0, 0),
        score: 0,
        ticks: 0,
        lives: START_LIVES,
        eatenAt: null,
        spawns: {
            player: vec2(spawn.x, spawn.y),
            enemies: level.enemies.map((e) => vec2(e.pos.x, e.pos.y)),
        },
    }
}

// Put everyone back where they started, as at the start of a game: the
// player ready to move, the enemies waiting out the grace period again, no
// tap buffered. Dots and score are left alone.
function respawn(state: GameState) {
    const { player, enemies, spawns } = state
    player.pos = vec2(spawns.player.x, spawns.player.y)
    player.lastPos = vec2(spawns.player.x, spawns.player.y)
    player.moveProgress = 1
    enemies.forEach((enemy, i) => {
        const spawn = spawns.enemies[i]
        enemy.pos = vec2(spawn.x, spawn.y)
        enemy.lastPos = vec2(spawn.x, spawn.y)
        enemy.moveProgress = 0
        // A patroller starts its route again from the first waypoint.
        enemy.routeIndex = 0
    })
    state.bufferedStep = vec2(0, 0)
    state.eatenAt = null
}

// Try to move the player one step, eating (and scoring) any dot there and
// recording it in eatenAt (cleared when the step eats nothing). Returns true if the player moved; false if a wall blocked the step or the
// step was zero.
export function movePlayer(state: GameState, step: Vec2): boolean {
    if (isZero(step)) return false
    const { cells, player } = state
    const target = loopPos(
        cells,
        vec2(player.pos.x + step.x, player.pos.y + step.y)
    )
    const value = cells[target.y][target.x]
    let ate = false

    switch (value) {
        case Cell.none:
            break
        case Cell.wall:
            return false
        case Cell.dot:
            cells[target.y][target.x] = Cell.none
            state.score += DOT_POINTS
            ate = true
            break
        default: {
            // Compile-time check that every Cell is handled above.
            const unhandled: never = value
            throw new Error(`Unknown cell: ${String(unhandled)}`)
        }
    }
    player.lastPos = vec2(player.pos.x, player.pos.y)
    player.pos = target
    state.eatenAt = ate ? vec2(target.x, target.y) : null
    return true
}

// Add one tick's progress. Returns true if the character may move this tick.
// A character already waiting at 1 gains nothing more, so waiting doesn't
// bank time towards the move after next.
function advance(character: Character, dt: number): boolean {
    if (character.moveProgress < 1 - EPSILON) {
        character.moveProgress += character.speed * dt
    }
    return character.moveProgress >= 1 - EPSILON
}

// After a move, start working towards the next one. Progress past 1 is kept,
// so speeds that don't divide the tick rate still average out right (7
// cells/s doesn't round down to a move every 9 ticks).
function spend(character: Character) {
    character.moveProgress = Math.max(character.moveProgress - 1, 0)
}

// Ready but not moving this tick: wait at exactly 1 for the first tick it
// can, dropping any overflow.
function wait(character: Character) {
    character.moveProgress = 1
}

// Advance the game by one fixed tick of `dt` seconds.
//
// Every character gains speed * dt of progress and moves one cell once it has
// a whole cell's worth. A character that can't move (the player holds no
// direction or walks into a wall, an enemy is boxed in) stays ready and moves
// on the first tick it can. All moves in a tick happen together: enemies aim
// at where the player stood at the start of the tick, and collisions are
// checked once, after everyone has moved (see checkEnd for what a collision
// costs). Callers stop stepping once a step
// returns an outcome (see flow.ts), so nothing changes after the game ends.
//
// `move` is the player's input this tick (see MoveInput and movePlayerTick),
// and `random` drives the enemy AI, so a tick is deterministic.
export function step(
    state: GameState,
    dt: number,
    move: MoveInput,
    random: Random
): Outcome | null {
    const { cells, player, enemies } = state
    state.ticks++
    const from = positions(state)
    // Where the player came from on its latest move before this tick, for
    // the heading an ambusher aims along.
    const playerLast = vec2(player.lastPos.x, player.lastPos.y)

    if (!isZero(move.pressed)) state.bufferedStep = move.pressed
    if (advance(player, dt)) {
        if (movePlayerTick(state, move.held)) spend(player)
        else wait(player)
    }
    enemies.forEach((enemy, i) => {
        if (!advance(enemy, dt)) return
        enemyMove(cells, enemy, from[0], random, playerLast)
        if (samePos(enemy.pos, from[i + 1])) wait(enemy)
        else spend(enemy)
    })

    return checkEnd(state, from)
}

// Finish the glides in progress after the game has ended, for the short
// outro before the end screen (see flow.ts). Every character's moveProgress
// rises by speed * dt, capped at 1 (progress already at or past 1 is left
// alone). Nobody moves and nothing else changes (cells, score, lives,
// positions). Returns true once the player's glide is complete, i.e. the
// player is drawn on its cell.
export function settle(state: GameState, dt: number): boolean {
    for (const character of [state.player, ...state.enemies]) {
        if (character.moveProgress >= 1) continue
        const progress = character.moveProgress + character.speed * dt
        character.moveProgress = progress >= 1 - EPSILON ? 1 : progress
    }
    return state.player.moveProgress >= 1 - EPSILON
}

// The player's move opportunity: try the buffered direction first, then each
// held direction, newest first, until one is open. The buffer is cleared
// either way, so it never outlives one opportunity. Returns true if the
// player moved.
function movePlayerTick(state: GameState, held: readonly Vec2[]): boolean {
    const buffered = state.bufferedStep
    state.bufferedStep = vec2(0, 0)
    return (
        movePlayer(state, buffered) ||
        held.some((direction) => movePlayer(state, direction))
    )
}

function isZero(v: Vec2): boolean {
    return v.x === 0 && v.y === 0
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

// Settle the end of a tick: collisions, lives and winning. `from` holds
// where everyone stood at the start of the tick (see positions); without it
// only shared cells count as collisions.
//
// - Caught on the last life: lives drop to 0 and the game is lost ("dead").
// - Caught with lives left: one life is lost and everyone respawns at once
//   (see respawn), keeping the dots and score. That is no outcome; the game
//   goes on, and callers can watch `lives` if they need to notice it.
// - No dots left: won, checked first. Eating the last dot clears the stage
//   even if the player is caught on that same tick, and costs no life.
export function checkEnd(
    state: GameState,
    from: readonly Vec2[] = positions(state)
): Outcome | null {
    if (!hasDots(state.cells)) return "won"
    if (!caught(state, from)) return null
    if (state.lives <= 1) {
        state.lives = 0
        return "dead"
    }
    state.lives--
    respawn(state)
    return null
}

// Whether any enemy collides with the player this tick.
function caught(state: GameState, from: readonly Vec2[]): boolean {
    const { player, enemies } = state
    return enemies.some((enemy, i) =>
        collides(player.pos, from[0], enemy.pos, from[i + 1])
    )
}
