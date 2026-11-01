import type { Random } from "./ai"
import { inPlay } from "./breath"
import type { Character } from "./character"
import { GUARD_CAP, type GuardOdds } from "./difficulty"
import type { GameState } from "./game"

// The guard (KDA-288, with the user; the numbers are placeholders to tune at
// preview): some enemies block the punch, more often the quicker the
// punches come, so spamming one enemy stops working while spaced punches
// still land. Pure game logic, no DOM; chance comes from the game's injected
// random source, so a seeded game is the same every time.
//
// Each enemy rolls a guard skill as it comes into play (at the start of the
// first tick it is in play, and again after every defeat; a Splitter's
// halves roll their own), by the game's difficulty (GameState.guard, from
// GUARD in difficulty.ts): one draw each, in slot order, after the breath
// timers and before the enemies move. A game with no difficulty
// (createGameState without one, as in most tests) rolls nothing, so it
// draws on `random` exactly as before.
//
// A punch is blocked with a chance of the enemy's skill times guardFactor
// of the time since that player's previous punch (Player.sincePunch), one
// draw for each enemy in reach with a skill (see punch.ts). A held (frozen)
// enemy, the boss and the other player in versus never block.

// Punches this close together (seconds) are blocked at the full skill, and
// those this far apart or more at SLOW_GUARD of it, linearly in between. A
// player's first punch counts as slow.
export const QUICK_PUNCH = 0.2
export const SLOW_PUNCH = 0.6
export const SLOW_GUARD = 0.25

// Tolerance for the interval's edges, as in game.ts.
const EPSILON = 1e-9

// An enemy's guard skill, drawn by `odds`: 0 unless it is a guarder (a
// chance of odds.chance), else even between odds.min and odds.max, capped
// at GUARD_CAP. One draw: the draw under the chance, scaled up, is the
// skill's.
export function rollGuard(odds: GuardOdds, random: Random): number {
    const r = random()
    if (r >= odds.chance) return 0
    const skill = odds.min + (r / odds.chance) * (odds.max - odds.min)
    return Math.min(skill, GUARD_CAP)
}

// Roll the guard of every enemy in play that hasn't one yet (see the top of
// this file), in slot order. Nothing on a game without odds.
export function rollGuards(state: GameState, random: Random) {
    const odds = state.guard
    if (!odds) return
    for (const enemy of state.enemies) {
        if (enemy.guard === null && inPlay(enemy)) {
            enemy.guard = rollGuard(odds, random)
        }
    }
}

// How much of its skill an enemy guards with against a punch `interval`
// seconds after the same player's previous one: all of it up to
// QUICK_PUNCH, SLOW_GUARD of it from SLOW_PUNCH (Infinity, a first punch,
// included), linearly in between.
export function guardFactor(interval: number): number {
    if (interval <= QUICK_PUNCH + EPSILON) return 1
    if (interval >= SLOW_PUNCH - EPSILON) return SLOW_GUARD
    const t = (interval - QUICK_PUNCH) / (SLOW_PUNCH - QUICK_PUNCH)
    return 1 + (SLOW_GUARD - 1) * t
}

// The chance an enemy with guard `skill` blocks a punch `interval` seconds
// after the same player's previous one.
export function blockChance(skill: number, interval: number): number {
    return skill * guardFactor(interval)
}

// The guard stance (KDA-293, with the user; the numbers are placeholders to
// tune at preview): each block puts the enemy in a stance for GUARD_STANCE
// seconds (Character.stance), and a block during one starts it over. It
// holds still: it finishes the glide it is in, with no jump, then makes no
// new move (see step in game.ts) until the stance is over. A punch that
// lands on it ends the stance (and knocks it back as usual), and so does a
// defeat (see freshFromPunches). Counted in game time, at the start of each
// tick with the other timers, so a pause freezes it. Its look is drawn from
// it (see stanceLook in render.ts).
export const GUARD_STANCE = 0.4

// `enemy` has blocked a punch: start its stance, or start it over.
export function startStance(enemy: Character) {
    enemy.stance = GUARD_STANCE
}

// A punch has landed on `enemy`: its stance, if any, is over.
export function endStance(enemy: Character) {
    enemy.stance = 0
}

// Whether `enemy` is in its guard stance.
export function inStance(enemy: Character): boolean {
    return enemy.stance > 0
}

// Count every enemy's stance down by `dt` seconds, at the start of a tick
// (see step in game.ts).
export function tickStances(state: GameState, dt: number) {
    for (const enemy of state.enemies) {
        if (enemy.stance <= 0) continue
        enemy.stance -= dt
        if (enemy.stance <= EPSILON) enemy.stance = 0
    }
}
