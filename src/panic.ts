import { emit } from "./events"
import type { GameState, Player } from "./game"
import { samePos, vec2, type Vec2 } from "./vec2"

// Panic (KDA-316): in co-op a breath never hurts the other player, but one
// that strikes it panics it: it freezes in place for PANIC_SECONDS, and
// can't move or breathe. Pure, no DOM. breathe (breath.ts) panics the
// players on the cells it strikes (playersStruck), and the Rush's chain
// (knock.ts) the players it shoves; game.ts counts panics down and keeps a
// panicked player still. An enemy still hurts a panicked player as usual.
//
// - A panicked player can't panic again until it is over, so the timer
//   never resets, and once it wears off the player is immune for
//   PANIC_IMMUNITY_SECONDS, so it always gets time to get away.
// - Only the cells a breath covers as it fires count (see playersStruck);
//   lasting tile effects (fire, stink, ice) never panic.

// Seconds a player struck by the other's breath is panicked.
export const PANIC_SECONDS = 1.5
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
// out of play, is left alone. Anything buffered is dropped. Returns whether
// it panicked.
export function panic(player: Player): boolean {
    if (player.out || panicked(player) || panicImmune(player)) return false
    player.panickedFor = PANIC_SECONDS
    player.bufferedStep = vec2(0, 0)
    return true
}

// Panic each of `players`, struck by `by`'s breath (see panic), reporting
// a playerPanicked event on its cell for each one that panicked.
export function panicPlayers(
    state: GameState,
    by: Player,
    players: readonly Player[]
) {
    for (const player of players) {
        if (!panic(player)) continue
        const { pos } = player.character
        emit(state, {
            type: "playerPanicked",
            player: state.players.indexOf(player),
            by: state.players.indexOf(by),
            at: vec2(pos.x, pos.y),
        })
    }
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
