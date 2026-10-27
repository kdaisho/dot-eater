import {
    AiType,
    CATCH_DISTANCE,
    Cell,
    CharacterId,
    DOT_POINTS,
    ENEMY_IDS,
    PLAYER_SPEED,
    START_LIVES,
} from "./constants"
import { blockedView, enemyMove, type Random } from "./ai"
import {
    breathe,
    createBreather,
    enemyBlocks,
    gainEnergy,
    hasStatus,
    inPlay,
    START_FACING,
    tickEffects,
    type ActiveTile,
    type Breather,
} from "./breath"
import { BREATHS } from "./breaths"
import { createCharacter, type Character } from "./character"
import { glidePos, wrapDelta } from "./glide"
import { slideStep, type IceMap } from "./ice"
import { hasDots, loopPos, type Cells, type Level } from "./level"
import { levels } from "./levels"
import { DEFAULT_ANIMAL, type AnimalId } from "./roster"
import { samePos, vec2, type Vec2 } from "./vec2"

export type Outcome = "dead" | "won"

export type GameState = {
    cells: Cells
    // Where the floor is ice (see ice.ts): the level's ice plus any ice tile
    // effects. Treat it as read-only: when ice comes or goes, breath.ts
    // replaces the whole grid (so hasIce's per-grid cache stays right).
    ice: IceMap
    // The level's own ice, which never changes during a game.
    floorIce: IceMap
    // Timed effects on cells from breaths (see TileEffect in breath.ts).
    tiles: ActiveTile[]
    player: Character
    // The playing character's breath, facing and energy (see breath.ts).
    breather: Breather
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
    // The factor on the player's speed for the glide of its latest move
    // (lastPos -> pos): its breath's slideSpeedScale if that move was a
    // slide step (see movePlayerTick), else 1. The renderer reads it too, so
    // frames between ticks glide at the same rate (see glideT).
    playerRate: number
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
    // Whether the breath key was newly pressed this tick. A press that can't
    // breathe (too little energy, cooling down) is dropped, not kept.
    breath?: boolean
}

// Tolerance for moveProgress reaching 1, so floating-point sums of speed * dt
// still land on the intended tick.
const EPSILON = 1e-9

// A new game of `level`, played as `animal`, whose breath and stats come
// from BREATHS (src/breaths/).
export function createGameState(
    level: Level = levels[0],
    animal: AnimalId = DEFAULT_ANIMAL
): GameState {
    // Copy everything out of the level, which is shared between games.
    // Speeds the level leaves out fall back to the defaults: createCharacter's
    // for enemies, PLAYER_SPEED for the player, which the character's
    // speedScale scales.
    const breath = BREATHS[animal]
    const spawn = level.playerSpawns[0]
    const player = createCharacter(
        CharacterId.player,
        vec2(spawn.x, spawn.y),
        undefined,
        (level.playerSpeed ?? PLAYER_SPEED) * breath.speedScale
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
    const ice = level.ice.map((row) => [...row])
    return {
        cells,
        ice,
        floorIce: ice,
        tiles: [],
        player,
        breather: createBreather(breath),
        enemies,
        bufferedStep: vec2(0, 0),
        score: 0,
        ticks: 0,
        lives: START_LIVES,
        eatenAt: null,
        playerRate: 1,
        spawns: {
            player: vec2(spawn.x, spawn.y),
            enemies: level.enemies.map((e) => vec2(e.pos.x, e.pos.y)),
        },
    }
}

// Put everyone back where they started, as at the start of a game: the
// player ready to move, the enemies waiting out the grace period again, no
// tap buffered, the player facing right again. Every enemy is back in play
// with no statuses, including one that was defeated and waiting to respawn.
// Dots, score, energy, the breath cooldown and tile effects are left alone.
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
        enemy.statuses = []
        enemy.respawnIn = 0
    })
    state.breather.facing = vec2(START_FACING.x, START_FACING.y)
    state.bufferedStep = vec2(0, 0)
    state.eatenAt = null
    state.playerRate = 1
}

// Try to move the player one step, eating (and scoring) any dot there and
// recording it in eatenAt (cleared when the step eats nothing), and filling
// the energy meter. The player then faces that way. Returns true if the
// player moved; false if a wall or a solid enemy (see EnemyStatus) blocked
// the step or the step was zero. It doesn't know about sliding: that is up
// to the caller (movePlayerTick).
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
            break
        default: {
            // Compile-time check that every Cell is handled above.
            const unhandled: never = value
            throw new Error(`Unknown cell: ${String(unhandled)}`)
        }
    }
    if (solidAt(state, target)) return false
    if (value === Cell.dot) {
        cells[target.y][target.x] = Cell.none
        state.score += DOT_POINTS
        gainEnergy(state.breather)
        ate = true
    }
    player.lastPos = vec2(player.pos.x, player.pos.y)
    player.pos = target
    state.breather.facing = vec2(step.x, step.y)
    state.eatenAt = ate ? vec2(target.x, target.y) : null
    return true
}

// Whether an enemy in play with a solid status (see EnemyStatus) stands on
// `cell`: the player can't go there, as if it were a wall.
function solidAt(state: GameState, cell: Vec2): boolean {
    return state.enemies.some(
        (e) => inPlay(e) && hasStatus(e, "solid") && samePos(e.pos, cell)
    )
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
// ends. Phantoms float over ice and never slide. The player's breath may
// speed its slides up (slideSpeedScale; see GameState.playerRate).
//
// Breaths (see breath.ts): their timers count down first, so anything that
// runs out (a status, a tile effect, a defeated enemy's wait) is over before
// anyone moves. A breath press fires after the player's move, from the cell
// it is moving into and along its new facing, and before the enemies move,
// so it hits them where they stood at the start of the tick. Enemies out of
// play don't move or catch; held ones (e.g. frozen) don't move; harmless
// ones don't catch; and enemies keep out of cells a tile effect blocks.
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
    tickEffects(state, dt)
    const from = positions(state)
    // Taken once, before anyone moves, so the player's progress and its
    // drawn path for collisions use the same rate all tick.
    const rate = state.playerRate
    let start = tickStarts(state, dt, rate)
    // Where the player came from on its latest move before this tick, for
    // the heading an ambusher aims along.
    const playerLast = vec2(player.lastPos.x, player.lastPos.y)

    if (!isZero(move.pressed)) state.bufferedStep = move.pressed
    if (advance(player, dt * rate)) {
        if (movePlayerTick(state, move.held)) spend(player)
        else wait(player)
    }
    if (move.breath && breathe(state)) {
        // The breath comes before the enemies move, but it may have moved
        // some (pushed or defeated) or held them: trace each enemy from
        // where it is after the breath, not along a sweep across the jump.
        start = [start[0], ...tickStarts(state, dt, rate).slice(1)]
    }
    const blocked = enemyBlocks(state)
    // Cells as enemies see them, so blocked cells also end slides.
    const enemyCells = blocked ? blockedView(cells, blocked) : cells
    enemies.forEach((enemy, i) => {
        if (!inPlay(enemy) || hasStatus(enemy, "holds")) return
        if (!advance(enemy, dt)) return
        const slide =
            enemy.ai === AiType.phantom
                ? null
                : slideStep(enemyCells, state.ice, enemy.pos, enemy.lastPos)
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
            enemyMove(
                cells,
                enemy,
                from[0],
                random,
                playerLast,
                state.ice,
                blocked,
                enemyCells
            )
        }
        if (samePos(enemy.pos, from[i + 1])) wait(enemy)
        else spend(enemy)
    })

    return checkEnd(state, start)
}

// Finish the glides in progress after the game has ended, for the short
// outro before the end screen (see flow.ts). Every character's moveProgress
// rises by speed * dt, capped at 1 (progress already at or past 1 is left
// alone). Nobody moves and nothing else changes (cells, score, lives,
// positions). Returns true once the player's glide is complete, i.e. the
// player is drawn on its cell.
export function settle(state: GameState, dt: number): boolean {
    const rate = state.playerRate
    for (const character of [state.player, ...state.enemies]) {
        if (character.moveProgress >= 1) continue
        const scale = character === state.player ? rate : 1
        const progress = character.moveProgress + character.speed * dt * scale
        character.moveProgress = progress >= 1 - EPSILON ? 1 : progress
    }
    return state.player.moveProgress >= 1 - EPSILON
}

// The player's move opportunity: try the buffered direction first, then each
// held direction, newest first, until one is open. The buffer is cleared
// either way, so it never outlives one opportunity. Returns true if the
// player moved.
//
// The player faces the way it moved. If it tried and every way was blocked,
// it turns to face the first way it tried (the buffered tap, else the newest
// held direction), so it can face a wall it is pushing against, and keeps
// facing it while it waits there.
//
// While sliding, the move is the slide step whatever the input. A slide step
// isn't the player's opportunity, so the buffer is left alone: a tap made
// during a slide is used at the first opportunity after it ends (a newer tap
// replaces it, as always). A solid enemy ahead ends a slide as a wall would,
// so the player is then free to move. The glide of a slide step (and only of
// a slide step) runs at the breath's slideSpeedScale (GameState.playerRate).
function movePlayerTick(state: GameState, held: readonly Vec2[]): boolean {
    const { cells, player } = state
    const slide = slideStep(cells, state.ice, player.pos, player.lastPos)
    if (slide) {
        const ahead = vec2(player.pos.x + slide.x, player.pos.y + slide.y)
        if (!solidAt(state, loopPos(cells, ahead))) {
            if (!movePlayer(state, slide)) return false
            state.playerRate = state.breather.breath.slideSpeedScale ?? 1
            return true
        }
    }
    const buffered = state.bufferedStep
    state.bufferedStep = vec2(0, 0)
    const moved =
        movePlayer(state, buffered) ||
        held.some((direction) => movePlayer(state, direction))
    if (moved) state.playerRate = 1
    const tried = isZero(buffered) ? held[0] : buffered
    if (!moved && tried && !isZero(tried)) {
        state.breather.facing = vec2(tried.x, tried.y)
    }
    return moved
}

function isZero(v: Vec2): boolean {
    return v.x === 0 && v.y === 0
}

// Where every character stands: the player first, then the enemies in order.
function positions(state: GameState): Vec2[] {
    return [state.player, ...state.enemies].map((c) => vec2(c.pos.x, c.pos.y))
}

// Where every character is drawn now (see drawnPos), in the same order as
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
export function drawnPos(
    character: Character,
    cols: number,
    rows: number
): Vec2 {
    return glidePos(character, 0, cols, rows)
}

// What a character was like at the start of a tick: enough to trace where
// it is drawn through the tick (see drawnPath).
export type TickStart = {
    // Where it was drawn (drawnPos).
    drawn: Vec2
    // Its cell (pos), where the glide it is in ends.
    cell: Vec2
    // When in the tick, from 0 (its start) to 1 (its end), its glide reaches
    // `cell`, or Infinity if it doesn't get there this tick.
    arrive: number
}

// Every character's TickStart for a tick of `dt` seconds, in the same order
// as positions. Taken before anyone moves. `rate` scales the player's speed
// (see GameState.playerRate); the default leaves it alone.
function tickStarts(state: GameState, dt: number, rate = 1): TickStart[] {
    const cols = state.cells[0].length
    const rows = state.cells.length
    return [state.player, ...state.enemies].map((c) => ({
        drawn: drawnPos(c, cols, rows),
        cell: vec2(c.pos.x, c.pos.y),
        // A held enemy's progress doesn't move on this tick, so it stays
        // where it is drawn.
        arrive:
            c !== state.player && hasStatus(c, "holds")
                ? Infinity
                : arriveTime(c, c === state.player ? dt * rate : dt),
    }))
}

// When in a tick of `dt` seconds a character's glide reaches its cell: the
// moment its moveProgress reaches 1, which is also when it may move on (see
// advance). Progress grows steadily by speed * dt over the tick, so from p
// that is (1 - p) / (speed * dt). A character already at 1 (waiting to move)
// is there from the start: 0. Reaching 1 within EPSILON of the end of the
// tick counts as the end, as advance counts it as reached.
function arriveTime(character: Character, dt: number): number {
    const { moveProgress, speed } = character
    if (moveProgress >= 1 - EPSILON) return 0
    const gain = speed * dt
    if (moveProgress + gain < 1 - EPSILON) return Infinity
    return Math.min(1, (1 - moveProgress) / gain)
}

// A point on a drawn path: `t` is when in the tick (0 to 1), `x`/`y` the
// offset in cells from where the character was drawn at the start of it.
type Waypoint = { t: number; x: number; y: number }

// Where a character is drawn through a tick, as waypoints joined by straight
// lines, from `start` to `end` (where it is drawn at the end of the tick).
//
// A character that doesn't reach its cell this tick glides straight on. One
// that does (at start.arrive) glides in to the cell's centre, then either
// stays there or, if it moved, glides straight out towards its new cell by
// the progress left over (see spend). So the path bends at the centre: an L
// on a turn, folding back on itself on a reversal. Each part is about a cell
// long at most, so its offset is taken the short way round with wrapDelta
// and comes out right across a tunnel.
function drawnPath(
    start: TickStart,
    end: Vec2,
    cols: number,
    rows: number
): Waypoint[] {
    const origin = { t: 0, x: 0, y: 0 }
    const { drawn, cell, arrive } = start
    if (arrive >= 1) {
        return [
            origin,
            {
                t: 1,
                x: wrapDelta(end.x - drawn.x, cols),
                y: wrapDelta(end.y - drawn.y, rows),
            },
        ]
    }
    const centre = {
        t: arrive,
        x: wrapDelta(cell.x - drawn.x, cols),
        y: wrapDelta(cell.y - drawn.y, rows),
    }
    return [
        origin,
        centre,
        {
            t: 1,
            x: centre.x + wrapDelta(end.x - cell.x, cols),
            y: centre.y + wrapDelta(end.y - cell.y, rows),
        },
    ]
}

// The offset along `path` at time `t` (0 to 1).
function offsetAt(path: readonly Waypoint[], t: number): Vec2 {
    let i = 1
    while (i < path.length - 1 && t > path[i].t) i++
    const a = path[i - 1]
    const b = path[i]
    const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1
    return vec2(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f)
}

// How close the segment from `p` to `q` comes to the origin.
function segmentDistance(p: Vec2, q: Vec2): number {
    const dx = q.x - p.x
    const dy = q.y - p.y
    const d2 = dx * dx + dy * dy
    const t =
        d2 === 0 ? 0 : Math.min(1, Math.max(0, -(p.x * dx + p.y * dy) / d2))
    return Math.hypot(p.x + dx * t, p.y + dy * t)
}

// Two characters collide when their drawn positions come within
// CATCH_DISTANCE of each other at any moment of the tick. `a`/`b` are their
// TickStarts and `aEnd`/`bEnd` where they are drawn at the end of the tick.
// Each moves along its drawnPath, so the position of one relative to the
// other moves in straight lines between the moments either path bends (at
// most two), and the closest approach on each of those pieces is checked.
// That is exact for the drawn motion: fast characters can't pass through
// each other between ticks (a head-on swap is caught where the sprites
// meet), and one that turns or turns back within a tick is caught at the
// cell centre it goes through. It is all wrap-aware, so a catch works across
// a tunnel.
//
// This replaces checking for a shared cell or a swap of cells, which fired
// as soon as a move started, with the sprites still up to a cell apart.
function collides(
    a: TickStart,
    aEnd: Vec2,
    b: TickStart,
    bEnd: Vec2,
    cols: number,
    rows: number
): boolean {
    const pathA = drawnPath(a, aEnd, cols, rows)
    const pathB = drawnPath(b, bEnd, cols, rows)
    // b relative to a at the start of the tick.
    const rx = wrapDelta(b.drawn.x - a.drawn.x, cols)
    const ry = wrapDelta(b.drawn.y - a.drawn.y, rows)
    const relativeAt = (t: number) => {
        const oa = offsetAt(pathA, t)
        const ob = offsetAt(pathB, t)
        return vec2(rx + ob.x - oa.x, ry + ob.y - oa.y)
    }
    const times = [...pathA, ...pathB].map((w) => w.t).sort((x, y) => x - y)
    for (let i = 1; i < times.length; i++) {
        const p = relativeAt(times[i - 1])
        const q = relativeAt(times[i])
        if (segmentDistance(p, q) <= CATCH_DISTANCE + EPSILON) return true
    }
    return false
}

// Settle the end of a tick: collisions, lives and winning. `start` holds
// everyone's TickStart, taken at the start of the tick (see tickStarts). The
// default is a tick of no time, so only where they are drawn now counts.
//
// - Caught on the last life: lives drop to 0 and the game is lost ("dead").
// - Caught with lives left: one life is lost and everyone respawns at once
//   (see respawn), keeping the dots and score. That is no outcome; the game
//   goes on, and callers can watch `lives` if they need to notice it.
// - No dots left: won, checked first. Eating the last dot clears the stage
//   even if the player is caught on that same tick, and costs no life.
export function checkEnd(
    state: GameState,
    start: readonly TickStart[] = tickStarts(state, 0)
): Outcome | null {
    if (!hasDots(state.cells)) return "won"
    if (!caught(state, start)) return null
    if (state.lives <= 1) {
        state.lives = 0
        return "dead"
    }
    state.lives--
    respawn(state)
    return null
}

// Whether any enemy collides with the player this tick (see collides).
// `start` is everyone's TickStart for the tick. Enemies out of play and
// harmless ones (see EnemyStatus) don't catch.
function caught(state: GameState, start: readonly TickStart[]): boolean {
    const cols = state.cells[0].length
    const rows = state.cells.length
    const [player, ...enemies] = drawnPositions(state)
    return enemies.some((enemy, i) => {
        const e = state.enemies[i]
        if (!inPlay(e) || hasStatus(e, "harmless")) return false
        return collides(start[0], player, start[i + 1], enemy, cols, rows)
    })
}

// Move a patroller on to its next waypoint if it stands on the current one.
function reachWaypoint(enemy: Character) {
    const { route } = enemy
    if (route && samePos(enemy.pos, route[enemy.routeIndex])) {
        enemy.routeIndex = (enemy.routeIndex + 1) % route.length
    }
}
