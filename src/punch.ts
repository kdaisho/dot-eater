import { hasStatus, inPlay, playerCharacters, pushEnemy } from "./breath"
import { PUNCH_ACROSS, PUNCH_KNOCKBACK, PUNCH_REACH } from "./constants"
import { emit } from "./events"
import { drawnPos, type GameState, type Player } from "./game"
import { wrapDelta } from "./glide"
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
// - An enemy hit is knocked back PUNCH_KNOCKBACK cells along the facing
//   by the breaths' push (pushEnemy in breath.ts): it stops before walls,
//   glides in, slides on if it lands on ice and never catches on its own
//   tick. It is never defeated (a Splitter doesn't split), and a held one
//   (e.g. frozen) is hit but not moved. Harmless ones are pushed too.
// - The boss is hit on any part of its body (the square of its four cell
//   centres) but isn't hurt or moved: the hit is reported, for its thud.
// - The other player is never hit in co-op: the punch passes through.

// Tolerance for the reach's edges, as in game.ts.
const EPSILON = 1e-9

// Punch as `who`, if it can: a player out of play or stunned (versus)
// can't. Reports a punched event, then a punchHit per hit (enemies nearest
// first, then the boss). Returns true if the punch moved anything, so the
// caller traces it from where it now is.
export function punch(state: GameState, who: Player): boolean {
    if (who.out || stunned(who)) return false
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
    let moved = false
    for (const { enemy, i, at } of hits) {
        emit(state, { type: "punchHit", player, at, target: "enemy", enemy: i })
        if (hasStatus(enemy, "holds")) continue
        const players = playerCharacters(state)
        if (pushEnemy(state.cells, enemy, step, PUNCH_KNOCKBACK, players)) {
            moved = true
        }
    }
    const boss = bossHitAt(state, from, step)
    if (boss)
        emit(state, { type: "punchHit", player, at: boss, target: "boss" })
    return moved
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
