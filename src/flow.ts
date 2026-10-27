import type { Random } from "./ai"
import {
    createGameState,
    settle,
    step,
    type GameState,
    type MoveInput,
    type Outcome,
} from "./game"
import type { Action } from "./input"
import type { Level } from "./level"
import { isPlayable, STAGE_COUNT, type Progress } from "./progress"
import { ANIMAL_IDS, DEFAULT_ANIMAL, type AnimalId } from "./roster"
import { rateClear, type ClearRating } from "./stars"

// The game's screens and the transitions between them:
//
//   title <-> stageSelect <-> characterSelect -> playing <-> paused
//                 ^                                 |
//                 |                                 +-> ending
//                 |                                       |
//                 |                         stageClear / gameOver
//                 |                                       |
//                 +---------------------------------------+-> retry
//
// Back (the pause action, P or Escape) goes one menu up: character select
// to stage select, stage select to the title.
// There is no DOM access here: main feeds in one tick of input at a time,
// renders whatever screen comes back and shows the matching overlay.
//
// The game is only ever stepped in `playing`. Once a game ends the machine
// leaves `playing` on that same tick, so the game itself (cells, score,
// lives, positions) never changes any more (this replaces the old
// GameState.locked flag). What follows is `ending`, a short outro: the
// characters' glides finish (see settle in game.ts, which only raises
// moveProgress) so the player is seen arriving on its last cell, then the
// end screen for the outcome. Input is ignored during the outro.
//
// Stage select always has STAGE_COUNT slots. The cursor moves over all of
// them, locked ones included, so the player can see what's ahead; confirm
// only starts a stage that is unlocked and has a level. Saved progress comes
// in through FlowDeps; main records a clear when stageClear is entered.
//
// Confirming an open stage goes to character select, with the cursor on the
// character picked last (FlowDeps.lastAnimal, which main loads from storage
// and saves on every pick). Confirming a character starts the game. Every
// game screen carries its `animal`, so Retry plays the same character again.
// Character select keeps one cursor per player (`picks`, player 1 first);
// only player 1 picks for now.
//
// The clear time is the game's tick count (GameState.ticks), which only the
// game step adds to, so pauses and the outro don't count. stageClear carries
// the clear's star rating, worked out once on entry.

// What an end screen offers, in menu order. The first is selected on entry,
// so Space retries (once END_CONFIRM_DELAY has passed).
export const END_CHOICES = ["retry", "stageSelect"] as const
export type EndChoice = (typeof END_CHOICES)[number]

// How long (seconds) an end screen ignores confirm after it appears, so
// mashing breath (the same button as confirm on a pad) while dying or
// clearing doesn't pick Retry before the player sees the screen. The cursor
// moves meanwhile.
export const END_CONFIRM_DELAY = 0.5

// How long an end screen has been up, in seconds of ticks. A mutable box,
// like the game, so it carries over when the cursor moves (the copy shares
// it) without a new screen every tick. Left out, confirm works at once.
export type ShownFor = { seconds: number }

export type Screen =
    | { kind: "title" }
    | { kind: "stageSelect"; selected: number }
    | {
          kind: "characterSelect"
          // The stage that starts once a character is picked.
          level: number
          // Where each player's cursor is, player 1 first.
          picks: readonly [AnimalId, ...AnimalId[]]
      }
    | { kind: "playing"; level: number; animal: AnimalId; game: GameState }
    | { kind: "paused"; level: number; animal: AnimalId; game: GameState }
    | {
          kind: "ending"
          level: number
          animal: AnimalId
          game: GameState
          outcome: Outcome
      }
    | {
          kind: "stageClear"
          level: number
          animal: AnimalId
          game: GameState
          choice: EndChoice
          rating: ClearRating
          shown?: ShownFor
      }
    | {
          kind: "gameOver"
          level: number
          animal: AnimalId
          game: GameState
          choice: EndChoice
          shown?: ShownFor
      }

export type ScreenKind = Screen["kind"]

// One tick of player input.
export type TickInput = {
    // Pressed since the previous tick (a press edge; holding doesn't repeat).
    wasPressed(action: Action): boolean
    // Movement and the breath press for the game; only read while playing.
    move(): MoveInput
}

export type FlowDeps = {
    levels: readonly Level[]
    // Which stages are unlocked.
    progress: Progress
    // Tick length in seconds.
    dt: number
    random: Random
    // Where character select's cursor starts; DEFAULT_ANIMAL when left out.
    lastAnimal?: AnimalId
    // Injected so tests can watch it; defaults to the real game step.
    step?: typeof step
}

export function initialScreen(): Screen {
    return { kind: "title" }
}

export function startLevel(
    levels: readonly Level[],
    level: number,
    animal: AnimalId = DEFAULT_ANIMAL
): Screen {
    return {
        kind: "playing",
        level,
        animal,
        game: createGameState(levels[level], animal),
    }
}

// Advance the machine by one tick. Returns the same screen object when
// nothing changed except the game inside `playing`, and a new one on any
// transition or menu move, so callers can compare by identity.
//
// A tick that changes screens does only that: a screen entered on this tick
// first handles input on the next one. Main clears press edges after every
// tick, so a press made in a menu (or while paused) never reaches the game.
export function update(
    screen: Screen,
    input: TickInput,
    deps: FlowDeps
): Screen {
    switch (screen.kind) {
        case "title":
            return input.wasPressed("confirm")
                ? { kind: "stageSelect", selected: 0 }
                : screen
        case "stageSelect":
            return updateStageSelect(screen, input, deps)
        case "characterSelect":
            return updateCharacterSelect(screen, input, deps)
        case "playing":
            return updatePlaying(screen, input, deps)
        case "paused":
            return input.wasPressed("pause") || input.wasPressed("confirm")
                ? { ...screen, kind: "playing" }
                : screen
        case "ending":
            return settle(screen.game, deps.dt)
                ? endScreen(screen, deps.levels)
                : screen
        case "stageClear":
        case "gameOver":
            return updateEnd(screen, input, deps)
        default: {
            const unhandled: never = screen
            throw new Error(`Unknown screen: ${JSON.stringify(unhandled)}`)
        }
    }
}

// Pause a game in progress; every other screen comes back unchanged (the
// same object). For events outside the tick input, such as the window losing
// focus or the tab being hidden. The `ending` outro isn't paused: it has no
// gameplay left, and it must finish on its own.
export function pauseIfPlaying(screen: Screen): Screen {
    return screen.kind === "playing" ? { ...screen, kind: "paused" } : screen
}

function updateStageSelect(
    screen: Extract<Screen, { kind: "stageSelect" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    if (input.wasPressed("confirm")) {
        // A locked stage, or a slot with no level yet, can't be started.
        return isPlayable(deps.progress, deps.levels.length, screen.selected)
            ? {
                  kind: "characterSelect",
                  level: screen.selected,
                  picks: [deps.lastAnimal ?? DEFAULT_ANIMAL],
              }
            : screen
    }
    if (input.wasPressed("pause")) return { kind: "title" }
    const selected = moveCursor(screen.selected, STAGE_COUNT, input)
    return selected === screen.selected ? screen : { ...screen, selected }
}

// Left/right move player 1's cursor over ANIMAL_IDS, stopping at either end;
// confirm plays the stage with that character, and back returns to stage
// select on the same stage.
function updateCharacterSelect(
    screen: Extract<Screen, { kind: "characterSelect" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    const [pick, ...others] = screen.picks
    if (input.wasPressed("confirm")) {
        return startLevel(deps.levels, screen.level, pick)
    }
    if (input.wasPressed("pause")) {
        return { kind: "stageSelect", selected: screen.level }
    }
    const index = ANIMAL_IDS.indexOf(pick)
    const next = moveAcross(index, ANIMAL_IDS.length, input)
    return next === index
        ? screen
        : { ...screen, picks: [ANIMAL_IDS[next], ...others] }
}

function updatePlaying(
    screen: Extract<Screen, { kind: "playing" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    if (input.wasPressed("pause")) return { ...screen, kind: "paused" }
    const stepGame = deps.step ?? step
    const outcome = stepGame(screen.game, deps.dt, input.move(), deps.random)
    if (!outcome) return screen
    const { level, animal, game } = screen
    return { kind: "ending", level, animal, game, outcome }
}

function endScreen(
    screen: Extract<Screen, { kind: "ending" }>,
    levels: readonly Level[]
): Screen {
    const { level, animal, game } = screen
    const choice = END_CHOICES[0]
    const shown = { seconds: 0 }
    if (screen.outcome !== "won") {
        return { kind: "gameOver", level, animal, game, choice, shown }
    }
    const rating = rateClear(game, levels[level].parTime)
    return { kind: "stageClear", level, animal, game, choice, rating, shown }
}

function updateEnd(
    screen: Extract<Screen, { kind: "stageClear" | "gameOver" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    const { shown } = screen
    if (shown) shown.seconds += deps.dt
    // The epsilon absorbs float drift from summing dt.
    const ready = !shown || shown.seconds >= END_CONFIRM_DELAY - 1e-9
    if (ready && input.wasPressed("confirm")) {
        return screen.choice === "retry"
            ? startLevel(deps.levels, screen.level, screen.animal)
            : { kind: "stageSelect", selected: screen.level }
    }
    const index = END_CHOICES.indexOf(screen.choice)
    const next = moveCursor(index, END_CHOICES.length, input)
    return next === index ? screen : { ...screen, choice: END_CHOICES[next] }
}

// Up/down through a menu of `count` items, stopping at either end.
function moveCursor(index: number, count: number, input: TickInput): number {
    return stepCursor(index, count, input, "up", "down")
}

// Left/right along a row of `count` items, stopping at either end.
function moveAcross(index: number, count: number, input: TickInput): number {
    return stepCursor(index, count, input, "left", "right")
}

function stepCursor(
    index: number,
    count: number,
    input: TickInput,
    back: Action,
    forward: Action
): number {
    let next = index
    if (input.wasPressed(back)) next--
    if (input.wasPressed(forward)) next++
    return Math.min(Math.max(next, 0), count - 1)
}

// The game shown on this screen, if any.
export function gameOf(screen: Screen): GameState | undefined {
    return "game" in screen ? screen.game : undefined
}
