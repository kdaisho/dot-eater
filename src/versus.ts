import type { GameState, Player } from "./game"
import { samePos, vec2, type Vec2 } from "./vec2"

// Versus (KDA-222): two players race for the dots on the same map. Pure, no
// DOM: the rules a versus game and match are played by, which game.ts,
// breath.ts and flow.ts call into.
//
// - A breath that covers the other player's cell stuns it for STUN_SECONDS
//   instead of defeating it (see opponentsStruck): it can't move or
//   breathe. A stunned player can't be stunned again until it is over, so
//   the timer never resets, and once it wears off the player is immune for
//   STUN_IMMUNITY_SECONDS, so it always gets time to get away. Lasting tile effects (fire, stink, ice) never
//   stun; only the cells a breath covers as it fires.
// - There are no lives: a catch costs CATCH_DOTS dots (never below 0) and
//   takes the player out for PLAYER_RESPAWN_DELAY seconds (see versusCatch
//   in game.ts). A versus game is never lost.
// - A round ends when the stage is cleared (no dots left and, on a boss
//   stage, the boss defeated). The player with the most dots (Player.dots)
//   wins it; a tie goes to the higher score, and an exact tie is replayed.
//   The first to ROUNDS_TO_WIN round wins takes the match.

// Seconds a player hit by the other's breath is stunned.
export const STUN_SECONDS = 2
// Seconds after a stun wears off in which that player can't be stunned
// again, so a breath fired every time it is free can't keep it stunned.
// Being taken out (caught) ends the immunity, as it ends a stun.
export const STUN_IMMUNITY_SECONDS = 1.5
// Dots a player caught by an enemy or the boss loses.
export const CATCH_DOTS = 5
// Round wins that take a match (best of 3).
export const ROUNDS_TO_WIN = 2

// Tolerance for timers counting down by dt, as in game.ts.
const EPSILON = 1e-9

// Whether `player` is stunned (see stun).
export function stunned(player: Player): boolean {
    return player.stunnedFor > 0
}

// Whether `player` is immune to stuns, just after one wore off (see
// STUN_IMMUNITY_SECONDS).
export function stunImmune(player: Player): boolean {
    return player.stunImmuneFor > 0
}

// Stun `player` for STUN_SECONDS: until it is over it doesn't move (a glide
// in progress still finishes) or breathe, and its input is ignored. A
// player already stunned, immune, or out of play, is left alone. Anything
// buffered is dropped.
export function stun(player: Player) {
    if (player.out || stunned(player) || stunImmune(player)) return
    player.stunnedFor = STUN_SECONDS
    player.bufferedStep = vec2(0, 0)
}

// Count every stun, and every immunity, down by `dt` seconds, at the start
// of a tick. A stun that wears off starts STUN_IMMUNITY_SECONDS of
// immunity, counted from the next tick.
export function tickStuns(players: readonly Player[], dt: number) {
    for (const player of players) {
        if (stunImmune(player)) {
            player.stunImmuneFor -= dt
            if (player.stunImmuneFor <= EPSILON) player.stunImmuneFor = 0
        }
        if (!stunned(player)) continue
        player.stunnedFor -= dt
        if (player.stunnedFor <= EPSILON) {
            player.stunnedFor = 0
            player.stunImmuneFor = STUN_IMMUNITY_SECONDS
        }
    }
}

// The players a breath by `by` stuns when it covers `cells` (the cells it
// strikes, as for enemies; see breathe in breath.ts): in versus only, every
// other player in play, not already stunned or immune, standing (by its cell, pos) on
// one of them. Empty in any other mode.
export function opponentsStruck(
    state: GameState,
    by: Player,
    cells: readonly Vec2[]
): Player[] {
    if (state.mode !== "versus") return []
    return state.players.filter(
        (p) =>
            p !== by &&
            !p.out &&
            !stunned(p) &&
            !stunImmune(p) &&
            cells.some((c) => samePos(c, p.character.pos))
    )
}

// A catch in versus costs CATCH_DOTS of the player's dot count
// (Player.dots, which decides rounds), down to 0.
export function loseDots(player: Player) {
    player.dots = Math.max(0, player.dots - CATCH_DOTS)
}

// How a round of a match went.
export type RoundResult = {
    // The winner's index (player 1 is 0), or null for an exact tie, which
    // is replayed and doesn't count.
    winner: number | null
    // Each player's dot count and score at the end, player 1 first.
    dots: readonly number[]
    scores: readonly number[]
}

// The result of a finished round of `game`.
export function roundResult(game: GameState): RoundResult {
    const dots = game.players.map((p) => p.dots)
    const scores = game.players.map((p) => p.score)
    return { winner: roundWinner(dots, scores), dots, scores }
}

// Who wins a round: the most dots, then the higher score; null if the
// leaders are level on both.
export function roundWinner(
    dots: readonly number[],
    scores: readonly number[]
): number | null {
    const beats = (i: number, j: number) =>
        dots[i] - dots[j] || scores[i] - scores[j]
    let best = 0
    for (let i = 1; i < dots.length; i++) {
        if (beats(i, best) > 0) best = i
    }
    const level = dots.some((_, i) => i !== best && beats(i, best) === 0)
    return level ? null : best
}

// Each player's round wins so far, player 1 first (replayed rounds don't
// count).
export function roundWins(
    rounds: readonly RoundResult[],
    players = 2
): number[] {
    const wins = Array<number>(players).fill(0)
    for (const { winner } of rounds) if (winner !== null) wins[winner]++
    return wins
}

// The match's winner once a player has ROUNDS_TO_WIN round wins, else null.
export function matchWinner(rounds: readonly RoundResult[]): number | null {
    const wins = roundWins(rounds)
    const winner = wins.findIndex((w) => w >= ROUNDS_TO_WIN)
    return winner < 0 ? null : winner
}

// The tally as the HUD shows it during round `rounds.length + 1`, e.g.
// "Round 2 · 1–0".
export function tallyText(rounds: readonly RoundResult[]): string {
    return `Round ${rounds.length + 1} · ${roundWins(rounds).join("–")}`
}
