import type { Random } from "./ai"
import { addStatus, hasStatus, inPlay, type EnemyStatus } from "./breath"
import type { Character } from "./character"
import { Cell, PUNCH_ACROSS, PUNCH_REACH } from "./constants"
import { emit } from "./events"
import { drawnPos, knockBack, type GameState, type Player } from "./game"
import { wrapDelta } from "./glide"
import { blockChance } from "./guard"
import { loopPos } from "./level"
import { vec2, type Vec2 } from "./vec2"
import { stunned } from "./versus"

// The punch (KDA-258): every character's quick jab, a shove rather than a
// kill. It costs nothing and has no cooldown, so every press punches (one
// per tick at most, as MoveInput.punch is a press), and it never stops or
// slows the player's movement. Pure game logic, no DOM.
//
// It reaches along the player's facing (Breather.facing), from where the
// player is drawn (drawnPos, no frame alpha, like collisions): whatever is
// drawn more than 0 and up to PUNCH_REACH ahead and within PUNCH_ACROSS to
// either side is hit, wrap-aware. Every enemy in reach is hit, not only the
// nearest: enemies overlap, and a jab that left one of two stacked enemies
// standing wouldn't clear the way.
//
// - An enemy hit is knocked back along the facing from where it is drawn
//   (see knockEnemy): it doesn't move into a wall, glides there with no
//   jump, slides on if it lands on ice and never catches on the punch's
//   tick. It is never defeated (a Splitter doesn't split), and a held one
//   (e.g. frozen) is hit but not moved. Harmless ones are knocked too.
// - The knock decays (KDA-288): each landed punch knocks an enemy back
//   less than the last, by KNOCK_STEPS, until it has had a lull (see
//   knockLevel). Then it comes straight back at the player: a full knock
//   lets it turn back on its next move (Character.turnsBack), and a short
//   one glides it out and back into the cell it was knocked from.
// - An enemy with a guard skill may block the punch (see guard.ts): it
//   isn't moved and the punch doesn't count towards its decay. A held one
//   never blocks.
// - The boss is hit on any part of its body (the square of its four cell
//   centres) but isn't hurt or moved: the hit is reported, for its thud.
// - The other player is never hit in co-op: the punch passes through.
// - In versus, the other player in play is knocked back a cell along the
//   facing (knockBack in game.ts: it stays put against anything that
//   blocks its move), but not stunned or hurt. A stunned or immune player
//   is shoved all the same.

// Tolerance for the reach's edges, as in game.ts.
const EPSILON = 1e-9

// What a punch moved, so the caller traces it from where it now is.
export type Punched = {
    // Whether it knocked any enemy back.
    enemies: boolean
    // The players it knocked back (versus), by index.
    players: number[]
}

// Punch as `who`, if it can: a player out of play or stunned (versus)
// can't. Reports a punched event, then a punchHit per hit, or a
// punchBlocked for an enemy that blocked it (enemies nearest first, then
// the boss, then the other player). Returns what it moved. `random` decides
// the blocks, one draw for each enemy in reach with a guard skill; left
// out, nothing blocks.
export function punch(
    state: GameState,
    who: Player,
    random: Random = NEVER
): Punched {
    const result: Punched = { enemies: false, players: [] }
    if (who.out || stunned(who)) return result
    // The time since this player's previous punch, for the guard.
    const interval = who.sincePunch
    who.sincePunch = 0
    const cols = state.cells[0].length
    const rows = state.cells.length
    const player = state.players.indexOf(who)
    const { facing } = who.breather
    const step = vec2(facing.x, facing.y)
    const from = drawnPos(who.character, cols, rows)
    emit(state, { type: "punched", player, at: from, facing: step })
    // A drawn position relative to the puncher, the short way round.
    const offset = (at: Vec2) =>
        vec2(wrapDelta(at.x - from.x, cols), wrapDelta(at.y - from.y, rows))
    const hits = state.enemies
        .flatMap((enemy, i) => {
            if (!inPlay(enemy)) return []
            const at = drawnPos(enemy, cols, rows)
            const ahead = punchOffset(offset(at), step)
            return inReach(ahead) ? [{ enemy, i, at, along: ahead.along }] : []
        })
        .sort((a, b) => a.along - b.along)
    for (const { enemy, i, at } of hits) {
        const held = hasStatus(enemy, "holds")
        const skill = enemy.guard ?? 0
        if (!held && skill > 0 && random() < blockChance(skill, interval)) {
            emit(state, { type: "punchBlocked", player, at, enemy: i })
            continue
        }
        emit(state, { type: "punchHit", player, at, target: "enemy", enemy: i })
        if (held) continue
        if (knockEnemy(state, enemy, step, landKnock(enemy))) {
            result.enemies = true
        }
    }
    const boss = bossHitAt(state, from, step)
    if (boss) {
        emit(state, { type: "punchHit", player, at: boss, target: "boss" })
    }
    if (state.mode !== "versus") return result
    state.players.forEach((other, i) => {
        if (other === who || other.out) return
        const at = drawnPos(other.character, cols, rows)
        if (!inReach(punchOffset(offset(at), step))) return
        emit(state, { type: "punchHit", player, at, target: "player" })
        if (knockBack(state, other, step)) result.players.push(i)
    })
    return result
}

// A random source that never blocks (every chance is below 1).
const NEVER: Random = () => 1

// How far each landed punch in a row knocks an enemy back, in cells: the
// first a full cell, then less each time, then none (KDA-288, with the user;
// placeholders to tune at preview). After a lull of KNOCK_LULL seconds with
// no landed punch it recovers a step, and another every KNOCK_RECOVER
// seconds after that, back to a full cell.
export const KNOCK_STEPS: readonly number[] = [1, 0.7, 0.5, 0.3, 0]
export const KNOCK_LULL = 2
export const KNOCK_RECOVER = 0.5

// Tolerance for the decay's timing.
const TIME_EPSILON = 1e-9

// Which of KNOCK_STEPS the next landed punch on `enemy` knocks it back by:
// its knocks, less the steps it has recovered since the latest (see
// KNOCK_LULL).
export function knockLevel(enemy: Character): number {
    const { knocks, sinceKnock } = enemy
    if (knocks === 0 || sinceKnock < KNOCK_LULL - TIME_EPSILON) return knocks
    const back =
        Math.floor((sinceKnock - KNOCK_LULL) / KNOCK_RECOVER + TIME_EPSILON) + 1
    return Math.max(0, knocks - back)
}

// A punch has landed on `enemy` (not blocked, not held): how far it knocks
// it back, in cells (see knockLevel), counting it towards the decay.
function landKnock(enemy: Character): number {
    const level = knockLevel(enemy)
    enemy.knocks = Math.min(level + 1, KNOCK_STEPS.length - 1)
    enemy.sinceKnock = 0
    return KNOCK_STEPS[level]
}

// Move every player's and enemy's punch timers on by `dt` seconds, at the
// start of a tick (see step in game.ts): the time since each player's
// latest punch (for the guard) and since each enemy in play last had a
// punch land (for the decay).
export function tickPunches(state: GameState, dt: number) {
    for (const player of state.players) player.sincePunch += dt
    for (const enemy of state.enemies) {
        if (inPlay(enemy)) enemy.sinceKnock += dt
    }
}

// What a knocked-back enemy wears for the rest of the punch's tick (it is
// gone at the next tick's start; see tickEffects in breath.ts): harmless,
// so the knock never catches anyone on the punch's tick. No look.
export const KNOCKED: EnemyStatus = { name: "punch.knocked", harmless: true }

// Knock `enemy` back `distance` cells (at most 1) along the unit `step`,
// from where it is drawn: towards the cell one on from the cell it is
// drawn nearest (its pos, or the cell it is leaving while less than halfway
// out of it), unless that is a wall. Returns whether it moved.
//
// A full knock (1) takes it to that cell. It may then turn back into the
// cell it was knocked from on its next move (turnsBack), so it comes
// straight back at the player instead of going on away. A short one stops
// `distance` past the nearest cell: it glides out as a full knock would,
// but turns round at that point (knockTurn, see turnKnock) and glides back
// into the nearest cell, which it then moves on from as usual. One drawn
// that far out already, or a knock of 0, doesn't move it.
//
// It glides there from exactly where it is drawn, with no jump, as if it
// were that far into a move from the nearest cell: its move progress is
// how far ahead of that cell it is drawn, along `step`. Drawn short of the
// nearest cell (gliding in towards the puncher, or away from it but past
// halfway), that is below 0, down to -0.5, and the glide in is up to 1.5
// cells long. So it carries on the way it was going, turns round, or is
// stopped short, but always ends a cell past its nearest cell. An enemy
// gliding across the punch (from a cell beside the punch's line, or
// towards one) can't glide on a slant: it is snapped across onto its
// nearest cell (at most half a cell), and knocked from there.
//
// Like the breaths' push, it goes through tunnels, lands on a cell that
// blocks enemies (and leaves by the shortest way), and slides on if it
// lands on ice (its latest move was the knock). Unlike the push, it can't
// jump onto anyone. It is harmless for the rest of the tick (KNOCKED).
function knockEnemy(
    state: GameState,
    enemy: Character,
    step: Vec2,
    distance: number
): boolean {
    if (distance <= 0) return false
    const cols = state.cells[0].length
    const rows = state.cells.length
    const drawn = drawnPos(enemy, cols, rows)
    const base = enemy.moveProgress < 0.5 ? enemy.lastPos : enemy.pos
    const target = loopPos(state.cells, vec2(base.x + step.x, base.y + step.y))
    if (state.cells[target.y][target.x] === Cell.wall) return false
    const { along } = punchOffset(
        vec2(
            wrapDelta(drawn.x - base.x, cols),
            wrapDelta(drawn.y - base.y, rows)
        ),
        step
    )
    const full = distance >= 1
    if (!full && along >= distance - EPSILON) return false
    enemy.lastPos = vec2(base.x, base.y)
    enemy.pos = target
    enemy.moveProgress = along
    enemy.knockTurn = full ? null : distance
    enemy.turnsBack = full
    addStatus(enemy, KNOCKED, 0)
    return true
}

// Once a short knock (see knockEnemy) has glided `enemy` out to its
// knockTurn, turn it round: it glides back from there into the cell it was
// knocked from, as if it were that far into a move from the cell it was
// knocked towards, with any progress past the turn carried on. Called after
// its progress moves on (see step and settle in game.ts). Returns whether
// it turned.
export function turnKnock(enemy: Character): boolean {
    const turn = enemy.knockTurn
    if (turn === null || enemy.moveProgress < turn - EPSILON) return false
    const past = Math.max(0, enemy.moveProgress - turn)
    const from = enemy.pos
    enemy.pos = enemy.lastPos
    enemy.lastPos = from
    enemy.moveProgress = 1 - turn + past
    enemy.knockTurn = null
    return true
}

// An offset from the puncher split along its facing (`along`, positive
// ahead) and across it (`across`, either side).
export function punchOffset(
    offset: Vec2,
    facing: Vec2
): { along: number; across: number } {
    return {
        along: offset.x * facing.x + offset.y * facing.y,
        across: offset.x * facing.y - offset.y * facing.x,
    }
}

// Whether something drawn at `ahead` (see punchOffset) is in the punch's
// reach: ahead of the puncher by up to PUNCH_REACH, and no more than
// PUNCH_ACROSS to either side.
export function inReach({ along, across }: { along: number; across: number }) {
    return (
        along > EPSILON &&
        along <= PUNCH_REACH + EPSILON &&
        Math.abs(across) <= PUNCH_ACROSS + EPSILON
    )
}

// Where a punch from `from` along `step` meets the boss, or null if it
// misses (or there is no boss in play). The boss's body is the square of
// its four cell centres, as for its catches (see squareDistance in
// boss.ts): it is hit if any of it is in reach, and the hit is on the
// point of it nearest the puncher.
function bossHitAt(state: GameState, from: Vec2, step: Vec2): Vec2 | null {
    const { boss } = state
    if (!boss || boss.defeated) return null
    const cols = state.cells[0].length
    const rows = state.cells.length
    const corner = drawnPos(boss, cols, rows)
    // The square from the puncher, the short way round.
    const x0 = wrapDelta(corner.x - from.x, cols)
    const y0 = wrapDelta(corner.y - from.y, rows)
    // Its extent along and across the facing (which is along an axis).
    const span = (a: number, b: number) => [Math.min(a, b), Math.max(a, b)]
    const [a0, a1] =
        step.x !== 0
            ? span(x0 * step.x, (x0 + 1) * step.x)
            : span(y0 * step.y, (y0 + 1) * step.y)
    const [c0, c1] = step.x !== 0 ? [y0, y0 + 1] : [x0, x0 + 1]
    const reached =
        a1 > EPSILON &&
        a0 <= PUNCH_REACH + EPSILON &&
        c0 <= PUNCH_ACROSS + EPSILON &&
        c1 >= -PUNCH_ACROSS - EPSILON
    if (!reached) return null
    const clamp = (v: number, lo: number) => Math.min(Math.max(v, lo), lo + 1)
    return vec2(from.x + clamp(0, x0), from.y + clamp(0, y0))
}
