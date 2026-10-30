import type { GameState } from "./game"
import type { AnimalId } from "./roster"
import type { Vec2 } from "./vec2"

// What happened in a game tick, for the things that react to it without
// being game rules: sound (KDA-212), particles and screen shake (KDA-213).
// Pure data, no DOM.
//
// `step` (game.ts) empties GameState.events at its start and adds one
// event per occurrence as it happens, in the order it happens. Nothing else
// clears it, and `settle` (the outro) adds nothing. Main reads a game's
// events once after each tick with takeEvents, which also empties the list,
// so a tick that doesn't step the game (pause, the outro, menus) reports
// nothing new.
//
// `player` is always a player's index (player 1 is 0). `at` is a cell (the
// top-left one of the boss's 2x2 footprint), for placing effects, except
// for the punch's events, where it is a drawn position.
export type GameEvent =
    // A player ate a dot on `at` (walking or sliding onto it).
    | { type: "dotEaten"; player: number; at: Vec2 }
    // An eaten dot grew back on `at` (KDA-269, see regrow.ts).
    | { type: "dotRegrown"; at: Vec2 }
    // A Splitter slot, enemy `enemy` (its index in GameState.enemies),
    // dropped a dot on `at`, the cell it just left (KDA-270, see dropDot
    // in splitter.ts).
    | { type: "dotDropped"; enemy: number; at: Vec2 }
    // A player breathed: the breath fired (or struck the boss or the other
    // player) and its cost was paid. A refused breath reports nothing.
    // `at` is the player's cell and `facing` the unit step it breathed
    // along. `cells` are the cells the breath covered as it was breathed
    // (its shape against the maze, ending at a boss's body), nearest first;
    // with none in reach, the wall it opened if it opened one, else `at`.
    | {
          type: "breathed"
          player: number
          animal: AnimalId
          at: Vec2
          facing: Vec2
          cells: readonly Vec2[]
      }
    // A player's breath defeated enemy `enemy` (its index in
    // GameState.enemies) on `at`, where it stood. `split` is true when it
    // was a whole Splitter, which splits in two instead of leaving play.
    | {
          type: "enemyDefeated"
          player: number
          enemy: number
          at: Vec2
          split: boolean
      }
    // A player's breath hurt the boss without finishing it; `health` is
    // what it has left.
    | { type: "bossHit"; player: number; at: Vec2; health: number }
    // A player's breath finished the boss. Its killing blow reports this
    // only, not a bossHit as well.
    | { type: "bossDefeated"; player: number; at: Vec2 }
    // The boss (at `at`) started winding up its breath, facing `facing`
    // (a unit step) at the player it targets (see bossBreath.ts).
    | { type: "bossWindUp"; at: Vec2; facing: Vec2 }
    // The boss (at `at`) breathed along `facing`, striking `cells`,
    // nearest first. The players it hurt report their own hurt (or
    // playerCaught) after it.
    | {
          type: "bossBreathed"
          at: Vec2
          facing: Vec2
          cells: readonly Vec2[]
      }
    // A player was hurt (see hurtPlayer in game.ts) on `at` (its cell when
    // hit, before the knockback) and lost `damage` health, with some left.
    // A hit that takes its last health reports a playerCaught instead.
    | { type: "hurt"; player: number; at: Vec2; damage: number }
    // A player was knocked out on `at` (its cell): a hit took its last
    // health. `outForGood` is true when the player won't be back: in solo
    // (the game is lost) and co-op; a versus player comes back later.
    | { type: "playerCaught"; player: number; at: Vec2; outForGood: boolean }
    // A player is back in play on its spawn, `at`, when its wait after a
    // versus knockout is over.
    | { type: "playerRespawned"; player: number; at: Vec2 }
    // Versus: player `by`'s breath stunned `player`, on `at` (its cell).
    | { type: "playerStunned"; player: number; by: number; at: Vec2 }
    // A player punched (see punch.ts), whether it hit anything or not. `at`
    // is where the player is drawn (not a whole cell) and `facing` the unit
    // step it punched along. Its hits follow, one punchHit each.
    | { type: "punched"; player: number; at: Vec2; facing: Vec2 }
    // A player's punch hit an enemy (`enemy`, its index in
    // GameState.enemies), the boss or the other player (versus), at `at`:
    // where the target was drawn when the fist met it (the nearest point of
    // the boss's body), not a whole cell. The boss isn't hurt or moved.
    | {
          type: "punchHit"
          player: number
          at: Vec2
          target: "enemy" | "boss" | "player"
          enemy?: number
      }
    // The stage is cleared: the game is won. In versus this is the end of
    // a round; whether it also ends the match is up to flow.ts (the next
    // screen is roundResult or matchResult).
    | { type: "gameWon" }
    // The game is lost (never in versus).
    | { type: "gameLost" }

export type GameEventType = GameEvent["type"]

// Record `event` as happening in this tick.
export function emit(state: GameState, event: GameEvent) {
    state.events.push(event)
}

// The events since the last call, emptying the list (see the top of this
// file).
export function takeEvents(state: GameState): GameEvent[] {
    const events = state.events
    state.events = []
    return events
}
