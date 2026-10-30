import {
    AiType,
    BLINK_RATE,
    BOSS_DAMAGE,
    BOSS_TRICKLE,
    CATCH_DISTANCE,
    Cell,
    CharacterId,
    DOT_POINTS,
    ENEMY_DAMAGE,
    ENEMY_IDS,
    HURT_INVULNERABLE_SECONDS,
    MAX_HEALTH,
    PLAYER_RESPAWN_DELAY,
    PLAYER_SPEED,
    RESPAWN_BLOCK_GRACE,
    RESPAWN_CLEAR_DISTANCE,
    TICK_RATE,
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
    playersInPlay,
    START_FACING,
    tickEffects,
    type ActiveTile,
    type BlockMap,
    type BreathDef,
    type Breather,
} from "./breath"
import { BREATHS } from "./breaths"
import {
    bossHomeStep,
    bossMove,
    bossTarget,
    createBoss,
    footprint,
    squareDistance,
    type Boss,
} from "./boss"
import { createCharacter, type Character } from "./character"
import { emit, type GameEvent } from "./events"
import { glidePos, wrapDelta, type Glider } from "./glide"
import { slideStep, type IceMap } from "./ice"
import { hasDots, loopPos, type Cells, type Level } from "./level"
import { levels } from "./levels"
import { distanceMap, openNeighbours } from "./path"
import { DEFAULT_ANIMAL, type AnimalId } from "./roster"
import { createSplitter } from "./splitter"
import { loseDots, stunned, tickStuns } from "./versus"
import { samePos, vec2, type Vec2 } from "./vec2"

export type Outcome = "dead" | "won"

// How a game is played: by one player, or by two together (co-op) or
// against each other (versus). The mode decides what running out of health
// costs (see knockOut).
export type Mode = "solo" | "coop" | "versus"

export type GameState = {
    // The rules the game is played by (see knockOut).
    mode: Mode
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
    // breath, energy, score and tap buffer. Players pass through each other
    // unless playersBump is set.
    players: Player[]
    // Whether players bump into each other (KDA-262, the Players setting):
    // a player can't move into another's cell (see playerBlocks). Off,
    // they pass through each other. With one player it changes nothing.
    // createGameState leaves it off; flow.ts sets it from the settings.
    playersBump: boolean
    enemies: Character[]
    // The level's boss (see boss.ts), or null on a level without one. Not
    // an enemy: it has no enemy slot, and breath hooks never see it.
    boss: Boss | null
    // Ticks stepped so far: the clear time, in ticks (TICK_RATE per second).
    // Only `step` counts, and it only runs during play (see flow.ts), so
    // pauses and the ending outro don't add to it.
    ticks: number
    // Where everyone starts (copied from the level). A versus player
    // knocked out comes back to its own (see bringBack).
    spawns: Spawns
    // What happened in the latest tick, in order (see events.ts). `step`
    // empties it first.
    events: GameEvent[]
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
    // Dots eaten so far, for the end screens' per-player breakdown. In
    // versus a knockout also lowers it (CATCH_DOTS, see versus.ts), and it
    // decides each round.
    dots: number
    // The cell of the dot eaten on the player's latest move, or null if that
    // move ate nothing (or the player hasn't moved since the start or
    // coming back). The dot is gone from `cells` and scored at once, but the
    // renderer keeps drawing it until the player's glide reaches it (see
    // eatenDotVisible in glide.ts). Purely visual.
    eatenAt: Vec2 | null
    // The factor on the player's speed for the glide of its latest move
    // (lastPos -> pos). It is 1 for every move today (it was added for the
    // Penguin's faster slides, which became walking on ice), kept as the
    // hook for a move that glides at another speed. The renderer reads it
    // too, so frames between ticks glide at the same rate (see glideT).
    rate: number
    // Whether the player has been taken out of play (see takeOut): it isn't
    // drawn, doesn't move, breathe, eat or get hurt, enemies and the boss
    // don't go after it, and its input is ignored. Only the 2-player rules
    // take a player out (see knockOut); in solo a knockout loses the game.
    out: boolean
    // While out, the seconds until it is back at its spawn (0 once due, while
    // it waits for the spawn to be clear; see tickPlayersOut), or null if it
    // is out for good. Null while in play.
    respawnIn: number | null
    // While out and due back, the seconds it has waited because the other
    // player was on its spawn or moving onto it (when players bump); at
    // RESPAWN_BLOCK_GRACE it comes back on the nearest free cell instead
    // (see tickPlayersOut). 0 otherwise.
    spawnHeldFor: number
    // Seconds left of a versus stun (see stun in versus.ts), 0 when not
    // stunned.
    stunnedFor: number
    // Seconds left of a versus stun's immunity (see STUN_IMMUNITY_SECONDS in
    // versus.ts): once a stun wears off the player can't be stunned again
    // until this is over. 0 when not immune.
    stunImmuneFor: number
    // Health left (KDA-257), from MAX_HEALTH down: a hit takes its damage
    // off (see hurtPlayer), and at 0 the player is knocked out. Full at the
    // start of every stage, and when it is back in play (bringBack).
    health: number
    // Ticks left of the invulnerability after a hit (see
    // HURT_INVULNERABLE_TICKS), 0 when not invulnerable: enemies and the
    // boss pass through it without hurting it, and it is drawn blinking
    // (see playerVisible).
    invulnerableFor: number
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
// `mode` is the rules it is played by (see knockOut).
export function createGameState(
    level: Level = levels[0],
    animals: AnimalId | readonly AnimalId[] = DEFAULT_ANIMAL,
    mode: Mode = "solo"
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
        mode,
        cells,
        ice,
        floorIce: ice,
        tiles: [],
        players,
        playersBump: false,
        enemies,
        boss: level.boss ? createBoss(level.boss.pos, level.boss.speed) : null,
        ticks: 0,
        spawns: {
            players: players.map(({ character: c }) => vec2(c.pos.x, c.pos.y)),
            enemies: enemySpawns,
        },
        events: [],
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
        dots: 0,
        eatenAt: null,
        rate: 1,
        out: false,
        respawnIn: null,
        spawnHeldFor: 0,
        stunnedFor: 0,
        stunImmuneFor: 0,
        health: MAX_HEALTH,
        invulnerableFor: 0,
    }
}

// The whole game's score: every player's added up.
export function totalScore(state: GameState): number {
    return state.players.reduce((sum, p) => sum + p.score, 0)
}

// Put `player` back in play on its own spawn (or `at`, see
// tickPlayersOut), as at the start of a game: ready to move, facing right,
// nothing buffered, full health. Its score, energy and cooldown are kept.
// Nobody else is touched.
export function bringBack(state: GameState, player: Player, at?: Vec2) {
    const index = state.players.indexOf(player)
    const spawn = at ?? state.spawns.players[index]
    const { character } = player
    character.pos = vec2(spawn.x, spawn.y)
    character.lastPos = vec2(spawn.x, spawn.y)
    character.moveProgress = 1
    player.breather.facing = vec2(START_FACING.x, START_FACING.y)
    player.bufferedStep = vec2(0, 0)
    player.eatenAt = null
    player.rate = 1
    player.out = false
    player.respawnIn = null
    player.spawnHeldFor = 0
    player.stunnedFor = 0
    player.stunImmuneFor = 0
    player.health = MAX_HEALTH
    player.invulnerableFor = 0
    emit(state, {
        type: "playerRespawned",
        player: index,
        at: vec2(spawn.x, spawn.y),
    })
}

// Take `player` out of play on its own (see Player.out), where it stands:
// back at its spawn after `respawnAfter` seconds (see tickPlayersOut), or
// never if it is null. Nothing else changes: the enemies, the boss, the dots
// and the other player carry on. It stops dead (no glide left to draw) with
// nothing buffered; its energy and score are kept.
export function takeOut(player: Player, respawnAfter: number | null) {
    const { character } = player
    character.lastPos = vec2(character.pos.x, character.pos.y)
    character.moveProgress = 1
    player.bufferedStep = vec2(0, 0)
    player.eatenAt = null
    player.rate = 1
    player.out = true
    player.respawnIn = respawnAfter
    player.spawnHeldFor = 0
    player.stunnedFor = 0
    player.stunImmuneFor = 0
    player.invulnerableFor = 0
}

// Whether `player` is out of play with no way back (see takeOut).
export function outForGood(player: Player): boolean {
    return player.out && player.respawnIn === null
}

// Count down every out player's wait by `dt` seconds, at the start of a
// tick, and bring back each one whose wait is over (see bringBack). One
// that is due waits on (at 0) while its spawn isn't clear: while an enemy
// or the boss is near it (see clearOfEnemies), or, when players bump, the
// other player is on it or moving onto it. It comes back on the first tick
// its spawn is clear, before anyone moves, so it may move on that same
// tick. Once the other player has held it up for RESPAWN_BLOCK_GRACE, it
// comes back on the nearest free cell instead (see nearestFreeCell).
function tickPlayersOut(state: GameState, dt: number) {
    state.players.forEach((player, i) => {
        if (!player.out || player.respawnIn === null) return
        player.respawnIn = Math.max(0, player.respawnIn - dt)
        if (player.respawnIn > EPSILON) return
        player.respawnIn = 0
        const spawn = state.spawns.players[i]
        // Held up by the other player (only when players bump), it comes
        // back on the nearest free cell instead once it has waited
        // RESPAWN_BLOCK_GRACE for it, so nobody can camp on its spawn.
        const camped = playerBlocks(state, player, spawn)
        if (!camped) {
            if (clearOfEnemies(state, spawn)) bringBack(state, player)
            return
        }
        player.spawnHeldFor += dt
        if (player.spawnHeldFor < RESPAWN_BLOCK_GRACE - EPSILON) return
        const cell = nearestFreeCell(state, player, spawn)
        if (cell) bringBack(state, player, cell)
    })
}

// The nearest cell to `spawn` (breadth-first along open cells, direction
// order on ties) that `player` may come back on: no other player there
// (see playerBlocks) and clear of enemies and the boss (see
// clearOfEnemies). Null if there is none.
function nearestFreeCell(
    state: GameState,
    player: Player,
    spawn: Vec2
): Vec2 | null {
    const seen = new Set([`${spawn.x},${spawn.y}`])
    const queue = [spawn]
    for (let head = 0; head < queue.length; head++) {
        for (const cell of openNeighbours(state.cells, queue[head])) {
            const key = `${cell.x},${cell.y}`
            if (seen.has(key)) continue
            seen.add(key)
            if (
                !playerBlocks(state, player, cell) &&
                clearOfEnemies(state, cell)
            ) {
                return cell
            }
            queue.push(cell)
        }
    }
    return null
}

// Whether a player may come back on `spawn` (its spawn, or the cell it
// comes back on instead; see tickPlayersOut) as far as enemies go: no
// enemy in play (harmless ones aside) and no undefeated boss is drawn
// within RESPAWN_CLEAR_DISTANCE of it (the boss by its footprint's square),
// or is in a move that ends on it or next to it. So nothing gliding in can
// catch it on the tick it is back or the next; checking only for a catch
// at once let an enemy just out of reach catch it a tick later. When
// players bump, the other player standing on the spawn, or moving onto it,
// holds it up too (see tickPlayersOut), so the two never share a cell.
function clearOfEnemies(state: GameState, spawn: Vec2): boolean {
    const cols = state.cells[0].length
    const rows = state.cells.length
    // `spawn` relative to `at`, the short way round.
    const offset = (at: Vec2) =>
        vec2(wrapDelta(spawn.x - at.x, cols), wrapDelta(spawn.y - at.y, rows))
    const nextTo = (cell: Vec2) => {
        const { x, y } = offset(cell)
        return Math.abs(x) + Math.abs(y) <= 1
    }
    const near = (d: number) => d < RESPAWN_CLEAR_DISTANCE - EPSILON
    const byEnemy = state.enemies.some((e) => {
        if (!inPlay(e) || hasStatus(e, "harmless")) return false
        const { x, y } = offset(drawnPos(e, cols, rows))
        return near(Math.hypot(x, y)) || nextTo(e.pos)
    })
    if (byEnemy) return false
    const { boss } = state
    if (!boss || boss.defeated) return true
    const fromBoss = offset(drawnPos(boss, cols, rows))
    return !(
        near(squareDistance(fromBoss, fromBoss)) ||
        footprint(boss.pos).some(nextTo)
    )
}

// Try to move `who` (player 1 unless given) one step, eating (and scoring)
// any dot there and recording it in its eatenAt (cleared when the step eats
// nothing), and filling its energy meter. The player then faces that way.
// Returns true if the player moved; false if a wall or, when players bump,
// another player (see playerBlocks) blocked the step or the step was zero.
// Enemies never block it (a frozen one included: the player walks over
// it), and otherwise players pass through each other. It doesn't know about
// sliding: that is up to the caller
// (movePlayerTick).
export function movePlayer(
    state: GameState,
    step: Vec2,
    who: Player = state.players[0]
): boolean {
    if (isZero(step)) return false
    const player = who.character
    const target = loopPos(
        state.cells,
        vec2(player.pos.x + step.x, player.pos.y + step.y)
    )
    if (!playerCanEnter(state, who, target)) return false
    const ate = eatDot(state, who, target)
    player.lastPos = vec2(player.pos.x, player.pos.y)
    player.pos = target
    who.breather.facing = vec2(step.x, step.y)
    who.eatenAt = ate ? vec2(target.x, target.y) : null
    return true
}

// Whether `who` may move onto `cell` (on the map): not a wall, nor, when
// players bump, another player's cell (see playerBlocks). Enemies never
// block it.
function playerCanEnter(state: GameState, who: Player, cell: Vec2): boolean {
    const value = state.cells[cell.y][cell.x]
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
    return !playerBlocks(state, who, cell)
}

// Eat (and score) the dot on `cell`, if there is one, for `who`, filling
// its energy meter. Returns whether there was one.
function eatDot(state: GameState, who: Player, cell: Vec2): boolean {
    const { cells } = state
    if (cells[cell.y][cell.x] !== Cell.dot) return false
    cells[cell.y][cell.x] = Cell.none
    who.score += DOT_POINTS
    who.dots++
    gainEnergy(who.breather)
    emit(state, {
        type: "dotEaten",
        player: state.players.indexOf(who),
        at: vec2(cell.x, cell.y),
    })
    return true
}

// Knock `player` one cell along the unit `step`, if it could move into
// that cell (see playerCanEnter): with a wall there it stays put. Returns
// whether it moved. Not tied to being hurt (see hurtPlayer): anything that
// shoves a player uses it.
//
// It glides there like a normal move, at its normal speed, eating a dot
// there and sliding on if it lands on ice, but keeps its facing (being
// shoved doesn't turn it round) and its tap buffer. The cell is one on from
// the cell the player is drawn nearest: its pos, or the cell it is leaving
// while less than halfway out of it. When the new cell lies on the glide it
// is in (shoved back the way it came, or on the way it was going) the glide
// carries on from where it is drawn; otherwise it starts from that nearest
// cell, at most half a cell from where it was drawn. A player less than
// halfway out of a cell that can't be shoved on past it turns back into
// that cell instead, so a shove never leaves it gliding on towards
// whatever shoved it.
export function knockBack(
    state: GameState,
    player: Player,
    step: Vec2
): boolean {
    if (player.out || isZero(step)) return false
    const c = player.character
    const progress = Math.min(c.moveProgress, 1)
    const gliding = progress < 1 - EPSILON
    const base = gliding && progress < 0.5 ? c.lastPos : c.pos
    const target = loopPos(state.cells, vec2(base.x + step.x, base.y + step.y))
    if (gliding && samePos(target, c.pos)) {
        // On the way it was going: the glide it is in takes it there.
        player.rate = 1
        return true
    }
    // Less than halfway out of a cell with no way on past it: back into
    // that cell, rather than gliding on towards whatever shoved it.
    const blocked = !playerCanEnter(state, player, target)
    const back = blocked && gliding && base === c.lastPos ? c.lastPos : target
    if (gliding && samePos(back, c.lastPos)) {
        if (!playerCanEnter(state, player, back)) return false
        // Back the way it came, from where it is drawn.
        player.rate = 1
        c.lastPos = vec2(c.pos.x, c.pos.y)
        c.pos = vec2(back.x, back.y)
        c.moveProgress = 1 - progress
        player.eatenAt = null
        return true
    }
    if (blocked) return false
    player.rate = 1
    const ate = eatDot(state, player, target)
    c.lastPos = vec2(base.x, base.y)
    c.pos = target
    c.moveProgress = 0
    player.eatenAt = ate ? vec2(target.x, target.y) : null
    return true
}

// Ticks a player stays invulnerable after a hit (HURT_INVULNERABLE_SECONDS).
export const HURT_INVULNERABLE_TICKS = Math.round(
    HURT_INVULNERABLE_SECONDS * TICK_RATE
)

// Hurt `player` by `damage` health (KDA-257), hit by something drawn at
// `from` (in cells; for the boss, its footprint's centre). This is the one
// path every hit takes, whatever it comes from (see checkEnd for touches).
// A player out of play, still invulnerable from an earlier hit or already
// knocked out isn't hurt; returns whether it was.
//
// With health left, the player is knocked back a cell away from `from`
// (see knockBack and awayFrom; against a wall it stays put) and is
// invulnerable for HURT_INVULNERABLE_TICKS, blinking; a hurt event reports
// it. Nothing else is reset: the enemies, the boss, the dots and the tile
// effects stay as they are. At 0 it is knocked out instead (see knockOut).
export function hurtPlayer(
    state: GameState,
    player: Player,
    damage: number,
    from: Vec2
): boolean {
    if (player.out || player.invulnerableFor > 0 || player.health <= 0) {
        return false
    }
    player.health = Math.max(0, player.health - damage)
    if (player.health <= 0) {
        knockOut(state, player)
        return true
    }
    const { pos } = player.character
    emit(state, {
        type: "hurt",
        player: state.players.indexOf(player),
        at: vec2(pos.x, pos.y),
        damage,
    })
    knockBack(state, player, awayFrom(state, player, from))
    player.invulnerableFor = HURT_INVULNERABLE_TICKS
    return true
}

// What a player whose health ran out costs, by the game's mode, reported
// as a playerCaught event where it stands:
//
// - solo: nothing more here; the game is lost (see lost).
// - coop: it is out for good (takeOut); the game is lost once no player is
//   in play.
// - versus: it loses CATCH_DOTS of its dot count (not below 0) and is out
//   for PLAYER_RESPAWN_DELAY seconds, then back at its spawn with full
//   health (see tickPlayersOut). A versus game is never lost.
function knockOut(state: GameState, player: Player) {
    const { pos } = player.character
    const at = vec2(pos.x, pos.y)
    switch (state.mode) {
        case "solo":
            break
        case "coop":
            takeOut(player, null)
            break
        case "versus":
            loseDots(player)
            takeOut(player, PLAYER_RESPAWN_DELAY)
            break
        default: {
            // Compile-time check that every Mode is handled above.
            const unhandled: never = state.mode
            throw new Error(`Unknown mode: ${String(unhandled)}`)
        }
    }
    emit(state, {
        type: "playerCaught",
        player: state.players.indexOf(player),
        at,
        outForGood: state.mode !== "versus",
    })
}

// The unit step taking `player` away from `from`, along the axis it is
// further off on (x on a tie), the short way round the map. If it is drawn
// right on `from`, it backs away from its facing.
function awayFrom(state: GameState, player: Player, from: Vec2): Vec2 {
    const cols = state.cells[0].length
    const rows = state.cells.length
    const at = drawnPos(player.character, cols, rows)
    const dx = wrapDelta(at.x - from.x, cols)
    const dy = wrapDelta(at.y - from.y, rows)
    if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
        const { facing } = player.breather
        return vec2(-facing.x, -facing.y)
    }
    return Math.abs(dx) >= Math.abs(dy)
        ? vec2(Math.sign(dx), 0)
        : vec2(0, Math.sign(dy))
}

// What the HUD's health gauge shows for a player: its health out of
// MAX_HEALTH.
export type HealthHud = { health: number; max: number }

export function healthHud(player: Player): HealthHud {
    return { health: player.health, max: MAX_HEALTH }
}

// Whether to draw `player` now: not while out of play, and while
// invulnerable after a hit, on and off BLINK_RATE times a second (starting
// on, so the knockback is seen).
export function playerVisible(player: Player): boolean {
    if (player.out) return false
    if (player.invulnerableFor <= 0) return true
    const elapsed = HURT_INVULNERABLE_TICKS - player.invulnerableFor
    const phase = Math.floor((elapsed * BLINK_RATE * 2) / TICK_RATE + EPSILON)
    return phase % 2 === 0
}

// Whether, when players bump (GameState.playersBump), another player in play
// is on `cell` or moving into it (its logical cell, pos): `who` can't go
// there, as if it were a wall. Only pos counts, not the cell a player is
// gliding out of, so one player can follow right behind the other. A
// player out of play never blocks, and enemies and the boss ignore players
// either way. Players move in order, so of two heading into one cell on a
// tick player 1 gets there and player 2 is blocked; and two players next to
// each other can't swap cells, as each is on the cell the other wants. A
// player blocked by one still to move this tick waits for it first (see
// defersMove), so following doesn't depend on the player order.
function playerBlocks(state: GameState, who: Player, cell: Vec2): boolean {
    return blockingPlayer(state, who, cell) !== null
}

// The player that blocks `who` from `cell` (see playerBlocks), or null.
function blockingPlayer(
    state: GameState,
    who: Player,
    cell: Vec2
): Player | null {
    if (!state.playersBump) return null
    return (
        state.players.find(
            (p) => p !== who && !p.out && samePos(p.character.pos, cell)
        ) ?? null
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
// over the tick (see collides, and checkEnd for what a collision costs: an
// enemy's or the boss's touch hurts, see hurtPlayer).
// Callers stop stepping once a step returns an outcome (see flow.ts), so
// nothing changes after the game ends.
//
// Players move in order, player 1 first (so on a dot both step onto in the
// same tick, player 1 eats it), and pass through each other, unless they
// bump (GameState.playersBump): then a player can't move into the other's
// cell and waits there as at a wall (see playerBlocks); a player held up
// only by one still to move this tick moves after it instead (see
// defersMove), so the one behind follows whichever player is first. Each
// enemy, and
// the boss, goes after the nearest player (see nearestTarget and
// bossTarget).
//
// A player out of play (see takeOut) sits the tick out: its input is
// ignored, it doesn't move, breathe or get hurt, and enemies and the boss
// go after the players in play only (while nobody is, each heads back to
// its own spawn). Its wait counts down first, with the breath timers,
// so one that is back (see tickPlayersOut) plays the whole tick. A
// player's invulnerability after a hit (Player.invulnerableFor) counts down
// a tick at a time there too.
//
// On ice (see ice.ts), a sliding character's move is its slide step, taken
// at its normal move opportunity: input and AI are ignored until the slide
// ends. Phantoms float over ice and never slide, and nor does a player whose
// breath walks on ice (walksOnIce, the Penguin's): ice is normal floor to it.
//
// Breaths (see breath.ts): their timers count down first, so anything that
// runs out (a status, a tile effect, a defeated enemy's wait) is over before
// anyone moves. A breath press fires after the players' moves, from the cell
// the player is moving into and along its new facing, and before the
// enemies move, so it hits them where they stood at the start of the tick.
// Player 1's breath fires first. Breaths don't affect players, except in
// versus, where a breath stuns the other player (see versus.ts): a stunned
// player ignores its input, finishes its glide (and, on ice, its slide) and
// doesn't move on or breathe, and its stun counts down with the breath
// timers. Enemies out of play don't move or catch; held ones (e.g. frozen)
// don't move; harmless ones don't catch; and enemies keep out of cells a
// tile effect blocks.
//
// A boss (see boss.ts) moves with the enemies, after the breaths, and keeps
// out of blocked cells too; a defeated one doesn't move or catch. Once the
// dots are gone with the boss still about, every energy meter refills by
// itself (BOSS_TRICKLE per second), so the boss can always be finished.
//
// What happened is reported in GameState.events (see events.ts), which is
// emptied first, so it holds this tick's events only.
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
    state.events = []
    state.ticks++
    tickEffects(state, dt)
    tickPlayersOut(state, dt)
    tickStuns(players, dt)
    for (const player of players) {
        if (player.invulnerableFor > 0) player.invulnerableFor--
    }
    trickle(state, dt)
    const from = positions(state)
    let start = tickStarts(state, dt)
    // Where each player came from on its latest move before this tick, for
    // the heading an ambusher aims along.
    const lasts = players.map(({ character: c }) =>
        vec2(c.lastPos.x, c.lastPos.y)
    )

    // The players still to take their turn this tick, and the moves put off
    // until the others have moved (see defersMove).
    const pending = new Set(players)
    const later: (() => void)[] = []
    players.forEach((player, i) => {
        const rest = playerTurn(state, player, inputs[i] ?? IDLE, dt, pending)
        if (rest) later.push(rest)
        else pending.delete(player)
    })
    for (const rest of later) rest()
    let breathed = false
    players.forEach((player, i) => {
        // A player stunned by an earlier player's breath on this same tick
        // doesn't breathe either.
        if (player.out || stunned(player)) return
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
    // What enemies and the boss go after: the players in play. While
    // nobody is, each heads back to its own spawn instead, so none parks on
    // a player's spawn and keeps it from coming back (see tickPlayersOut).
    // Random enemies and patrollers go their own way either way.
    const goingHome = !players.some((p) => !p.out)
    const aimed = players.flatMap((p, i) => (p.out ? [] : [i]))
    const targets = aimed.map((i) => from.players[i])
    const targetLasts = aimed.map((i) => lasts[i])
    // Each target's distances, searched once a tick at most, for every
    // enemy that aims at the nearest player.
    const paths = targetPaths(cells, targets, enemyCells)
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
        } else if (goingHome) {
            const home = state.spawns.enemies[i]
            enemyMove(
                cells,
                enemy,
                home,
                random,
                home,
                state.ice,
                blocked,
                enemyCells
            )
        } else {
            const target = nearestTarget(
                cells,
                enemy,
                targets,
                enemyCells,
                paths
            )
            enemyMove(
                cells,
                enemy,
                targets[target],
                random,
                targetLasts[target],
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
        const next = goingHome
            ? bossHomeStep(state, blocked)
            : bossChaseStep(state, targets, blocked)
        if (next) {
            boss.lastPos = vec2(boss.pos.x, boss.pos.y)
            boss.pos = next
            spend(boss)
        } else {
            wait(boss)
        }
    }

    const outcome = checkEnd(state, start)
    if (outcome) {
        emit(state, { type: outcome === "won" ? "gameWon" : "gameLost" })
    }
    return outcome
}

// The boss's next top-left position going after the nearest of `targets`
// (the players in play), or null to stay put (see bossTarget, bossMove).
function bossChaseStep(
    state: GameState,
    targets: readonly Vec2[],
    blocked: BlockMap | null
): Vec2 | null {
    // Each player's distances, shared by the choice and the move.
    const fromPlayers = targets.map((p) => distanceMap(state.cells, p))
    const target = bossTarget(state, targets, blocked, fromPlayers)
    return bossMove(state, targets[target], blocked, fromPlayers[target])
}

// On a boss level, once every dot is eaten and the boss is still about,
// there is no other way to fill the energy meters: they refill by
// themselves at BOSS_TRICKLE per second, up to each breath's maxEnergy.
function trickle(state: GameState, dt: number) {
    const { boss } = state
    if (!boss || boss.defeated || hasDots(state.cells)) return
    for (const { breather } of playersInPlay(state)) {
        breather.energy = Math.min(
            breather.breath.maxEnergy,
            breather.energy + BOSS_TRICKLE * dt
        )
    }
}

// Finish the glides in progress after the game has ended, for the short
// outro before the end screen (see flow.ts). Every character's moveProgress
// rises by speed * dt, capped at 1 (progress already at or past 1 is left
// alone). Nobody moves and nothing else changes (cells, score, health,
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

// `player`'s turn to move this tick (see step), with `move` its input and
// `pending` the players still to take theirs (itself included). Returns the
// rest of the turn when its move is put off until the others have moved
// (see defersMove), for the caller to run then; null once it is done.
//
// A player out of play ignores its input altogether. A stunned one (versus)
// ignores it too: it finishes the glide it is in and, on ice, its slide
// (PM decision), but makes no move of its own.
function playerTurn(
    state: GameState,
    player: Player,
    move: MoveInput,
    dt: number,
    pending: ReadonlySet<Player>
): (() => void) | null {
    if (player.out) return null
    const { character } = player
    const isStunned = stunned(player)
    if (!isStunned && !isZero(move.pressed)) player.bufferedStep = move.pressed
    // The rate was taken in tickStarts too, before anyone moved, so its
    // progress and its drawn path for collisions agree.
    if (!advance(character, dt * player.rate)) return null
    const held = isStunned ? null : move.held
    const rest = () => {
        const moved = held
            ? movePlayerTick(state, player, held)
            : slideTick(state, player)
        if (moved) spend(character)
        else wait(character)
    }
    if (defersMove(state, player, held, pending)) return rest
    rest()
    return null
}

// Whether `player`'s move this tick waits until the other players have
// moved: the first way it would go (its slide step, else the buffered tap,
// then the held directions, newest first; see movePlayerTick) that isn't a
// wall is blocked only by a player still to move this tick (in `pending`;
// see playerBlocks), which may yet move out of the way. So
// a player right behind the other follows it whichever player is first,
// instead of turning off down an older held direction or waiting a tick.
// Put off, nothing is tried or used up (the tap buffer stays); afterwards
// it moves as usual. `held` is null for a stunned player, which only
// slides.
function defersMove(
    state: GameState,
    player: Player,
    held: readonly Vec2[] | null,
    pending: ReadonlySet<Player>
): boolean {
    if (!state.playersBump) return false
    const { cells } = state
    const { character } = player
    // As slideTick sees it: a player walking on ice never slides.
    const slide = player.breather.breath.walksOnIce
        ? null
        : slideStep(cells, state.ice, character.pos, character.lastPos)
    const ways = [
        ...(slide ? [slide] : []),
        ...(held ? [player.bufferedStep, ...held] : []),
    ]
    for (const way of ways) {
        if (isZero(way)) continue
        const cell = loopPos(
            cells,
            vec2(character.pos.x + way.x, character.pos.y + way.y)
        )
        if (cells[cell.y][cell.x] === Cell.wall) continue
        const blocker = blockingPlayer(state, player, cell)
        if (!blocker) return false
        if (pending.has(blocker)) return true
    }
    return false
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
// replaces it, as always). Another player ahead ends a slide as a wall
// would when players bump (see playerBlocks), so the player is then free to
// move. A player whose breath walks on ice never slides (see slideTick).
function movePlayerTick(
    state: GameState,
    player: Player,
    held: readonly Vec2[]
): boolean {
    const slid = slideTick(state, player)
    if (slid !== null) return slid
    const buffered = player.bufferedStep
    player.bufferedStep = vec2(0, 0)
    const moved =
        movePlayer(state, buffered, player) ||
        held.some((direction) => movePlayer(state, direction, player))
    const tried = isZero(buffered) ? held[0] : buffered
    if (!moved && tried && !isZero(tried)) {
        player.breather.facing = vec2(tried.x, tried.y)
    }
    return moved
}

// Player's slide step, if it is sliding (see movePlayerTick): whether it
// moved, or null if it isn't sliding (or, when players bump, another
// player ahead ended the slide), so it is free to make a move of its own.
// Enemies don't end a slide, but the floor under one may: a frozen enemy on
// level ice is slid over, while one in breath ice stands on floor (breath
// ice never forms under a character), so a slide ends on its cell. A
// player whose breath walks on ice (BreathDef.walksOnIce) never slides.
function slideTick(state: GameState, player: Player): boolean | null {
    const { cells } = state
    const { character } = player
    if (player.breather.breath.walksOnIce) return null
    const slide = slideStep(cells, state.ice, character.pos, character.lastPos)
    if (!slide) return null
    const ahead = vec2(character.pos.x + slide.x, character.pos.y + slide.y)
    if (playerBlocks(state, player, loopPos(cells, ahead))) return null
    return movePlayer(state, slide, player)
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

// Settle the end of a tick: touches, health and winning. `start` holds
// everyone's TickStart, taken at the start of the tick (see tickStarts).
// The default is a tick of no time, so only where they are drawn now
// counts.
//
// No dots left (and, on a boss level, the boss defeated) is won, checked
// first: eating the last dot (whichever player eats it), or defeating the
// boss when that comes last, clears the stage even if a player is touched
// on that same tick, and costs it nothing. Otherwise each player in play
// and not invulnerable that an enemy or the boss touched this tick is hurt
// (see touchedBy and hurtPlayer), player 1 first. In versus a touch on that
// tick still counts (a knockout costs dots and takes the player out)
// before the round is won, so the round is scored with it.
//
// Clearing is checked again after the hits: a knockback that eats the
// last dot wins on this tick, in every mode, with the hits (and, in
// versus, any knockout's dots) already counted.
//
// The game is lost (see lost) once a hit has taken the solo player's last
// health, or no co-op player is left in play.
export function checkEnd(
    state: GameState,
    start: TickStarts = tickStarts(state, 0)
): Outcome | null {
    const bossLeft = state.boss !== null && !state.boss.defeated
    const cleared = () => !hasDots(state.cells) && !bossLeft
    if (cleared() && state.mode !== "versus") return "won"
    state.players.forEach((player, i) => {
        if (player.out || player.invulnerableFor > 0) return
        const hit = touchedBy(state, start, i)
        if (hit) hurtPlayer(state, player, hit.damage, hit.from)
    })
    // Checked again: a knockback may have eaten the last dot, which wins
    // on this tick like any other last dot (the hits stand).
    if (cleared()) return "won"
    return lost(state) ? "dead" : null
}

// Whether the game is lost, by its mode: in solo once the player's health
// is gone (see knockOut), in co-op once no player is in play (each one
// knocked out is out for good). A versus game is never lost.
function lost(state: GameState): boolean {
    switch (state.mode) {
        case "solo":
            return state.players.some((p) => p.health <= 0)
        case "coop":
            return state.players.every(outForGood)
        case "versus":
            return false
        default: {
            // Compile-time check that every Mode is handled above.
            const unhandled: never = state.mode
            throw new Error(`Unknown mode: ${String(unhandled)}`)
        }
    }
}

// A touch that hurts: the damage it does and where what touched is drawn
// (see hurtPlayer).
type Touch = { damage: number; from: Vec2 }

// What touches player `index` this tick (see collides), if anything: the
// boss (BOSS_DAMAGE, from its footprint's centre) before any enemy
// (ENEMY_DAMAGE, from where it is drawn), so the harder hit counts when
// both touch on one tick. `start` is everyone's TickStart for the tick (see
// tickStarts). Enemies out of play and harmless ones (see EnemyStatus)
// don't touch, nor does a defeated boss. Players never hurt each other.
//
// Boss levels have no tunnels. The wrap-aware offsets in collides may still
// take a far-off player the short way round the map, but on a map without
// tunnels that leaves it at least a cell from the boss's square, so it never
// makes a touch.
function touchedBy(
    state: GameState,
    start: TickStarts,
    index: number
): Touch | null {
    const cols = state.cells[0].length
    const rows = state.cells.length
    const from = start.players[index]
    const player = drawnPos(state.players[index].character, cols, rows)
    const { boss } = state
    if (boss && !boss.defeated && start.boss) {
        const at = drawnPos(boss, cols, rows)
        if (
            collides(start.boss, at, from, player, cols, rows, squareDistance)
        ) {
            return { damage: BOSS_DAMAGE, from: vec2(at.x + 0.5, at.y + 0.5) }
        }
    }
    for (const [i, e] of state.enemies.entries()) {
        if (!inPlay(e) || hasStatus(e, "harmless")) continue
        const enemy = drawnPos(e, cols, rows)
        if (collides(from, player, start.enemies[i], enemy, cols, rows)) {
            return { damage: ENEMY_DAMAGE, from: enemy }
        }
    }
    return null
}

// Move a patroller on to its next waypoint if it stands on the current one.
function reachWaypoint(enemy: Character) {
    const { route } = enemy
    if (route && samePos(enemy.pos, route[enemy.routeIndex])) {
        enemy.routeIndex = (enemy.routeIndex + 1) % route.length
    }
}
