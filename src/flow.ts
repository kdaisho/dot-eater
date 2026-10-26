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

// The game's screens and the transitions between them:
//
//   title -> stageSelect -> playing <-> paused
//                 ^            |
//                 |            +-> ending -> stageClear / gameOver
//                 |                              |
//                 +------------------------------+-> retry or stageSelect
//
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

// What an end screen offers, in menu order. The first is selected on entry,
// so Space retries straight away, as it always has.
export const END_CHOICES = ["retry", "stageSelect"] as const
export type EndChoice = (typeof END_CHOICES)[number]

export type Screen =
    | { kind: "title" }
    | { kind: "stageSelect"; selected: number }
    | { kind: "playing"; level: number; game: GameState }
    | { kind: "paused"; level: number; game: GameState }
    | { kind: "ending"; level: number; game: GameState; outcome: Outcome }
    | { kind: "stageClear"; level: number; game: GameState; choice: EndChoice }
    | { kind: "gameOver"; level: number; game: GameState; choice: EndChoice }

export type ScreenKind = Screen["kind"]

// One tick of player input.
export type TickInput = {
    // Pressed since the previous tick (a press edge; holding doesn't repeat).
    wasPressed(action: Action): boolean
    // Movement for the game; only read while playing.
    move(): MoveInput
}

export type FlowDeps = {
    levels: readonly Level[]
    // Which stages are unlocked.
    progress: Progress
    // Tick length in seconds.
    dt: number
    random: Random
    // Injected so tests can watch it; defaults to the real game step.
    step?: typeof step
}

export function initialScreen(): Screen {
    return { kind: "title" }
}

export function startLevel(levels: readonly Level[], level: number): Screen {
    return { kind: "playing", level, game: createGameState(levels[level]) }
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
        case "playing":
            return updatePlaying(screen, input, deps)
        case "paused":
            return input.wasPressed("pause") || input.wasPressed("confirm")
                ? { ...screen, kind: "playing" }
                : screen
        case "ending":
            return settle(screen.game, deps.dt)
                ? endScreen(screen, screen.outcome)
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
            ? startLevel(deps.levels, screen.selected)
            : screen
    }
    if (input.wasPressed("pause")) return { kind: "title" }
    const selected = moveCursor(screen.selected, STAGE_COUNT, input)
    return selected === screen.selected ? screen : { ...screen, selected }
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
    const { level, game } = screen
    return { kind: "ending", level, game, outcome }
}

function endScreen(
    screen: Extract<Screen, { kind: "ending" }>,
    outcome: Outcome
): Screen {
    const { level, game } = screen
    const kind = outcome === "won" ? "stageClear" : "gameOver"
    return { kind, level, game, choice: END_CHOICES[0] }
}

function updateEnd(
    screen: Extract<Screen, { kind: "stageClear" | "gameOver" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    if (input.wasPressed("confirm")) {
        return screen.choice === "retry"
            ? startLevel(deps.levels, screen.level)
            : { kind: "stageSelect", selected: screen.level }
    }
    const index = END_CHOICES.indexOf(screen.choice)
    const next = moveCursor(index, END_CHOICES.length, input)
    return next === index ? screen : { ...screen, choice: END_CHOICES[next] }
}

// Up/down through a menu of `count` items, stopping at either end.
function moveCursor(index: number, count: number, input: TickInput): number {
    let next = index
    if (input.wasPressed("up")) next--
    if (input.wasPressed("down")) next++
    return Math.min(Math.max(next, 0), count - 1)
}

// The game shown on this screen, if any.
export function gameOf(screen: Screen): GameState | undefined {
    return "game" in screen ? screen.game : undefined
}
