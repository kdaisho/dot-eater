import type { GameState } from "./game"
import type { AnimalId } from "./roster"
import type { Vec2 } from "./vec2"

// What happened in a game tick, for the things that react to it without
// being game rules: sound (KDA-212), particles and screen shake (KDA-213).
// Pure data, no DOM.
//
// `step` (game.ts) empties GameState.events at its start and adds one
// event per occurrence as it happens, in the order it happens. Nothing else
// clears it, and `settle` (the outro) adds only the held gameWon (see
// GameState.winHeld) and the cues of a boss's defeat (bossShattered,
// bossBlast). Main reads a game's events once after each tick
// with takeEvents, which also empties the list, so a tick that doesn't step
// the game (pause, menus) reports nothing new.
//
// `player` is always a player's index (player 1 is 0). `at` is a cell (the
// top-left one of the boss's 2x2 footprint), for placing effects.
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
    // then the walls it opened, if any (the Boar's); with neither, `at`.
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
    // A player's dash (KDA-304, the Boar's Rush; see BreathHit.dash in
    // breath.ts) rammed something on `at`: an enemy it knocks flying, a
    // wall, or the boss's body. `facing` is the unit step it rushed along.
    | { type: "rammed"; player: number; at: Vec2; facing: Vec2 }
    // Enemies a player's Rush rammed flew `distance` cells from `from` to
    // `to` along `facing`, where they slammed to a stop and were defeated
    // (each reports its enemyDefeated on `to` after this; see knock.ts).
    // Only for a flight of a cell or more. `shoved` is the chain carried in
    // front of them, a car per cell that moved, nearest first: the enemies
    // and players (by index) shoved `distance` cells from `from` to `to`
    // (KDA-307, so the chain can be drawn sliding; see rushView.ts).
    | {
          type: "knockedFlying"
          player: number
          from: Vec2
          to: Vec2
          facing: Vec2
          distance: number
          shoved: readonly ShovedCar[]
      }
    // A player's breath hurt the boss without finishing it; `health` is
    // what it has left.
    | { type: "bossHit"; player: number; at: Vec2; health: number }
    // A player's breath finished the boss. Its killing blow reports this
    // only, not a bossHit as well. Its defeat (KDA-301, see bossDefeat.ts)
    // plays out in the outro after it.
    | { type: "bossDefeated"; player: number; at: Vec2 }
    // In the outro of a boss's defeat (see advanceDefeat in bossDefeat.ts):
    // the boss shattered into pixels (the burst), at `at`, the middle of
    // where it fell, in cell units (cell centres at whole numbers).
    | { type: "bossShattered"; at: Vec2 }
    // In the outro of the final boss's defeat: one blast of the explosion
    // chain went off on `at` (cell units, as above): a small one, or the
    // big one at the end (`big`).
    | { type: "bossBlast"; at: Vec2; big: boolean }
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
    // Breather `enemy` (its index in GameState.enemies), on `at`, started
    // winding up its breath, facing `facing` (a unit step) at the player it
    // targets (KDA-291, see enemyBreath.ts).
    | { type: "enemyWindUp"; enemy: number; at: Vec2; facing: Vec2 }
    // Breather `enemy`, on `at`, breathed along `facing`, striking `cells`,
    // nearest first. The players it hurt report their own hurt (or
    // playerCaught) after it.
    | {
          type: "enemyBreathed"
          enemy: number
          at: Vec2
          facing: Vec2
          cells: readonly Vec2[]
      }
    // A player was hurt (see hurtPlayer in game.ts) on `at` (its cell when
    // hit, before the knockback) and lost `damage` health, with some left.
    // A hit that takes its last health reports a playerCaught instead.
    | { type: "hurt"; player: number; at: Vec2; damage: number }
    // A player was knocked out on `at` (its cell): a hit took its last
    // health. It won't be back: in solo the game is lost, and in co-op it
    // is out for good.
    | { type: "playerCaught"; player: number; at: Vec2 }
    // Co-op (KDA-316, see panic.ts): player `by`'s breath (or its Rush's
    // chain) struck `player`, on `at` (its cell), and panicked it.
    | { type: "playerPanicked"; player: number; by: number; at: Vec2 }
    // The stage is cleared: the game is won. Won by the last dot, it comes
    // from the outro once the players' glides are done (see settle in
    // game.ts); won by defeating the boss, as its defeat's effect ends
    // (KDA-301, see bossDefeat.ts), when the clear jingle is due.
    | { type: "gameWon" }
    // The game is lost.
    | { type: "gameLost" }

export type GameEventType = GameEvent["type"]

// A cell's worth of the chain a Rush's fliers shoved (see knockedFlying):
// the enemies and players (by index) on it, carried `distance` cells from
// `from` to `to`.
export type ShovedCar = {
    from: Vec2
    to: Vec2
    distance: number
    enemies: readonly number[]
    players: readonly number[]
}

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
