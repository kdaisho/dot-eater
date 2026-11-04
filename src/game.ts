import {
    AiType,
    BLINK_RATE,
    BOSS_BREATH_EVERY,
    BOSS_DAMAGE,
    BossKind,
    CATCH_DISTANCE,
    Cell,
    CharacterId,
    DOT_POINTS,
    ENEMY_DAMAGE,
    ENEMY_IDS,
    HURT_INVULNERABLE_SECONDS,
    MAX_HEALTH,
    PLAYER_SPEED,
    RESPAWN_DELAY,
    TICK_RATE,
} from "./constants"
import {
    blockedView,
    breatherOn,
    enemyMove,
    mayHold,
    nearestTarget,
    stacksOn,
    targetPaths,
    turnOrder,
    type ChaseDistances,
    type Random,
} from "./ai"
import {
    cancelCharge,
    chargeTick,
    createBreather,
    enemyBlocks,
    gainEnergy,
    hasStatus,
    inPlay,
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
    squareDistance,
    type Boss,
} from "./boss"
import { tickBossBreath } from "./bossBreath"
import {
    advanceDefeat,
    defeatOver,
    defeatTimeScale,
    startDefeat,
    type BossDefeat,
} from "./bossDefeat"
import { createCharacter, type Character } from "./character"
import {
    BOSS_BREATH_SCALE,
    enemySpeed,
    RESPAWN_SCALE,
    tenguSpeed,
    type Difficulty,
} from "./difficulty"
import { emit, type GameEvent } from "./events"
import { glidePos, moveStep, wrapDelta, type Glider } from "./glide"
import { tickEnemyBreaths } from "./enemyBreath"
import { slideStep, type IceMap } from "./ice"
import {
    hasDots,
    loopPos,
    type BossBreathData,
    type Cells,
    type Level,
} from "./level"
import { levels } from "./levels"
import { distanceMap } from "./path"
import { DEFAULT_ANIMAL, type AnimalId } from "./roster"
import { createRegrow, dotGone, tickRegrow, type Regrow } from "./regrow"
import { createSplitter, dropDot, tickDrops } from "./splitter"
import { panicked, tickPanics } from "./panic"
import {
    ageReveals,
    clearPresents,
    createPresents,
    dropPresents,
    openPresents,
    tickPresents,
    type Presents,
    type SpeedBoost,
} from "./present"
import { samePos, vec2, type Vec2 } from "./vec2"

export type Outcome = "dead" | "won"

// How a game is played: by one player, or by two together (co-op). The
// mode decides what running out of health costs (see knockOut).
export type Mode = "solo" | "coop"

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
    // breath, energy, score and tap buffer. Players bump into each other
    // (KDA-262): a player can't move into another's cell (see
    // playerBlocks).
    players: Player[]
    enemies: Character[]
    // The level's boss (see boss.ts), or null on a level without one. Not
    // an enemy: it has no enemy slot, and breath hooks never see it.
    boss: Boss | null
    // Ticks stepped so far: the clear time, in ticks (TICK_RATE per second).
    // Only `step` counts, and it only runs during play (see flow.ts), so
    // pauses and the ending outro don't add to it.
    ticks: number
    // Where everyone starts (copied from the level).
    spawns: Spawns
    // What happened in the latest tick, in order (see events.ts). `step`
    // empties it first.
    events: GameEvent[]
    // Whether the game was won by eating the last dot and its gameWon event
    // waits for the outro (see settle), so the stage clear sound comes as
    // the players are drawn on their last cells, not as the last move
    // starts. Won by defeating the boss, it is held too, for the defeat's
    // effect (see `defeat`). False otherwise.
    winHeld: boolean
    // The boss's defeat as it plays out in the outro (KDA-301, see
    // bossDefeat.ts), from the tick it falls; null before, and on a level
    // without a boss.
    defeat: BossDefeat | null
    // The eaten dots growing back, on a level with rules.regrowDots (see
    // regrow.ts); null on one without.
    regrow: Regrow | null
    // Whether Splitters drop dots (rules.splitterDrops, see dropDot in
    // splitter.ts).
    splitterDrops: boolean
    // How long a defeated enemy stays gone, in seconds (see defeatEnemy in
    // breath.ts), from the game's difficulty: RESPAWN_DELAY in a game with
    // none.
    respawnDelay: number
    // The present boxes on the map and the ones being opened (KDA-324, see
    // present.ts).
    presents: Presents
    // The game's difficulty, for the speed of an enemy that joins mid-game
    // (a present's Germ); left out in a game with none.
    difficulty?: Difficulty
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
    // Dots eaten so far, for the end screens' per-player breakdown.
    dots: number
    // The cell of the dot eaten on the player's latest move, or null if that
    // move ate nothing (or the player hasn't moved since the start). The
    // dot is gone from `cells` and scored at once, but the
    // renderer keeps drawing it until the player's glide reaches it (see
    // eatenDotVisible in glide.ts). Purely visual.
    eatenAt: Vec2 | null
    // The factor on the player's speed for the glide of its latest move
    // (lastPos -> pos). It is 1 for every move but the Boar's dash, which
    // glides in DASH_SECONDS however far it goes (see dashPlayer). The
    // renderer reads it too, so frames between ticks glide at the same rate
    // (see glideT), and so do the collisions (see tickStarts).
    rate: number
    // Whether the player has been taken out of play (see takeOut): it isn't
    // drawn, doesn't move, breathe, eat or get hurt, enemies and the boss
    // don't go after it, and its input is ignored. Only co-op takes a
    // player out, for good (see knockOut); in solo a knockout loses the
    // game.
    out: boolean
    // Seconds left of a panic (see panic in panic.ts), 0 when not
    // panicked.
    panickedFor: number
    // Seconds left of a panic's immunity (see PANIC_IMMUNITY_SECONDS in
    // panic.ts): once a panic wears off the player can't panic again until
    // this is over. 0 when not immune.
    panicImmuneFor: number
    // Health left (KDA-257), from MAX_HEALTH down: a hit takes its damage
    // off (see hurtPlayer), and at 0 the player is knocked out. Full at the
    // start of every stage.
    health: number
    // Ticks left of the invulnerability after a hit (see
    // HURT_INVULNERABLE_TICKS), 0 when not invulnerable: enemies and the
    // boss pass through it without hurting it, and it is drawn blinking
    // (see playerVisible).
    invulnerableFor: number
    // A present's Speed boost while it lasts (KDA-324, see present.ts),
    // null otherwise: its character's speed is boosted meanwhile.
    speedBoost: SpeedBoost | null
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
    // Whether the breath key was newly pressed this tick, even if it was
    // already released again. A press during the cooldown fires once it
    // ends; one without the energy waits only while held (see chargeTick).
    breath?: boolean
    // Whether the breath key is held now. Held after a press, the breath
    // charges; it fires once let go (see chargeTick in breath.ts). Left
    // out, a press is a tap and fires at once.
    breathHeld?: boolean
}

// No input: nothing held or pressed.
export const IDLE: MoveInput = { held: [], pressed: vec2(0, 0) }

// Tolerance for moveProgress reaching 1, so floating-point sums of speed * dt
// still land on the intended tick.
const EPSILON = 1e-9

// A new game of `level`, played as `animals`, one per player (one animal on
// its own for a 1-player game), whose breaths and stats come from BREATHS
// (src/breaths/). Player i starts on the level's spawn i.
// `mode` is the rules it is played by (see knockOut). `difficulty` sets
// (KDA-290) how fast enemies go (enemySpeed), how soon a defeated enemy is
// back (RESPAWN_SCALE) and how often the boss breathes (BOSS_BREATH_SCALE);
// left out, all of them are the level's and the defaults, as before.
export function createGameState(
    level: Level = levels[0],
    animals: AnimalId | readonly AnimalId[] = DEFAULT_ANIMAL,
    mode: Mode = "solo",
    difficulty?: Difficulty
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
            if (difficulty) speedUp(slot, difficulty)
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
        enemies,
        boss: level.boss
            ? createBoss(
                  level.boss.pos,
                  level.boss.speed,
                  difficulty
                      ? bossBreathAt(level.boss.breath, difficulty)
                      : level.boss.breath,
                  level.boss.health,
                  level.boss.kind
              )
            : null,
        ticks: 0,
        spawns: {
            players: players.map(({ character: c }) => vec2(c.pos.x, c.pos.y)),
            enemies: enemySpawns,
        },
        events: [],
        winHeld: false,
        defeat: null,
        regrow: createRegrow(level.rules.regrowDots, cells),
        splitterDrops: level.rules.splitterDrops ?? false,
        respawnDelay:
            RESPAWN_DELAY * (difficulty ? RESPAWN_SCALE[difficulty] : 1),
        presents: createPresents(),
        ...(difficulty ? { difficulty } : {}),
    }
}

// An enemy slot's speeds at `difficulty` (see enemySpeed, and tenguSpeed
// for a Tengu): its own and, for a Splitter's slot, the whole Splitter's
// and its halves'.
function speedUp(enemy: Character, difficulty: Difficulty) {
    enemy.speed =
        enemy.ai === AiType.random
            ? tenguSpeed(enemy.speed, difficulty)
            : enemySpeed(enemy.speed, difficulty)
    const { part } = enemy
    if (!part) return
    part.wholeSpeed = enemySpeed(part.wholeSpeed, difficulty)
    part.halfSpeed = enemySpeed(part.halfSpeed, difficulty)
}

// The boss's breath tuning from its level (`data`) at `difficulty`: its
// `every` (BOSS_BREATH_EVERY if the level leaves it out) times
// BOSS_BREATH_SCALE. Its wind-up is the level's.
function bossBreathAt(
    data: BossBreathData = {},
    difficulty: Difficulty
): BossBreathData {
    const every = data.every ?? BOSS_BREATH_EVERY
    return { ...data, every: every * BOSS_BREATH_SCALE[difficulty] }
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
        panickedFor: 0,
        panicImmuneFor: 0,
        health: MAX_HEALTH,
        invulnerableFor: 0,
        speedBoost: null,
    }
}

// The whole game's score: every player's added up.
export function totalScore(state: GameState): number {
    return state.players.reduce((sum, p) => sum + p.score, 0)
}

// Take `player` out of play on its own (see Player.out), for good, where
// it stands. Nothing else changes: the enemies, the boss, the dots and the
// other player carry on. It stops dead (no glide left to draw) with
// nothing buffered; its energy and score are kept.
export function takeOut(player: Player) {
    const { character } = player
    character.lastPos = vec2(character.pos.x, character.pos.y)
    character.moveProgress = 1
    player.bufferedStep = vec2(0, 0)
    player.eatenAt = null
    player.rate = 1
    player.out = true
    player.panickedFor = 0
    player.panicImmuneFor = 0
    player.invulnerableFor = 0
}

// Try to move `who` (player 1 unless given) one step, eating (and scoring)
// any dot there and recording it in its eatenAt (cleared when the step eats
// nothing), and filling its energy meter. The player then faces that way.
// Returns true if the player moved; false if a wall or another player (see
// playerBlocks) blocked the step or the step was zero. Enemies never block
// it (a frozen one included: the player walks over it). It doesn't know
// about sliding: that is up to the caller (movePlayerTick).
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
    // At its own pace again after a dash (see dashPlayer).
    who.rate = 1
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
export function eatDot(state: GameState, who: Player, cell: Vec2): boolean {
    const { cells } = state
    if (cells[cell.y][cell.x] !== Cell.dot) return false
    cells[cell.y][cell.x] = Cell.none
    dotGone(state, cell)
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

// How long the Boar's dash glides, however many cells it covers (KDA-307,
// with the user: before, it took a whole move, and the rammed enemy was
// gone well before the Boar got there; a placeholder to tune at preview).
// What it rams is hit as it arrives (see rushView.ts).
export const DASH_SECONDS = 0.1

// Dash `who` along `path` (KDA-304, the Boar's Rush; see BreathHit.dash in
// breath.ts): cells in a straight line on from its cell, nearest first. It
// goes as far along them as it may enter (see playerCanEnter: not a wall
// nor, when players bump, the other player's cell), eating every dot it
// passes over, and ends on the last cell it reached. Returns how many cells
// it went (0 leaves it as it was).
//
// It glides the whole way in DASH_SECONDS, however far it goes (its
// Player.rate), so the dash is a burst on release, and then may move on as
// after any move. Its collisions follow that faster glide, as they follow
// any glide (see tickStarts). A dash on along the glide it was already in
// carries that glide on from where it is drawn; any other starts from its
// cell. It keeps its facing (it dashed the way it faced) and lands without
// sliding: the glide is longer than a step, so slideStep sees no slide to
// carry on.
export function dashPlayer(
    state: GameState,
    who: Player,
    path: readonly Vec2[]
): number {
    if (who.out) return 0
    const c = who.character
    const from = vec2(c.pos.x, c.pos.y)
    let moved = 0
    for (const cell of path) {
        if (!playerCanEnter(state, who, cell)) break
        eatDot(state, who, cell)
        c.pos = vec2(cell.x, cell.y)
        moved++
    }
    if (moved === 0) return 0
    const cols = state.cells[0].length
    const rows = state.cells.length
    const progress = Math.min(c.moveProgress, 1)
    const was = moveStep(c.lastPos, from, cols, rows)
    const { facing } = who.breather
    if (progress < 1 - EPSILON && samePos(was, facing)) {
        // Drawn `left` of a cell short of `from`: the new glide, `moved`
        // cells longer, starts from the same spot.
        const left = 1 - progress
        c.moveProgress = 1 - (moved + left) / (moved + 1)
    } else {
        c.lastPos = from
        c.moveProgress = 0
    }
    // The rest of the glide (all of it, but for a dash carried on) in
    // DASH_SECONDS. Never slower than a step.
    who.rate = Math.max(1, (1 - c.moveProgress) / (c.speed * DASH_SECONDS))
    who.eatenAt = null
    return moved
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
function knockOut(state: GameState, player: Player) {
    const { pos } = player.character
    const at = vec2(pos.x, pos.y)
    switch (state.mode) {
        case "solo":
            break
        case "coop":
            takeOut(player)
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

// What the HUD shows of the boss (KDA-267): its health, the stage's goal on
// a boss level (see cleared). Null on a level without one. A defeated boss
// shows an empty gauge.
export function bossHud(state: GameState): HealthHud | null {
    const { boss } = state
    return boss ? { health: boss.health, max: boss.maxHealth } : null
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

// Whether another player in play is on `cell` or moving into it (its logical cell, pos): `who` can't go
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
// same tick, player 1 eats it), and bump into each other: a player can't
// move into the other's cell and waits there as at a wall (see
// playerBlocks); a player held up
// only by one still to move this tick moves after it instead (see
// defersMove), so the one behind follows whichever player is first. Each
// enemy, and
// the boss, goes after the nearest player (see nearestTarget and
// bossTarget).
//
// A player out of play (see takeOut) sits the tick out: its input is
// ignored, it doesn't move, breathe or get hurt, and enemies and the boss
// go after the players in play only (while nobody is, each heads back to
// its own spawn). A player's invulnerability after a hit
// (Player.invulnerableFor) counts down a tick at a time with the breath
// timers.
//
// On ice (see ice.ts), a sliding character's move is its slide step, taken
// at its normal move opportunity: input and AI are ignored until the slide
// ends. Phantoms float over ice and never slide, and nor does a player whose
// breath walks on ice (walksOnIce, the Penguin's): ice is normal floor to it.
//
// Breaths (see breath.ts): their timers count down first, so anything that
// runs out (a status, a tile effect, a defeated enemy's wait) is over before
// anyone moves. A breath is charged while held and fires when let go (a
// tap at once; see chargeTick), after the players' moves, from the cell
// the player is moving into and along its new facing, and before the
// enemies move, so it hits them where they stood at the start of the tick.
// Player 1's breath fires first. Breaths never hurt players, but one that
// strikes the other player panics it (KDA-316, see panic.ts). A panicked
// player (see panic.ts) ignores its input, finishes its glide (and, on
// ice, its slide) and doesn't move on or breathe (a charge it was holding
// is dropped), and its panic counts down with the breath timers. Enemies
// out of play don't move
// or catch; held ones (e.g. frozen) don't move; harmless ones don't catch;
// and enemies keep out of cells a tile effect blocks.
//
// A boss (see boss.ts) moves with the enemies, after the breaths, and keeps
// out of blocked cells too; a defeated one doesn't move or catch. Just
// before it moves, its breath ticks (see bossBreath.ts): it may wind up
// (holding still) or breathe, hurting the players it strikes.
//
// On a level with rules.regrowDots, eaten dots due back grow back with the
// timers, on cells no character is on (see regrow.ts), so a player moving
// onto one this tick eats it. On one with rules.splitterDrops, a Splitter
// due to drop a dot drops it on the cell it leaves as it moves (see dropDot
// in splitter.ts).
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
    tickPanics(players, dt)
    tickPresents(state, dt)
    for (const player of players) {
        if (player.invulnerableFor > 0) player.invulnerableFor--
    }
    tickRegrow(state, dt)
    tickDrops(state, dt)
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
    // Where each player stands before the breaths, to tell which ones a
    // breath moved (a dash or a shove, KDA-304).
    const beforeBreaths = players.map(({ character: c }) =>
        vec2(c.pos.x, c.pos.y)
    )
    players.forEach((player, i) => {
        // A panicked player doesn't breathe, and loses any charge.
        if (player.out || panicked(player)) return cancelCharge(player.breather)
        if (chargeTick(state, player, inputs[i] ?? IDLE, dt)) breathed = true
    })
    if (breathed) {
        // The breath comes before the enemies move, but it may have moved
        // some (pushed or defeated) or held them: trace each enemy from
        // where it is after it, not along a sweep across the jump.
        // A player keeps the start it moved from this tick, unless a breath
        // moved it (the Boar's dash, or a shove down its chain, KDA-304):
        // then it is traced from where it is now, not swept across the
        // cells it was carried over, which may hold the very enemies it
        // was shoved along with.
        const fresh = tickStarts(state, dt)
        start = {
            ...fresh,
            players: start.players.map((s, i) =>
                samePos(beforeBreaths[i], players[i].character.pos)
                    ? s
                    : fresh.players[i]
            ),
        }
    }
    // ---- Breathers (KDA-291, see enemyBreath.ts) ----
    // After the breaths and before the enemies move (one winding up holds still): each breather's
    // breath ticks, and it may wind up or breathe, hurting the players it
    // strikes.
    tickEnemyBreaths(state)
    const blocked = enemyBlocks(state)
    // Cells as enemies see them, so blocked cells also end slides.
    const enemyCells = blocked ? blockedView(cells, blocked) : cells
    // What enemies and the boss go after: the players in play. While
    // nobody is, each heads back to its own spawn instead.
    // Random enemies and patrollers go their own way either way.
    const goingHome = !players.some((p) => !p.out)
    const aimed = players.flatMap((p, i) => (p.out ? [] : [i]))
    const targets = aimed.map((i) => from.players[i])
    const targetLasts = aimed.map((i) => lasts[i])
    // Each target's distances, searched once a tick at most, for every
    // enemy that aims at the nearest player.
    const paths = targetPaths(cells, targets, enemyCells)
    // The distances chasers and ambushers aim by, shared the same way.
    const aims: ChaseDistances = new Map()
    // The enemies a chaser, ambusher or Splitter keeps from stacking on,
    // where each is as the loop goes (see spreadChoice in ai.ts).
    const crowd = enemies.filter(inPlay)
    // The enemies ready to move this tick (all gain their progress first).
    const movers = enemies.flatMap((enemy, i) => {
        if (!inPlay(enemy) || hasStatus(enemy, "holds")) {
            enemy.heldFor = 0
            return []
        }
        // Still gliding: not holding (a hold is always ready to move), so a
        // push or split that cut a hold short leaves none to count against
        // the next.
        advance(enemy, dt)
        if (enemy.moveProgress < 1 - EPSILON) {
            enemy.heldFor = 0
            return []
        }
        return [i]
    })
    // Mostly slot order, but one behind a twin goes after it (see
    // turnOrder in ai.ts).
    for (const i of turnOrder(enemies, movers)) {
        const enemy = enemies[i]
        const slide =
            enemy.ai === AiType.phantom
                ? null
                : slideStep(enemyCells, state.ice, enemy.pos, enemy.lastPos)
        const slideTo =
            slide &&
            loopPos(cells, vec2(enemy.pos.x + slide.x, enemy.pos.y + slide.y))
        // A breather never slides onto another breather (KDA-291, see
        // breatherOn in ai.ts): it holds, as below, for a move's time at
        // most; then it gives the slide up and moves as it chooses (see
        // breatherStep), which never takes it onto one either.
        const ontoBreather =
            slideTo !== null && breatherOn(crowd, enemy, slideTo)
        // Whether it holds its move so as not to stack (see spreadChoice).
        let held = false
        if (slideTo && !(ontoBreather && !mayHold(enemy))) {
            // A slide is no choice, but it may still carry a chaser,
            // ambusher or Splitter onto one of its kind: then it holds, as
            // a choice would, and slides on a cell behind.
            held =
                mayHold(enemy) &&
                (ontoBreather || stacksOn(crowd, enemy, slideTo))
            if (!held) {
                // A patroller has reached its waypoint when it stands on
                // it as the slide carries it off (patrolStep, which would
                // notice, is skipped) or slides onto it; otherwise it could
                // keep sliding past and turning back for it.
                reachWaypoint(enemy)
                enemy.lastPos = vec2(enemy.pos.x, enemy.pos.y)
                enemy.pos = slideTo
                reachWaypoint(enemy)
            }
        } else if (goingHome) {
            const home = state.spawns.enemies[i]
            held = enemyMove(
                cells,
                enemy,
                home,
                random,
                home,
                state.ice,
                blocked,
                enemyCells,
                aims,
                crowd
            )
        } else {
            const target = nearestTarget(
                cells,
                enemy,
                targets,
                enemyCells,
                paths
            )
            held = enemyMove(
                cells,
                enemy,
                targets[target],
                random,
                targetLasts[target],
                state.ice,
                blocked,
                enemyCells,
                aims,
                crowd,
                players[aimed[target]].character.speed
            )
        }
        enemy.heldFor = held ? enemy.heldFor + dt : 0
        if (samePos(enemy.pos, from.enemies[i])) {
            wait(enemy)
        } else {
            spend(enemy)
            dropDot(state, i)
        }
    }
    const { boss } = state
    // The boss's glide moves on first, then its breath (see bossBreath.ts),
    // which winds up only once the boss is drawn on its cell; while it
    // winds up it makes no new move.
    // A staggered boss (see staggerBoss in boss.ts) makes no move: its
    // glide waits too, so it can't step on the tick the stagger ends.
    const ready =
        boss !== null &&
        !boss.defeated &&
        boss.stagger <= EPSILON &&
        advance(boss, dt)
    const holding = tickBossBreath(state)
    if (boss && ready) {
        const next = holding
            ? null
            : goingHome
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

    // Present boxes (KDA-324, see present.ts): this tick's drops, then the
    // boxes under the players open, before the touches count, so a quake
    // opened this tick already makes the enemies harmless.
    dropPresents(state, random)
    openPresents(state, random)
    const outcome = checkEnd(state, start)
    if (outcome) clearPresents(state)
    // The last dot is eaten as the move into its cell starts, a glide
    // before the eater is drawn there: its gameWon waits for settle. The
    // boss's fall starts its defeat (KDA-301), and its gameWon waits for
    // the effect, which settle plays out.
    if (outcome === "won" && boss !== null) {
        state.defeat = startDefeat(state, boss.kind === BossKind.final)
        state.winHeld = true
    } else if (outcome === "won") state.winHeld = true
    else if (outcome) emit(state, { type: "gameLost" })
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

// Finish the glides in progress after the game has ended, for the short
// outro before the end screen (see flow.ts). Every character's moveProgress
// rises by speed * dt, capped at 1 (progress already at or past 1 is left
// alone). Nobody moves and nothing else changes (cells, score, health,
// positions). Returns true once every player's glide is complete, i.e. the
// players are drawn on their cells; a gameWon held back for the last dot
// (GameState.winHeld) is reported then, once.
//
// After a boss's fall (GameState.defeat, KDA-301) the outro is its defeat
// as well: the timeline moves on by `dt` (see advanceDefeat, which reports
// the held gameWon when the jingle is due), the glides stand still in its
// hit-stop (defeatTimeScale) and the boss's own glide stays where it fell,
// and it returns true only once the timeline is over too.
export function settle(state: GameState, dt: number): boolean {
    const { defeat } = state
    const scale = defeat ? defeatTimeScale(defeat) : 1
    const boss = state.boss && !defeat ? [state.boss] : []
    const gliders = [
        ...state.players.map((p) => ({ c: p.character, rate: p.rate })),
        ...[...state.enemies, ...boss].map((c) => ({ c, rate: 1 })),
    ]
    for (const { c, rate } of gliders) {
        if (c.moveProgress >= 1) continue
        const progress = c.moveProgress + c.speed * dt * scale * rate
        c.moveProgress = progress >= 1 - EPSILON ? 1 : progress
    }
    const glided = state.players.every(
        (p) => p.character.moveProgress >= 1 - EPSILON
    )
    ageReveals(state, dt)
    if (defeat) {
        advanceDefeat(state, dt)
        return glided && defeatOver(defeat)
    }
    if (glided && state.winHeld) {
        state.winHeld = false
        emit(state, { type: "gameWon" })
    }
    return glided
}

// `player`'s turn to move this tick (see step), with `move` its input and
// `pending` the players still to take theirs (itself included). Returns the
// rest of the turn when its move is put off until the others have moved
// (see defersMove), for the caller to run then; null once it is done.
//
// A player out of play ignores its input altogether. A panicked one (see
// panic.ts) ignores it too: it finishes the glide it is in and, on ice,
// its slide (PM decision), but makes no move of its own.
function playerTurn(
    state: GameState,
    player: Player,
    move: MoveInput,
    dt: number,
    pending: ReadonlySet<Player>
): (() => void) | null {
    if (player.out) return null
    const { character } = player
    const frozen = panicked(player)
    if (!frozen && !isZero(move.pressed)) player.bufferedStep = move.pressed
    // The rate was taken in tickStarts too, before anyone moved, so its
    // progress and its drawn path for collisions agree.
    if (!advance(character, dt * player.rate)) return null
    const held = frozen ? null : move.held
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
// it moves as usual. `held` is null for a panicked player, which only
// slides.
function defersMove(
    state: GameState,
    player: Player,
    held: readonly Vec2[] | null,
    pending: ReadonlySet<Player>
): boolean {
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
// The stage cleared (see cleared) is won, checked first: eating the last
// dot (whichever player eats it), or on a boss level defeating the boss,
// clears the stage even if a player is touched on that same tick, and
// costs it nothing. Otherwise each player in play
// and not invulnerable that an enemy or the boss touched this tick is hurt
// (see touchedBy and hurtPlayer), player 1 first.
//
// Clearing is checked again after the hits: a knockback that eats the
// last dot of a level without a boss wins on this tick, in every mode,
// with the hits already counted.
//
// The game is lost (see lost) once a hit has taken the solo player's last
// health, or no co-op player is left in play.
export function checkEnd(
    state: GameState,
    start: TickStarts = tickStarts(state, 0)
): Outcome | null {
    if (cleared(state)) return "won"
    state.players.forEach((player, i) => {
        if (player.out || player.invulnerableFor > 0) return
        const hit = touchedBy(state, start, i)
        if (hit) hurtPlayer(state, player, hit.damage, hit.from)
    })
    // Checked again: a knockback may have eaten the last dot, which wins
    // on this tick like any other last dot (the hits stand).
    if (cleared(state)) return "won"
    return lost(state) ? "dead" : null
}

// Whether the stage is cleared (KDA-267): on a boss level once the boss is
// defeated, whatever dots are left (dots there are the breaths' energy, not
// the goal); on any other level once every dot is eaten.
export function cleared(state: GameState): boolean {
    const { boss } = state
    return boss ? boss.defeated : !hasDots(state.cells)
}

// Whether the game is lost, by its mode: in solo once the player's health
// is gone (see knockOut), in co-op once no player is in play (each one
// knocked out is out for good).
function lost(state: GameState): boolean {
    switch (state.mode) {
        case "solo":
            return state.players.some((p) => p.health <= 0)
        case "coop":
            return state.players.every((p) => p.out)
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
