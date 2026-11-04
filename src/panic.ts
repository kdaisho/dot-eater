import type { GameState, Player } from "./game"
import { samePos, vec2, type Vec2 } from "./vec2"

// Panic: a player struck by the other player's breath freezes in place for
// PANIC_SECONDS: it can't move or breathe. Pure, no DOM. Dormant for now:
// nothing panics a player yet (KDA-316 has a friendly breath do it in
// co-op, calling playersStruck from breathe in breath.ts), but game.ts
// already counts panics down and keeps a panicked player still.
//
// - A panicked player can't panic again until it is over, so the timer
//   never resets, and once it wears off the player is immune for
//   PANIC_IMMUNITY_SECONDS, so it always gets time to get away.
// - Only the cells a breath covers as it fires count (see playersStruck);
//   lasting tile effects (fire, stink, ice) never panic.

// Seconds a player struck by the other's breath is panicked.
export const PANIC_SECONDS = 2
// Seconds after a panic wears off in which that player can't panic again,
// so a breath fired every time it is free can't keep it frozen. Being
// taken out (knocked out) ends the immunity, as it ends a panic.
export const PANIC_IMMUNITY_SECONDS = 1.5

// Tolerance for timers counting down by dt, as in game.ts.
const EPSILON = 1e-9

// Whether `player` is panicked (see panic).
export function panicked(player: Player): boolean {
    return player.panickedFor > 0
}

// Whether `player` can't panic, just after a panic wore off (see
// PANIC_IMMUNITY_SECONDS).
export function panicImmune(player: Player): boolean {
    return player.panicImmuneFor > 0
}

// Panic `player` for PANIC_SECONDS: until it is over it doesn't move (a
// glide in progress still finishes, and so does a slide on ice) or
// breathe, and its input is ignored. A player already panicked, immune, or
// out of play, is left alone. Anything buffered is dropped.
export function panic(player: Player) {
    if (player.out || panicked(player) || panicImmune(player)) return
    player.panickedFor = PANIC_SECONDS
    player.bufferedStep = vec2(0, 0)
}

// Count every panic, and every immunity, down by `dt` seconds, at the start
// of a tick. A panic that wears off starts PANIC_IMMUNITY_SECONDS of
// immunity, counted from the next tick.
export function tickPanics(players: readonly Player[], dt: number) {
    for (const player of players) {
        if (panicImmune(player)) {
            player.panicImmuneFor -= dt
            if (player.panicImmuneFor <= EPSILON) player.panicImmuneFor = 0
        }
        if (!panicked(player)) continue
        player.panickedFor -= dt
        if (player.panickedFor <= EPSILON) {
            player.panickedFor = 0
            player.panicImmuneFor = PANIC_IMMUNITY_SECONDS
        }
    }
}

// The players a breath by `by` panics when it covers `cells` (the cells it
// strikes, as for enemies; see breathe in breath.ts): every other player in
// play, not already panicked or immune, standing (by its cell, pos) on one
// of them.
export function playersStruck(
    state: GameState,
    by: Player,
    cells: readonly Vec2[]
): Player[] {
    return state.players.filter(
        (p) =>
            p !== by &&
            !p.out &&
            !panicked(p) &&
            !panicImmune(p) &&
            cells.some((c) => samePos(c, p.character.pos))
    )
}
