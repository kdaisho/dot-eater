import { addStatus, hasStatus, inPlay, type EnemyStatus } from "./breath"
import type { Character } from "./character"
import { Cell, PUNCH_ACROSS, PUNCH_REACH } from "./constants"
import { emit } from "./events"
import { drawnPos, knockBack, type GameState, type Player } from "./game"
import { wrapDelta } from "./glide"
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
// - An enemy hit is knocked back a cell along the facing from where it is
//   drawn (see knockEnemy): it doesn't move into a wall, glides there with
//   no jump, slides on if it lands on ice and never catches on the punch's
//   tick. It is never defeated (a Splitter doesn't split), and a held one
//   (e.g. frozen) is hit but not moved. Harmless ones are knocked too.
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
// can't. Reports a punched event, then a punchHit per hit (enemies nearest
// first, then the boss, then the other player). Returns what it moved.
export function punch(state: GameState, who: Player): Punched {
    const result: Punched = { enemies: false, players: [] }
    if (who.out || stunned(who)) return result
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
        emit(state, { type: "punchHit", player, at, target: "enemy", enemy: i })
        if (hasStatus(enemy, "holds")) continue
        if (knockEnemy(state, enemy, step)) result.enemies = true
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

// What a knocked-back enemy wears for the rest of the punch's tick (it is
// gone at the next tick's start; see tickEffects in breath.ts): harmless,
// so the knock never catches anyone on the punch's tick. No look.
export const KNOCKED: EnemyStatus = { name: "punch.knocked", harmless: true }

// Knock `enemy` back a cell along the unit `step`, from where it is drawn:
// to the cell one on from the cell it is drawn nearest (its pos, or the
// cell it is leaving while less than halfway out of it), unless that is a
// wall. Returns whether it moved.
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
function knockEnemy(state: GameState, enemy: Character, step: Vec2): boolean {
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
    enemy.lastPos = vec2(base.x, base.y)
    enemy.pos = target
    enemy.moveProgress = along
    addStatus(enemy, KNOCKED, 0)
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
