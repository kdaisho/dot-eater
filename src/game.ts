import {
    AiType,
    BOSS_TRICKLE,
    CATCH_DISTANCE,
    Cell,
    CharacterId,
    DOT_POINTS,
    ENEMY_IDS,
    PLAYER_SPEED,
    START_LIVES,
} from "./constants"
import {
    blockedView,
    enemyMove,
    nearestTarget,
    targetPaths,
    type Random,
} from "./ai"
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
    type BreathDef,
    type Breather,
} from "./breath"
import { BREATHS } from "./breaths"
import {
    bossMove,
    bossTarget,
    createBoss,
    resetBoss,
    squareDistance,
    type Boss,
} from "./boss"
import { createCharacter, type Character } from "./character"
import { glidePos, wrapDelta, type Glider } from "./glide"
import { slideStep, type IceMap } from "./ice"
import { hasDots, loopPos, type Cells, type Level } from "./level"
import { levels } from "./levels"
import { distanceMap } from "./path"
import { DEFAULT_ANIMAL, type AnimalId } from "./roster"
import { createSplitter, resetSplitter } from "./splitter"
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
    // One or two players, player 1 first. Each has its own character,
    // breath, energy, score and tap buffer. Players pass through each other.
    players: Player[]
    enemies: Character[]
    // The level's boss (see boss.ts), or null on a level without one. Not
    // an enemy: it has no enemy slot, and breath hooks never see it.
    boss: Boss | null
    // Ticks stepped so far: the clear time, in ticks (TICK_RATE per second).
    // Only `step` counts, and it only runs during play (see flow.ts), so
    // pauses and the ending outro don't add to it. A lost life doesn't reset
    // it.
    ticks: number
    // Lives left, counting the one being played, shared by the players. A
    // collision costs one; losing the last ends the game (see resolveCatch).
    lives: number
    // Where everyone starts, and goes back to after losing a life (copied
    // from the level).
    spawns: Spawns
}

// One player: its character on the board, plus everything else that is its
// own.
export type Player = {
    character: Character
    // Its breath, facing and energy (see breath.ts).
    breather: Breather
    // The direction most recently newly pressed (not just held); zero for
    // none. It is tried first at the player's next move opportunity and then
    // cleared, so a quick tap made mid-move isn't lost.
    bufferedStep: Vec2
    // Points so far: DOT_POINTS per dot eaten, plus what its breaths earn
    // (see totalScore for the whole game's).
    score: number
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
    rate: number
}

export type Spawns = {
    // In the same order as GameState.players.
    players: readonly Vec2[]
    // In the same order as GameState.enemies.
    enemies: readonly Vec2[]
}

// One player's movement input for one tick.
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

// No input: nothing held or pressed.
export const IDLE: MoveInput = { held: [], pressed: vec2(0, 0) }

// Tolerance for moveProgress reaching 1, so floating-point sums of speed * dt
// still land on the intended tick.
const EPSILON = 1e-9

// A new game of `level`, played as `animals`, one per player (one animal on
// its own for a 1-player game), whose breaths and stats come from BREATHS
// (src/breaths/). Player i starts on the level's spawn i.
export function createGameState(
    level: Level = levels[0],
    animals: AnimalId | readonly AnimalId[] = DEFAULT_ANIMAL
): GameState {
    const picks = typeof animals === "string" ? [animals] : animals
    if (picks.length === 0 || picks.length > level.playerSpawns.length) {
        throw new Error(
            `Can't start "${level.name}" with ${picks.length} players`
        )
    }
    // Copy everything out of the level, which is shared between games.
    const players = picks.map((animal, i) =>
        createPlayer(level, animal, level.playerSpawns[i])
    )
    const cells = level.cells.map((row) => [...row])
    // Like player 1's, the other players' spawns start empty. The level
    // keeps a dot on them for the games without those players.
    for (const { character: c } of players.slice(1)) {
        cells[c.pos.y][c.pos.x] = Cell.none
    }
    // One enemy slot each, two for a Splitter (see splitter.ts), all with
    // the spawn of the level's enemy they come from.
    const enemies: Character[] = []
    const enemySpawns: Vec2[] = []
    for (const enemy of level.enemies) {
        const [id, spareId] = ENEMY_IDS.slice(enemies.length)
        const slots =
            enemy.ai === AiType.splitter
                ? createSplitter([id, spareId], enemy.pos, enemy.speed)
                : [
                      createCharacter(
                          id,
                          vec2(enemy.pos.x, enemy.pos.y),
                          enemy.ai,
                          enemy.speed,
                          enemy.route
                      ),
                  ]
        for (const slot of slots) {
            enemies.push(slot)
            enemySpawns.push(vec2(enemy.pos.x, enemy.pos.y))
        }
    }
    const ice = level.ice.map((row) => [...row])
    return {
        cells,
        ice,
        floorIce: ice,
        tiles: [],
        players,
        enemies,
        boss: level.boss ? createBoss(level.boss.pos, level.boss.speed) : null,
        ticks: 0,
        lives: START_LIVES,
        spawns: {
            players: players.map(({ character: c }) => vec2(c.pos.x, c.pos.y)),
            enemies: enemySpawns,
        },
    }
}

// A player of `level` as `animal`, on `spawn`. Speeds the level leaves out
// fall back to the defaults: PLAYER_SPEED for the player (createCharacter's
// for enemies), which the character's speedScale scales.
function createPlayer(level: Level, animal: AnimalId, spawn: Vec2): Player {
    const breath = BREATHS[animal]
    const character = createCharacter(
        CharacterId.player,
        vec2(spawn.x, spawn.y),
        undefined,
        (level.playerSpeed ?? PLAYER_SPEED) * breath.speedScale
    )
    // The player can move on the first tick; enemies start from 0, which
    // gives the players a short grace period before they move.
    character.moveProgress = 1
    return newPlayer(character, breath)
}

// A player for `character` breathing `breath`, with an empty meter, no
// score and nothing buffered.
export function newPlayer(character: Character, breath: BreathDef): Player {
    return {
        character,
        breather: createBreather(breath),
        bufferedStep: vec2(0, 0),
        score: 0,
        eatenAt: null,
        rate: 1,
    }
}

// The whole game's score: every player's added up.
export function totalScore(state: GameState): number {
    return state.players.reduce((sum, p) => sum + p.score, 0)
}

// Put everyone back where they started, as at the start of a game: the
// players ready to move, the enemies waiting out the grace period again, no
// tap buffered, the players facing right again. Every enemy is back in play
// with no statuses, including one that was defeated and waiting to respawn,
// and a Splitter is whole again (see resetSplitter). The boss is back at its
// spawn too, keeping its damage (see resetBoss); a defeated one stays gone.
// Dots, scores, energy, the breath cooldowns and tile effects are left alone.
function respawn(state: GameState) {
    const { enemies, spawns } = state
    state.players.forEach((player, i) => {
        const spawn = spawns.players[i]
        const { character } = player
        character.pos = vec2(spawn.x, spawn.y)
        character.lastPos = vec2(spawn.x, spawn.y)
        character.moveProgress = 1
        player.breather.facing = vec2(START_FACING.x, START_FACING.y)
        player.bufferedStep = vec2(0, 0)
        player.eatenAt = null
        player.rate = 1
    })
    enemies.forEach((enemy, i) => {
        const spawn = spawns.enemies[i]
        enemy.pos = vec2(spawn.x, spawn.y)
        enemy.lastPos = vec2(spawn.x, spawn.y)
        enemy.moveProgress = 0
        // A patroller starts its route again from the first waypoint.
        enemy.routeIndex = 0
        enemy.statuses = []
        enemy.respawnIn = 0
        resetSplitter(enemy)
    })
    if (state.boss) resetBoss(state.boss)
}

// Try to move `who` (player 1 unless given) one step, eating (and scoring)
// any dot there and recording it in its eatenAt (cleared when the step eats
// nothing), and filling its energy meter. The player then faces that way.
// Returns true if the player moved; false if a wall or a solid enemy (see
// EnemyStatus) blocked the step or the step was zero. Other players never
// block it: players pass through each other. It doesn't know about sliding:
// that is up to the caller (movePlayerTick).
export function movePlayer(
    state: GameState,
    step: Vec2,
    who: Player = state.players[0]
): boolean {
    if (isZero(step)) return false
    const { cells } = state
    const player = who.character
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
        who.score += DOT_POINTS
        gainEnergy(who.breather)
        ate = true
    }
    player.lastPos = vec2(player.pos.x, player.pos.y)
    player.pos = target
    who.breather.facing = vec2(step.x, step.y)
    who.eatenAt = ate ? vec2(target.x, target.y) : null
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
function advance(character: Glider, dt: number): boolean {
    if (character.moveProgress < 1 - EPSILON) {
        character.moveProgress += character.speed * dt
    }
    return character.moveProgress >= 1 - EPSILON
}

// After a move, start working towards the next one. Progress past 1 is kept,
// so speeds that don't divide the tick rate still average out right (7
// cells/s doesn't round down to a move every 9 ticks).
function spend(character: Glider) {
    character.moveProgress = Math.max(character.moveProgress - 1, 0)
}

// Ready but not moving this tick: wait at exactly 1 for the first tick it
// can, dropping any overflow.
function wait(character: Glider) {
    character.moveProgress = 1
}

// Advance the game by one fixed tick of `dt` seconds.
//
// Every character gains speed * dt of progress and moves one cell once it has
// a whole cell's worth. A character that can't move (a player holds no
// direction or walks into a wall, an enemy is boxed in) stays ready and moves
// on the first tick it can. All moves in a tick happen together: enemies aim
// at where the players stood at the start of the tick, and collisions are
// checked once, after everyone has moved, on where the characters are drawn
// over the tick (see collides, and checkEnd for what a collision costs).
// Callers stop stepping once a step returns an outcome (see flow.ts), so
// nothing changes after the game ends.
//
// Players move in order, player 1 first (so on a dot both step onto in the
// same tick, player 1 eats it), and pass through each other. Each enemy, and
// the boss, goes after the nearest player (see nearestTarget and
// bossTarget).
//
// On ice (see ice.ts), a sliding character's move is its slide step, taken
// at its normal move opportunity: input and AI are ignored until the slide
// ends. Phantoms float over ice and never slide. A player's breath may
// speed its slides up (slideSpeedScale; see Player.rate).
//
// Breaths (see breath.ts): their timers count down first, so anything that
// runs out (a status, a tile effect, a defeated enemy's wait) is over before
// anyone moves. A breath press fires after the players' moves, from the cell
// the player is moving into and along its new facing, and before the
// enemies move, so it hits them where they stood at the start of the tick.
// Player 1's breath fires first. Breaths don't affect players. Enemies out
// of play don't move or catch; held ones (e.g. frozen) don't move; harmless
// ones don't catch; and enemies keep out of cells a tile effect blocks.
//
// A boss (see boss.ts) moves with the enemies, after the breaths, and keeps
// out of blocked cells too; a defeated one doesn't move or catch. Once the
// dots are gone with the boss still about, every energy meter refills by
// itself (BOSS_TRICKLE per second), so the boss can always be finished.
//
// `moves` is each player's input this tick, player 1 first (see MoveInput
// and movePlayerTick); a single MoveInput is player 1's, with the others
// idle. `random` drives the enemy AI, so a tick is deterministic.
export function step(
    state: GameState,
    dt: number,
    moves: MoveInput | readonly MoveInput[],
    random: Random
): Outcome | null {
    const { cells, players, enemies } = state
    const inputs = "held" in moves ? [moves] : moves
    state.ticks++
    tickEffects(state, dt)
    trickle(state, dt)
    const from = positions(state)
    let start = tickStarts(state, dt)
    // Where each player came from on its latest move before this tick, for
    // the heading an ambusher aims along.
    const lasts = players.map(({ character: c }) =>
        vec2(c.lastPos.x, c.lastPos.y)
    )

    players.forEach((player, i) => {
        const move = inputs[i] ?? IDLE
        if (!isZero(move.pressed)) player.bufferedStep = move.pressed
        // The rate was taken in tickStarts too, before anyone moved, so its
        // progress and its drawn path for collisions agree.
        if (advance(player.character, dt * player.rate)) {
            if (movePlayerTick(state, player, move.held)) {
                spend(player.character)
            } else {
                wait(player.character)
            }
        }
    })
    let breathed = false
    players.forEach((player, i) => {
        if (inputs[i]?.breath && breathe(state, player)) breathed = true
    })
    if (breathed) {
        // The breath comes before the enemies move, but it may have moved
        // some (pushed or defeated) or held them: trace each enemy from
        // where it is after the breath, not along a sweep across the jump.
        const after = tickStarts(state, dt)
        start = { ...after, players: start.players }
    }
    const blocked = enemyBlocks(state)
    // Cells as enemies see them, so blocked cells also end slides.
    const enemyCells = blocked ? blockedView(cells, blocked) : cells
    // Each player's distances, searched once a tick at most, for every
    // enemy that aims at the nearest player.
    const paths = targetPaths(cells, from.players, enemyCells)
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
            const target = nearestTarget(
                cells,
                enemy,
                from.players,
                enemyCells,
                paths
            )
            enemyMove(
                cells,
                enemy,
                from.players[target],
                random,
                lasts[target],
                state.ice,
                blocked,
                enemyCells
            )
        }
        if (samePos(enemy.pos, from.enemies[i])) wait(enemy)
        else spend(enemy)
    })
    const { boss } = state
    if (boss && !boss.defeated && advance(boss, dt)) {
        // Each player's distances, shared by the choice and the move.
        const fromPlayers = from.players.map((p) => distanceMap(cells, p))
        const target = bossTarget(state, from.players, blocked, fromPlayers)
        const next = bossMove(
            state,
            from.players[target],
            blocked,
            fromPlayers[target]
        )
        if (next) {
            boss.lastPos = vec2(boss.pos.x, boss.pos.y)
            boss.pos = next
            spend(boss)
        } else {
            wait(boss)
        }
    }

    return checkEnd(state, start)
}

// On a boss level, once every dot is eaten and the boss is still about,
// there is no other way to fill the energy meters: they refill by
// themselves at BOSS_TRICKLE per second, up to each breath's maxEnergy.
function trickle(state: GameState, dt: number) {
    const { boss } = state
    if (!boss || boss.defeated || hasDots(state.cells)) return
    for (const { breather } of state.players) {
        breather.energy = Math.min(
            breather.breath.maxEnergy,
            breather.energy + BOSS_TRICKLE * dt
        )
    }
}

// Finish the glides in progress after the game has ended, for the short
// outro before the end screen (see flow.ts). Every character's moveProgress
// rises by speed * dt, capped at 1 (progress already at or past 1 is left
// alone). Nobody moves and nothing else changes (cells, score, lives,
// positions). Returns true once every player's glide is complete, i.e. the
// players are drawn on their cells.
export function settle(state: GameState, dt: number): boolean {
    const boss = state.boss ? [state.boss] : []
    const gliders = [
        ...state.players.map((p) => ({ c: p.character, rate: p.rate })),
        ...[...state.enemies, ...boss].map((c) => ({ c, rate: 1 })),
    ]
    for (const { c, rate } of gliders) {
        if (c.moveProgress >= 1) continue
        const progress = c.moveProgress + c.speed * dt * rate
        c.moveProgress = progress >= 1 - EPSILON ? 1 : progress
    }
    return state.players.every((p) => p.character.moveProgress >= 1 - EPSILON)
}

// A player's move opportunity: try the buffered direction first, then each
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
// a slide step) runs at the breath's slideSpeedScale (Player.rate).
function movePlayerTick(
    state: GameState,
    player: Player,
    held: readonly Vec2[]
): boolean {
    const { cells } = state
    const { character } = player
    const slide = slideStep(cells, state.ice, character.pos, character.lastPos)
    if (slide) {
        const ahead = vec2(character.pos.x + slide.x, character.pos.y + slide.y)
        if (!solidAt(state, loopPos(cells, ahead))) {
            if (!movePlayer(state, slide, player)) return false
            player.rate = player.breather.breath.slideSpeedScale ?? 1
            return true
        }
    }
    const buffered = player.bufferedStep
    player.bufferedStep = vec2(0, 0)
    const moved =
        movePlayer(state, buffered, player) ||
        held.some((direction) => movePlayer(state, direction, player))
    if (moved) player.rate = 1
    const tried = isZero(buffered) ? held[0] : buffered
    if (!moved && tried && !isZero(tried)) {
        player.breather.facing = vec2(tried.x, tried.y)
    }
    return moved
}

function isZero(v: Vec2): boolean {
    return v.x === 0 && v.y === 0
}

// Where every character stands.
function positions(state: GameState): { players: Vec2[]; enemies: Vec2[] } {
    const at = (c: Character) => vec2(c.pos.x, c.pos.y)
    return {
        players: state.players.map((p) => at(p.character)),
        enemies: state.enemies.map(at),
    }
}

// Where a character is for collisions: where it is drawn at a tick boundary,
// gliding from lastPos to pos by its moveProgress (capped at 1, so a
// character waiting to move is at pos). It is glidePos without the frame
// alpha, so collisions happen where the player sees the sprites touch, not
// up to a cell earlier when a move starts. Near a tunnel it may be up to a
// cell off the map; compare positions with wrapDelta.
export function drawnPos(character: Glider, cols: number, rows: number): Vec2 {
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

// Everyone's TickStart for a tick (see tickStarts).
export type TickStarts = {
    // In the same order as GameState.players.
    players: TickStart[]
    // In the same order as GameState.enemies.
    enemies: TickStart[]
    // The boss's (of its top-left cell), or null if there is no boss.
    boss: TickStart | null
}

// Everyone's TickStart for a tick of `dt` seconds, taken before anyone
// moves. Each player's speed is scaled by its rate (see Player.rate).
function tickStarts(state: GameState, dt: number): TickStarts {
    const cols = state.cells[0].length
    const rows = state.cells.length
    const startOf = (c: Glider, arrive: number): TickStart => ({
        drawn: drawnPos(c, cols, rows),
        cell: vec2(c.pos.x, c.pos.y),
        arrive,
    })
    const { boss } = state
    return {
        players: state.players.map((p) =>
            startOf(p.character, arriveTime(p.character, dt * p.rate))
        ),
        // A held enemy's progress doesn't move on this tick, so it stays
        // where it is drawn.
        enemies: state.enemies.map((e) =>
            startOf(e, hasStatus(e, "holds") ? Infinity : arriveTime(e, dt))
        ),
        boss: boss ? startOf(boss, arriveTime(boss, dt)) : null,
    }
}

// When in a tick of `dt` seconds a character's glide reaches its cell: the
// moment its moveProgress reaches 1, which is also when it may move on (see
// advance). Progress grows steadily by speed * dt over the tick, so from p
// that is (1 - p) / (speed * dt). A character already at 1 (waiting to move)
// is there from the start: 0. Reaching 1 within EPSILON of the end of the
// tick counts as the end, as advance counts it as reached.
function arriveTime(character: Glider, dt: number): number {
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
//
// `near` measures how close a piece of the relative motion comes to `a`:
// by default to its centre (segmentDistance). For the boss, `a` is its
// top-left cell and `near` is squareDistance, the closest approach to the
// square its four cell centres span, so any touch on its footprint counts.
function collides(
    a: TickStart,
    aEnd: Vec2,
    b: TickStart,
    bEnd: Vec2,
    cols: number,
    rows: number,
    near: (p: Vec2, q: Vec2) => number = segmentDistance
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
        if (near(p, q) <= CATCH_DISTANCE + EPSILON) return true
    }
    return false
}

// Settle the end of a tick: collisions, lives and winning. `start` holds
// everyone's TickStart, taken at the start of the tick (see tickStarts). The
// default is a tick of no time, so only where they are drawn now counts.
//
// No dots left (and, on a boss level, the boss defeated) is won, checked
// first: eating the last dot (whichever player eats it), or defeating the
// boss when that comes last, clears the stage even if a player is caught
// on that same tick, and costs no life. Otherwise any player caught this
// tick goes to resolveCatch.
export function checkEnd(
    state: GameState,
    start: TickStarts = tickStarts(state, 0)
): Outcome | null {
    const bossLeft = state.boss !== null && !state.boss.defeated
    if (!hasDots(state.cells) && !bossLeft) return "won"
    const caughtPlayers = state.players.filter((_, i) =>
        caught(state, start, i)
    )
    return caughtPlayers.length > 0 ? resolveCatch(state, caughtPlayers) : null
}

// What catching `caught` (one or more players, caught on the same tick)
// costs. This is the one place that decides it, so the 2-player modes
// (KDA-221 co-op, KDA-222 versus) can give it their own rules.
//
// For now every game plays by the 1-player rule, with the lives shared:
// - caught on the last life: lives drop to 0 and the game is lost ("dead");
// - caught with lives left: one life is lost, however many players were
//   caught, and everyone respawns at once (see respawn), keeping the dots
//   and scores. That is no outcome; the game goes on, and callers can watch
//   `lives` if they need to notice it.
export function resolveCatch(
    state: GameState,
    caught: readonly Player[]
): Outcome | null {
    if (caught.length === 0) return null
    if (state.lives <= 1) {
        state.lives = 0
        return "dead"
    }
    state.lives--
    respawn(state)
    return null
}

// Whether any enemy, or the boss, collides with player `index` this tick
// (see collides). `start` is everyone's TickStart for the tick (see
// tickStarts). Enemies out of play and harmless ones (see EnemyStatus)
// don't catch, nor does a defeated boss. Players never catch each other.
//
// Boss levels have no tunnels. The wrap-aware offsets in collides may still
// take a far-off player the short way round the map, but on a map without
// tunnels that leaves it at least a cell from the boss's square, so it never
// makes a catch.
function caught(state: GameState, start: TickStarts, index: number): boolean {
    const cols = state.cells[0].length
    const rows = state.cells.length
    const player = drawnPos(state.players[index].character, cols, rows)
    const from = start.players[index]
    const byEnemy = state.enemies.some((e, i) => {
        if (!inPlay(e) || hasStatus(e, "harmless")) return false
        const enemy = drawnPos(e, cols, rows)
        return collides(from, player, start.enemies[i], enemy, cols, rows)
    })
    if (byEnemy) return true
    const { boss } = state
    if (!boss || boss.defeated || !start.boss) return false
    return collides(
        start.boss,
        drawnPos(boss, cols, rows),
        from,
        player,
        cols,
        rows,
        squareDistance
    )
}

// Move a patroller on to its next waypoint if it stands on the current one.
function reachWaypoint(enemy: Character) {
    const { route } = enemy
    if (route && samePos(enemy.pos, route[enemy.routeIndex])) {
        enemy.routeIndex = (enemy.routeIndex + 1) % route.length
    }
}
