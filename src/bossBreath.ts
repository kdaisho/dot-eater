import {
    BOSS_BREATH_DAMAGE,
    BOSS_BREATH_EVERY,
    BOSS_BREATH_RANGE,
    BOSS_BREATH_WIND_UP,
    CATCH_DISTANCE,
    Cell,
    TICK_RATE,
} from "./constants"
import type { Boss } from "./boss"
import {
    addTileEffect,
    enemyBlocks,
    playersInPlay,
    type Look,
    type TileEffect,
} from "./breath"
import { emit } from "./events"
import { drawnPos, hurtPlayer, type GameState, type Player } from "./game"
import { wrapDelta } from "./glide"
import type { BossBreathData } from "./level"
import type { ParticleLook } from "./particles"
import { samePos, vec2, type Vec2 } from "./vec2"

// The boss's breath (KDA-268): the boss fights back. Pure, no DOM: time is
// counted in ticks (step calls tickBossBreath once a tick).
//
// - Cadence: it may breathe once its cooldown (`every`) is over, which it
//   also is at the start of a stage, so the players get a grace period.
//   Then, as soon as a player in play is in line with it (see inLine) and
//   it is at rest on its cell (atRest: its glide done, so it breathes from
//   where it is drawn, however short the wind-up), it winds up, facing the
//   nearest such player (player 1 on ties). With nobody in line it doesn't
//   breathe, but stays ready.
// - Wind-up (`windUp`): it holds still (it makes no new move; see step in
//   game.ts, which moves its glide on before this), glows (bossLooks), and the
//   cells it will hit are tinted (bossWarning). Then it breathes along its
//   facing, whoever is in line by then: a player can step out of the way.
// - The breath: two cells wide (the footprint's two rows or columns), out
//   to `range` cells from the footprint's edge, each lane stopped by the
//   first wall or Boar-opened wall in it (see bossBreathCells). It is shown
//   for BOSS_BREATH.shown seconds as a look-only tile effect on its cells,
//   plus particles (eventEffects.ts).
// - Hit: every player in play standing on one of its cells (by cell, as
//   a player breath strikes the other player), or drawn within
//   CATCH_DISTANCE of one, is hurt through hurtPlayer for `damage`, knocked
//   away from the boss, with the usual invulnerability (an invulnerable
//   player isn't hurt). Enemies never are.
// - Then it waits `every` again. It never breathes or winds up while
//   defeated or while nobody is in play (a wind-up under way is called off,
//   and the cooldown keeps counting).
//
// It lives on Boss.breath, in its own fields, with its tuning from the
// level (LevelData.boss.breath; defaults in constants.ts).

// The boss's breath as it is now, one per boss (Boss.breath). Times are in
// ticks (TICK_RATE a second).
export type BossBreath = {
    // Its tuning: ticks between breaths and of a wind-up, its reach in cells
    // and the health it costs a player it hits.
    every: number
    windUp: number
    range: number
    damage: number
    // Ticks until it may wind up again: 0 once ready.
    cooldown: number
    // Ticks left of its wind-up, 0 when it isn't winding up.
    windingUp: number
    // The unit step it faces: towards the player it targeted on its latest
    // wind-up (down until then).
    facing: Vec2
}

// How the boss's breath looks, as data (see Look and ParticleLook), so
// render.ts and eventEffects.ts draw it the way they draw player breaths.
export const BOSS_BREATH: {
    // Seconds the breath stays on the cells it struck (its `blast` tile).
    shown: number
    // The colour of the warning tint on the cells it will hit while it winds
    // up, drawn like a player's aim preview (see render.ts).
    warning: string
    // The glow on the boss while it winds up, as an "r, g, b" colour that
    // grows from glowFrom to glowTo opacity (see bossLooks).
    glow: string
    glowFrom: number
    glowTo: number
    // A look-only tile effect on each struck cell, for `shown` seconds.
    blast: TileEffect
    // A burst on each struck cell, flying along its facing.
    particles: ParticleLook
} = {
    shown: 0.4,
    warning: "#ea580c",
    glow: "234, 88, 12",
    glowFrom: 0.2,
    glowTo: 0.65,
    blast: { name: "boss.breath", look: { color: "rgba(234, 88, 12, 0.55)" } },
    particles: {
        colors: ["#ea580c", "#f97316", "#fbbf24", "#7c2d12"],
        count: 5,
        life: 0.45,
        speed: 3,
        spread: 0.9,
        size: 0.14,
        jitter: 0.3,
        drag: 2,
    },
}

const ticksOf = (seconds: number) =>
    Math.max(1, Math.round(seconds * TICK_RATE))

// A boss's breath with the level's tuning (`data`, seconds and cells; the
// constants for anything it leaves out), ready after its first `every`.
export function createBossBreath(data: BossBreathData = {}): BossBreath {
    const every = ticksOf(data.every ?? BOSS_BREATH_EVERY)
    return {
        every,
        windUp: ticksOf(data.windUp ?? BOSS_BREATH_WIND_UP),
        range: data.range ?? BOSS_BREATH_RANGE,
        damage: data.damage ?? BOSS_BREATH_DAMAGE,
        cooldown: every,
        windingUp: 0,
        facing: vec2(0, 1),
    }
}

// Whether `boss` is winding up its breath (and so holds still).
export function windingUp(boss: Boss): boolean {
    return !boss.defeated && boss.breath.windingUp > 0
}

// Whether `boss` is at rest on its cell: drawn right on its pos, with its
// glide done (or none to do, as at its spawn). Only then does it wind up,
// so its breath starts from where it is drawn.
export function atRest(boss: Boss): boolean {
    return boss.moveProgress >= 1 - 1e-9 || samePos(boss.lastPos, boss.pos)
}

// ---- Where it reaches ----

// Whether the breath stops at `cell`: off the map, a wall or a wall a
// breath has opened (the boss treats one as the wall it will be again).
function stops(state: GameState, cell: Vec2): boolean {
    const { cells } = state
    if (cell.y < 0 || cell.x < 0) return true
    if (cell.y >= cells.length || cell.x >= cells[0].length) return true
    if (cells[cell.y][cell.x] === Cell.wall) return true
    return state.tiles.some((t) => t.effect.opensWall && samePos(t.pos, cell))
}

// The two cells next to the footprint at `pos` along `facing`, one per
// lane (its two rows facing left or right, its two columns facing up or
// down), in reading order.
function laneStarts(pos: Vec2, facing: Vec2): Vec2[] {
    const ahead = (d: number) => (d > 0 ? 2 : d < 0 ? -1 : 0)
    if (facing.x !== 0) {
        const x = pos.x + ahead(facing.x)
        return [vec2(x, pos.y), vec2(x, pos.y + 1)]
    }
    const y = pos.y + ahead(facing.y)
    return [vec2(pos.x, y), vec2(pos.x + 1, y)]
}

// The cells the breath of a boss with its footprint at `pos` strikes along
// `facing`, out to `range` cells: each lane from the cell next to the
// footprint up to the first wall or Boar-opened wall in it. Nearest first,
// the lanes in reading order at each distance. Tile effects that block
// enemies don't stop it (they only hide a player from it; see inLine).
export function bossBreathCells(
    state: GameState,
    pos: Vec2,
    facing: Vec2,
    range: number
): Vec2[] {
    const starts = laneStarts(pos, facing)
    const open = starts.map(() => true)
    const cells: Vec2[] = []
    for (let k = 0; k < range; k++) {
        starts.forEach((start, lane) => {
            if (!open[lane]) return
            const cell = vec2(start.x + facing.x * k, start.y + facing.y * k)
            if (stops(state, cell)) open[lane] = false
            else cells.push(cell)
        })
    }
    return cells
}

// How `cell` lies from the footprint at `pos` when it shares a row or a
// column with it: the way from the footprint to it, and how far it is from
// the footprint's edge (1 next to it). Null otherwise, or on the footprint.
function lineTo(
    pos: Vec2,
    cell: Vec2
): { facing: Vec2; distance: number } | null {
    const inRows = cell.y === pos.y || cell.y === pos.y + 1
    const inColumns = cell.x === pos.x || cell.x === pos.x + 1
    if (inRows && cell.x > pos.x + 1) {
        return { facing: vec2(1, 0), distance: cell.x - pos.x - 1 }
    }
    if (inRows && cell.x < pos.x) {
        return { facing: vec2(-1, 0), distance: pos.x - cell.x }
    }
    if (inColumns && cell.y > pos.y + 1) {
        return { facing: vec2(0, 1), distance: cell.y - pos.y - 1 }
    }
    if (inColumns && cell.y < pos.y) {
        return { facing: vec2(0, -1), distance: pos.y - cell.y }
    }
    return null
}

// Whether `cell` (a player's) is in line with `boss`: it shares a row or a
// column with its footprint, within its breath's range of the footprint's
// edge, with nothing between them but floor. Walls, Boar-opened walls and
// tiles that block enemies (e.g. the Dragon's fire) all block the line; the
// cell itself must be one the breath reaches (not inside an opened wall),
// though a tile that blocks enemies there doesn't hide it. Returns the way
// to it and its distance, or null.
export function inLine(
    state: GameState,
    boss: Boss,
    cell: Vec2
): { facing: Vec2; distance: number } | null {
    const line = lineTo(boss.pos, cell)
    if (!line || line.distance > boss.breath.range) return null
    const blocked = enemyBlocks(state)
    const { facing, distance } = line
    // From the cell back towards the footprint: the cell, then those
    // between.
    for (let back = 0; back < distance; back++) {
        const c = vec2(cell.x - facing.x * back, cell.y - facing.y * back)
        if (stops(state, c)) return null
        if (back > 0 && blocked?.[c.y][c.x]) return null
    }
    return line
}

// The player the boss would breathe at now: the nearest player in play in
// line with it (see inLine), player 1 on ties, with the way to it. Null
// when there is none, or no boss in play.
export function bossBreathTarget(
    state: GameState
): { player: number; facing: Vec2 } | null {
    const { boss } = state
    if (!boss || boss.defeated) return null
    let best: { player: number; facing: Vec2 } | null = null
    let nearest = Infinity
    for (const [player, p] of state.players.entries()) {
        if (p.out) continue
        const line = inLine(state, boss, p.character.pos)
        if (line && line.distance < nearest) {
            best = { player, facing: line.facing }
            nearest = line.distance
        }
    }
    return best
}

// ---- Each tick ----

// The boss's breath for one tick of step (see the top of this file):
// count the cooldown down, start a wind-up when it is ready, at rest (see
// atRest) and a player is in line, or breathe when the wind-up is over.
// Returns whether the boss holds still this tick (it is winding up). Step
// calls it after moving the boss's glide on, before its next move. No
// boss, no breath.
export function tickBossBreath(state: GameState): boolean {
    const { boss } = state
    if (!boss) return false
    const breath = boss.breath
    if (boss.defeated) {
        breath.windingUp = 0
        return false
    }
    if (playersInPlay(state).length === 0) {
        // Called off: it stays ready for when someone is back.
        breath.windingUp = 0
        breath.cooldown = Math.max(0, breath.cooldown - 1)
        return false
    }
    if (breath.windingUp > 0) {
        breath.windingUp--
        if (breath.windingUp > 0) return true
        bossBreathe(state, boss)
        breath.cooldown = breath.every
        return false
    }
    breath.cooldown = Math.max(0, breath.cooldown - 1)
    if (breath.cooldown > 0 || !atRest(boss)) return false
    const target = bossBreathTarget(state)
    if (!target) return false
    breath.facing = target.facing
    breath.windingUp = breath.windUp
    emit(state, {
        type: "bossWindUp",
        at: vec2(boss.pos.x, boss.pos.y),
        facing: vec2(target.facing.x, target.facing.y),
    })
    return true
}

// Breathe along the boss's facing: report it, show it on its cells and hurt
// every player it strikes (see struckPlayers), player 1 first, knocked away
// from the footprint's centre.
function bossBreathe(state: GameState, boss: Boss) {
    const { facing, range, damage } = boss.breath
    const cells = bossBreathCells(state, boss.pos, facing, range)
    emit(state, {
        type: "bossBreathed",
        at: vec2(boss.pos.x, boss.pos.y),
        facing: vec2(facing.x, facing.y),
        cells: cells.map((c) => vec2(c.x, c.y)),
    })
    for (const cell of cells) {
        addTileEffect(state, cell, BOSS_BREATH.blast, BOSS_BREATH.shown)
    }
    const from = vec2(boss.pos.x + 0.5, boss.pos.y + 0.5)
    // All found before anyone is hurt, so one player's knockback doesn't
    // decide whether the other is hit.
    for (const player of struckPlayers(state, cells)) {
        hurtPlayer(state, player, damage, from)
    }
}

// The players in play the breath strikes on `cells`: standing on one of
// them (their cell, pos), or drawn within CATCH_DISTANCE of one's centre
// (e.g. gliding out of the lane), player 1 first.
export function struckPlayers(
    state: GameState,
    cells: readonly Vec2[]
): Player[] {
    const cols = state.cells[0].length
    const rows = state.cells.length
    return playersInPlay(state).filter(({ character }) => {
        if (cells.some((c) => samePos(c, character.pos))) return true
        const at = drawnPos(character, cols, rows)
        return cells.some(
            (c) =>
                Math.hypot(
                    wrapDelta(at.x - c.x, cols),
                    wrapDelta(at.y - c.y, rows)
                ) <=
                CATCH_DISTANCE + 1e-9
        )
    })
}

// ---- Looks (see render.ts) ----

// The warning tint while the boss winds up: the cells its breath would
// strike now, in BOSS_BREATH.warning. Null when it isn't winding up.
export function bossWarning(
    state: GameState
): { cells: Vec2[]; color: string } | null {
    const { boss } = state
    if (!boss || !windingUp(boss)) return null
    const { facing, range } = boss.breath
    const cells = bossBreathCells(state, boss.pos, facing, range)
    return { cells, color: BOSS_BREATH.warning }
}

// The looks on the boss now (drawn as a disc behind its sprite, like an
// enemy status's colour): while it winds up, its glow, growing stronger
// towards the breath. None otherwise.
export function bossLooks(state: GameState): Look[] {
    const { boss } = state
    if (!boss || !windingUp(boss)) return []
    const { windUp, windingUp: left } = boss.breath
    const progress = 1 - left / windUp
    const { glow, glowFrom, glowTo } = BOSS_BREATH
    const alpha = glowFrom + (glowTo - glowFrom) * progress
    return [{ color: `rgba(${glow}, ${alpha.toFixed(3)})` }]
}
