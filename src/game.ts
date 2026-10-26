import {
    AiType,
    CATCH_DISTANCE,
    Cell,
    CharacterId,
    DOT_POINTS,
    ENEMY_IDS,
    START_LIVES,
} from "./constants"
import { enemyMove, type Random } from "./ai"
import { createCharacter, type Character } from "./character"
import { glidePos, wrapDelta } from "./glide"
import { slideStep, type IceMap } from "./ice"
import { hasDots, loopPos, type Cells, type Level } from "./level"
import { levels } from "./levels"
import { samePos, vec2, type Vec2 } from "./vec2"

export type Outcome = "dead" | "won"

export type GameState = {
    cells: Cells
    // Where the floor is ice (see ice.ts). Never changes during a game.
    ice: IceMap
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
        ice: level.ice.map((row) => [...row]),
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
// recording it in eatenAt (cleared when the step eats nothing). Returns true
// if the player moved; false if a wall blocked the step or the step was zero.
// It doesn't know about sliding: that is up to the caller (movePlayerTick).
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
// checked once, after everyone has moved, on where the characters are drawn
// over the tick (see collides, and checkEnd for what a collision costs).
// Callers stop stepping once a step returns an outcome (see flow.ts), so
// nothing changes after the game ends.
//
// On ice (see ice.ts), a sliding character's move is its slide step, taken
// at its normal move opportunity: input and AI are ignored until the slide
// ends. Phantoms float over ice and never slide.
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
    const drawnFrom = drawnPositions(state)
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
        const slide =
            enemy.ai === AiType.phantom
                ? null
                : slideStep(cells, state.ice, enemy.pos, enemy.lastPos)
        if (slide) {
            // A patroller has reached its waypoint when it stands on it as
            // the slide carries it off (patrolStep, which would notice, is
            // skipped) or slides onto it; otherwise it could keep sliding
            // past and turning back for it.
            reachWaypoint(enemy)
            enemy.lastPos = vec2(enemy.pos.x, enemy.pos.y)
            enemy.pos = loopPos(
                cells,
                vec2(enemy.pos.x + slide.x, enemy.pos.y + slide.y)
            )
            reachWaypoint(enemy)
        } else {
            enemyMove(cells, enemy, from[0], random, playerLast, state.ice)
        }
        if (samePos(enemy.pos, from[i + 1])) wait(enemy)
        else spend(enemy)
    })

    return checkEnd(state, drawnFrom)
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
//
// While sliding, the move is the slide step whatever the input. A slide step
// isn't the player's opportunity, so the buffer is left alone: a tap made
// during a slide is used at the first opportunity after it ends (a newer tap
// replaces it, as always).
function movePlayerTick(state: GameState, held: readonly Vec2[]): boolean {
    const { player } = state
    const slide = slideStep(state.cells, state.ice, player.pos, player.lastPos)
    if (slide) return movePlayer(state, slide)
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

// Where every character is drawn (see drawnPos), in the same order as
// positions.
function drawnPositions(state: GameState): Vec2[] {
    const cols = state.cells[0].length
    const rows = state.cells.length
    return [state.player, ...state.enemies].map((c) => drawnPos(c, cols, rows))
}

// Where a character is for collisions: where it is drawn at a tick boundary,
// gliding from lastPos to pos by its moveProgress (capped at 1, so a
// character waiting to move is at pos). It is glidePos without the frame
// alpha, so collisions happen where the player sees the sprites touch, not
// up to a cell earlier when a move starts. Near a tunnel it may be up to a
// cell off the map; compare positions with wrapDelta.
function drawnPos(character: Character, cols: number, rows: number): Vec2 {
    return glidePos(character, 0, cols, rows)
}

// Two characters collide when their drawn positions come within
// CATCH_DISTANCE of each other at any moment of the tick. `a0`/`b0` are where
// they were drawn at the start of the tick and `a1`/`b1` at the end; motion
// within a tick is taken as a straight line between the two, and the closest
// approach along it counts, so fast characters can't pass through each other
// between ticks (a head-on swap is caught where the sprites meet). Distances
// and motion are wrap-aware, so a catch works across a tunnel.
//
// Drawn positions are continuous across a move: a character that moves this
// tick goes from just short of (or at) its old cell, gliding in, to just past
// it, gliding out by the progress left over (see spend), so it travels at
// most a cell within a tick, even when the move crosses a tunnel.
//
// This replaces checking for a shared cell or a swap of cells, which fired
// as soon as a move started, with the sprites still up to a cell apart.
function collides(
    a0: Vec2,
    a1: Vec2,
    b0: Vec2,
    b1: Vec2,
    cols: number,
    rows: number
): boolean {
    // b relative to a at the start of the tick, and its change over the tick.
    const rx = wrapDelta(b0.x - a0.x, cols)
    const ry = wrapDelta(b0.y - a0.y, rows)
    const vx = wrapDelta(b1.x - b0.x, cols) - wrapDelta(a1.x - a0.x, cols)
    const vy = wrapDelta(b1.y - b0.y, rows) - wrapDelta(a1.y - a0.y, rows)
    const v2 = vx * vx + vy * vy
    // The moment of closest approach, as a fraction of the tick.
    const t = v2 === 0 ? 0 : Math.min(1, Math.max(0, -(rx * vx + ry * vy) / v2))
    return Math.hypot(rx + vx * t, ry + vy * t) <= CATCH_DISTANCE + EPSILON
}

// Settle the end of a tick: collisions, lives and winning. `drawnFrom` holds
// where everyone was drawn at the start of the tick (see drawnPositions);
// without it only where they are drawn now counts.
//
// - Caught on the last life: lives drop to 0 and the game is lost ("dead").
// - Caught with lives left: one life is lost and everyone respawns at once
//   (see respawn), keeping the dots and score. That is no outcome; the game
//   goes on, and callers can watch `lives` if they need to notice it.
// - No dots left: won, checked first. Eating the last dot clears the stage
//   even if the player is caught on that same tick, and costs no life.
export function checkEnd(
    state: GameState,
    drawnFrom: readonly Vec2[] = drawnPositions(state)
): Outcome | null {
    if (!hasDots(state.cells)) return "won"
    if (!caught(state, drawnFrom)) return null
    if (state.lives <= 1) {
        state.lives = 0
        return "dead"
    }
    state.lives--
    respawn(state)
    return null
}

// Whether any enemy collides with the player this tick (see collides).
// `drawnFrom` is where everyone was drawn at the start of the tick.
function caught(state: GameState, drawnFrom: readonly Vec2[]): boolean {
    const cols = state.cells[0].length
    const rows = state.cells.length
    const [player, ...enemies] = drawnPositions(state)
    return enemies.some((enemy, i) =>
        collides(drawnFrom[0], player, drawnFrom[i + 1], enemy, cols, rows)
    )
}

// Move a patroller on to its next waypoint if it stands on the current one.
function reachWaypoint(enemy: Character) {
    const { route } = enemy
    if (route && samePos(enemy.pos, route[enemy.routeIndex])) {
        enemy.routeIndex = (enemy.routeIndex + 1) % route.length
    }
}
