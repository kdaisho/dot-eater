import {
    AiType,
    Cell,
    ENEMY_BREATH_DAMAGE,
    ENEMY_BREATH_EVERY,
    ENEMY_BREATH_RANGE,
    ENEMY_BREATH_WIND_UP,
    TICK_RATE,
} from "./constants"
import {
    addTileEffect,
    enemyBlocks,
    hasStatus,
    inPlay,
    playersInPlay,
    type Look,
    type TileEffect,
} from "./breath"
import { struckPlayers } from "./bossBreath"
import type { Character } from "./character"
import { emit } from "./events"
import { cleared, hurtPlayer, type GameState } from "./game"
import { slideStep } from "./ice"
import type { ParticleLook } from "./particles"
import { samePos, vec2, type Vec2 } from "./vec2"

// The breather's breath (KDA-291): an enemy that breathes at the players
// from a few cells off, like a small boss breath (see bossBreath.ts), one
// per breather. Pure, no DOM: time is counted in ticks (step calls
// tickEnemyBreaths once a tick).
//
// - Cadence: it may breathe once its cooldown (`every`) is over. The
//   cooldown starts full each time it comes into play (at the start of a
//   stage, and back after a defeat), so the players get a grace period.
//   Then, as soon as a player in play is in line with it (see
//   enemyBreathTarget) and it is at rest on its cell, it winds up, facing
//   the nearest such player (player 1 on ties). Not at rest yet (gliding
//   in), it stops once it gets there (see EnemyBreath.move), to wind up on
//   the next tick.
// - Wind-up (ENEMY_BREATH_WIND_UP): it holds still, glows (enemyBreathLooks)
//   and the cells it will hit are tinted (enemyWarnings). Then it breathes
//   along its facing, whoever is in line by then: a player can step out of
//   the way, or punch it.
// - Called off: a punch that lands on it while it winds up calls the
//   breath off and starts its cooldown (a blocked one doesn't). So does
//   anything that holds it (a freeze) or moves it off its cell (a knock, a
//   push, a cloud it has to leave), nobody being in play, a defeat, or
//   another breather on its cell, though those leave its cooldown as it
//   was (ready).
// - The breath: one cell wide, out to ENEMY_BREATH_RANGE cells from its own,
//   stopped by the first wall or Boar-opened wall (see enemyBreathCells),
//   or the map's edge (no wrapping through tunnels). It is shown for
//   ENEMY_BREATH.shown seconds as a look-only tile effect on its cells,
//   plus particles (eventEffects.ts).
// - Hit: every player in play on one of its cells, or drawn within
//   CATCH_DISTANCE of one (see struckPlayers in bossBreath.ts), is hurt
//   through hurtPlayer for ENEMY_BREATH_DAMAGE, knocked away from the
//   breather, with the usual invulnerability. In versus either player can
//   be hit, as by any enemy (not a stun). Enemies and the boss never are.
//   No breath on a tick the stage is already cleared (but in versus), as a
//   touch on that tick costs nothing either.
// - Between breaths it keeps its distance (see breatherStep in ai.ts).
//
// Its state lives on the breather (Character.breath, see createEnemyBreath).

// A breather's breath as it is now (Character.breath). Times are in ticks
// (TICK_RATE a second).
export type EnemyBreath = {
    // Ticks until it may wind up again: 0 once ready.
    cooldown: number
    // Ticks left of its wind-up, 0 when it isn't winding up.
    windingUp: number
    // The unit step it faces: towards the player it targeted on its latest
    // wind-up (down until then).
    facing: Vec2
    // How it moves this tick, set by tickEnemyBreaths before the enemies
    // move (see breatherStep in ai.ts): "hold" stays put (winding up, or
    // ready with a player in line), "keep" keeps its distance (cooling
    // down), "chase" chases (ready, or with nobody in play), "part" steps
    // off a cell it shares with another breather.
    move: "chase" | "keep" | "hold" | "part"
}

// How the breather's breath looks, as data (see Look and ParticleLook), so
// render.ts and eventEffects.ts draw it the way they draw the boss's.
// Softer than the boss's: violet, not orange, and fewer particles.
export const ENEMY_BREATH: {
    // Seconds the breath stays on the cells it struck (its `blast` tile).
    shown: number
    // The colour of the warning tint on the cells it will hit while it winds
    // up, drawn like a player's aim preview (see render.ts).
    warning: string
    // The glow on it while it winds up, as an "r, g, b" colour that grows
    // from glowFrom to glowTo opacity (see enemyBreathLooks).
    glow: string
    glowFrom: number
    glowTo: number
    // A look-only tile effect on each struck cell, for `shown` seconds.
    blast: TileEffect
    // A burst on each struck cell, flying along its facing.
    particles: ParticleLook
} = {
    shown: 0.3,
    warning: "#9333ea",
    glow: "168, 85, 247",
    glowFrom: 0.15,
    glowTo: 0.55,
    blast: {
        name: "breather.breath",
        look: { color: "rgba(168, 85, 247, 0.45)" },
    },
    particles: {
        colors: ["#a855f7", "#c084fc", "#e9d5ff", "#6b21a8"],
        count: 3,
        life: 0.35,
        speed: 2.5,
        spread: 0.8,
        size: 0.11,
        jitter: 0.25,
        drag: 2,
    },
}

const ticksOf = (seconds: number) =>
    Math.max(1, Math.round(seconds * TICK_RATE))

// Ticks between breaths and of a wind-up.
export const ENEMY_BREATH_EVERY_TICKS = ticksOf(ENEMY_BREATH_EVERY)
export const ENEMY_BREATH_WIND_UP_TICKS = ticksOf(ENEMY_BREATH_WIND_UP)

// A breather's breath as it comes into play: ready after a whole cooldown.
export function createEnemyBreath(): EnemyBreath {
    return {
        cooldown: ENEMY_BREATH_EVERY_TICKS,
        windingUp: 0,
        facing: vec2(0, 1),
        move: "chase",
    }
}

// Whether `enemy` is a breather winding up its breath (and so holds still).
export function breatherWindingUp(enemy: Character): boolean {
    return inPlay(enemy) && (enemy.breath?.windingUp ?? 0) > 0
}

// Tolerance for move progress reaching 1, as in game.ts.
const EPSILON = 1e-9

// Whether `enemy` is at rest on its cell: its glide done, waiting to move.
// Only then does it wind up, so its breath starts from where it is drawn.
function atRest(enemy: Character): boolean {
    return enemy.moveProgress >= 1 - EPSILON
}

// ---- Where it reaches ----

// Whether the breath stops at `cell`: off the map, a wall or a wall a
// breath has opened (a breather treats one as the wall it will be again,
// as the boss does).
function stops(state: GameState, cell: Vec2): boolean {
    const { cells } = state
    if (cell.y < 0 || cell.x < 0) return true
    if (cell.y >= cells.length || cell.x >= cells[0].length) return true
    if (cells[cell.y][cell.x] === Cell.wall) return true
    return state.tiles.some((t) => t.effect.opensWall && samePos(t.pos, cell))
}

// The cells the breath of a breather on `pos` strikes along `facing`: from
// the cell next to it out to ENEMY_BREATH_RANGE cells, up to the first wall
// or Boar-opened wall. Nearest first. Tile effects that block enemies don't
// stop it (they only hide a player from it; see enemyInLine).
export function enemyBreathCells(
    state: GameState,
    pos: Vec2,
    facing: Vec2
): Vec2[] {
    const cells: Vec2[] = []
    for (let k = 1; k <= ENEMY_BREATH_RANGE; k++) {
        const cell = vec2(pos.x + facing.x * k, pos.y + facing.y * k)
        if (stops(state, cell)) break
        cells.push(cell)
    }
    return cells
}

// Whether `cell` (a player's) is in line with a breather on `pos`: in its
// row or column, within ENEMY_BREATH_RANGE cells, with nothing between
// them but floor. Walls, Boar-opened walls and tiles that block enemies
// (e.g. the Dragon's fire) all block the line; the cell itself must be one
// the breath reaches (not inside an opened wall), though a tile that blocks
// enemies there doesn't hide it. Returns the way to it and its distance,
// or null (also for its own cell).
export function enemyInLine(
    state: GameState,
    pos: Vec2,
    cell: Vec2
): { facing: Vec2; distance: number } | null {
    const dx = cell.x - pos.x
    const dy = cell.y - pos.y
    if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return null
    const distance = Math.abs(dx + dy)
    if (distance > ENEMY_BREATH_RANGE) return null
    const facing = vec2(Math.sign(dx), Math.sign(dy))
    const blocked = enemyBlocks(state)
    for (let k = 1; k <= distance; k++) {
        const c = vec2(pos.x + facing.x * k, pos.y + facing.y * k)
        if (stops(state, c)) return null
        if (k < distance && blocked?.[c.y][c.x]) return null
    }
    return { facing, distance }
}

// The player `enemy` would breathe at now: the nearest player in play in
// line with it (see enemyInLine), player 1 on ties, with the way to it.
// Null when there is none.
export function enemyBreathTarget(
    state: GameState,
    enemy: Character
): { player: number; facing: Vec2 } | null {
    let best: { player: number; facing: Vec2 } | null = null
    let nearest = Infinity
    for (const [player, p] of state.players.entries()) {
        if (p.out) continue
        const line = enemyInLine(state, enemy.pos, p.character.pos)
        if (line && line.distance < nearest) {
            best = { player, facing: line.facing }
            nearest = line.distance
        }
    }
    return best
}

// ---- Each tick ----

// Every breather's breath for one tick of step (see the top of this file),
// after the punches (so a punch that landed this tick calls a wind-up off)
// and before the enemies move (so EnemyBreath.move is set for their AI).
// For each breather: count its cooldown down, start a wind-up when it is
// ready, at rest and a player is in line, or breathe when the wind-up is
// over.
export function tickEnemyBreaths(state: GameState) {
    // A punch that landed on an enemy this tick (not one it blocked).
    const punched = new Set(
        state.events.flatMap((e) =>
            e.type === "punchHit" && e.enemy !== undefined ? [e.enemy] : []
        )
    )
    const nobody = playersInPlay(state).length === 0
    const over = cleared(state) && state.mode !== "versus"
    state.enemies.forEach((enemy, i) => {
        const breath = enemy.breath
        if (!breath) return
        if (!inPlay(enemy)) {
            // Back fresh, with a whole cooldown, like at the stage's start.
            breath.windingUp = 0
            breath.cooldown = ENEMY_BREATH_EVERY_TICKS
            breath.move = "chase"
            return
        }
        const frozen = hasStatus(enemy, "holds")
        // Sharing its cell with a breather in an earlier slot (a knock or a
        // push can put it there), it steps off (see breatherStep in ai.ts)
        // and doesn't wind up meanwhile, so the two don't stand and breathe
        // as one.
        const crowded = state.enemies.some(
            (other, j) =>
                j < i &&
                other.ai === AiType.breather &&
                inPlay(other) &&
                samePos(other.pos, enemy.pos)
        )
        if (breath.windingUp > 0 && punched.has(i)) {
            // Its cooldown starts now, as if it had breathed.
            breath.windingUp = 0
            breath.cooldown = ENEMY_BREATH_EVERY_TICKS
            breath.move = "keep"
            return
        }
        if (nobody || frozen || crowded || !atRest(enemy)) {
            breath.windingUp = 0
        }
        if (breath.windingUp > 0) {
            breath.windingUp--
            breath.move = "hold"
            if (breath.windingUp > 0) return
            if (!over) enemyBreathe(state, enemy, i)
            breath.cooldown = ENEMY_BREATH_EVERY_TICKS
            breath.move = "keep"
            return
        }
        breath.cooldown = Math.max(0, breath.cooldown - 1)
        breath.move = crowded
            ? "part"
            : nobody || breath.cooldown === 0
              ? "chase"
              : "keep"
        if (crowded || nobody || over || frozen || breath.cooldown > 0) return
        const target = enemyBreathTarget(state, enemy)
        if (!target) return
        // In line: it stays where it is (or stops on the cell it glides
        // into) to breathe.
        breath.move = "hold"
        if (!readyToWindUp(state, enemy)) return
        breath.facing = target.facing
        breath.windingUp = ENEMY_BREATH_WIND_UP_TICKS
        emit(state, {
            type: "enemyWindUp",
            enemy: i,
            at: vec2(enemy.pos.x, enemy.pos.y),
            facing: vec2(target.facing.x, target.facing.y),
        })
    })
}

// Whether `enemy` can start a wind-up where it is: at rest on its cell, and
// not about to be carried off it (a slide on ice, or leaving a cell that
// blocks enemies), which would call it off at once.
function readyToWindUp(state: GameState, enemy: Character): boolean {
    if (!atRest(enemy)) return false
    if (enemyBlocks(state)?.[enemy.pos.y][enemy.pos.x]) return false
    return slideStep(state.cells, state.ice, enemy.pos, enemy.lastPos) === null
}

// Breathe along `enemy`'s facing: report it, show it on its cells and hurt
// every player it strikes, player 1 first, knocked away from the breather.
function enemyBreathe(state: GameState, enemy: Character, i: number) {
    const facing = enemy.breath!.facing
    const cells = enemyBreathCells(state, enemy.pos, facing)
    emit(state, {
        type: "enemyBreathed",
        enemy: i,
        at: vec2(enemy.pos.x, enemy.pos.y),
        facing: vec2(facing.x, facing.y),
        cells: cells.map((c) => vec2(c.x, c.y)),
    })
    for (const cell of cells) {
        addTileEffect(state, cell, ENEMY_BREATH.blast, ENEMY_BREATH.shown)
    }
    const from = vec2(enemy.pos.x, enemy.pos.y)
    // All found before anyone is hurt, so one player's knockback doesn't
    // decide whether the other is hit.
    for (const player of struckPlayers(state, cells)) {
        hurtPlayer(state, player, ENEMY_BREATH_DAMAGE, from)
    }
}

// ---- Looks (see render.ts) ----

// The warning tint of every breather winding up: the cells its breath
// would strike now, in ENEMY_BREATH.warning, in slot order.
export function enemyWarnings(
    state: GameState
): { cells: Vec2[]; color: string }[] {
    return state.enemies.flatMap((enemy) => {
        if (!breatherWindingUp(enemy)) return []
        const cells = enemyBreathCells(state, enemy.pos, enemy.breath!.facing)
        return cells.length > 0 ? [{ cells, color: ENEMY_BREATH.warning }] : []
    })
}

// The looks on `enemy` now from its breath (drawn as a disc behind its
// sprite, like a status's colour): while it winds up, its glow, growing
// stronger towards the breath. None otherwise.
export function enemyBreathLooks(enemy: Character): Look[] {
    if (!breatherWindingUp(enemy)) return []
    const progress = 1 - enemy.breath!.windingUp / ENEMY_BREATH_WIND_UP_TICKS
    const { glow, glowFrom, glowTo } = ENEMY_BREATH
    const alpha = glowFrom + (glowTo - glowFrom) * progress
    return [{ color: `rgba(${glow}, ${alpha.toFixed(3)})` }]
}
