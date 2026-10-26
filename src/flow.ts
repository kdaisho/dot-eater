import type { Random } from "./ai"
import {
    createGameState,
    step,
    type GameState,
    type MoveInput,
    type Outcome,
} from "./game"
import type { Action } from "./input"
import type { Level } from "./level"

// The game's screens and the transitions between them:
//
//   title -> stageSelect -> playing <-> paused
//                 ^            |
//                 |            +-> stageClear / gameOver -> retry or stageSelect
//
// There is no DOM access here: main feeds in one tick of input at a time,
// renders whatever screen comes back and shows the matching overlay.
//
// The game is only ever stepped in `playing`. Once a game ends the machine
// leaves `playing` on that same tick, so nothing in the finished game changes
// any more (this replaces the old GameState.locked flag).

// What an end screen offers, in menu order. The first is selected on entry,
// so Space retries straight away, as it always has.
export const END_CHOICES = ["retry", "stageSelect"] as const
export type EndChoice = (typeof END_CHOICES)[number]

export type Screen =
    | { kind: "title" }
    | { kind: "stageSelect"; selected: number }
    | { kind: "playing"; level: number; game: GameState }
    | { kind: "paused"; level: number; game: GameState }
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
// focus or the tab being hidden.
export function pauseIfPlaying(screen: Screen): Screen {
    return screen.kind === "playing" ? { ...screen, kind: "paused" } : screen
}

function updateStageSelect(
    screen: Extract<Screen, { kind: "stageSelect" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    if (input.wasPressed("confirm")) {
        return startLevel(deps.levels, screen.selected)
    }
    if (input.wasPressed("pause")) return { kind: "title" }
    const selected = moveCursor(screen.selected, deps.levels.length, input)
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
    return outcome ? endScreen(screen, outcome) : screen
}

function endScreen(
    screen: Extract<Screen, { kind: "playing" }>,
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
