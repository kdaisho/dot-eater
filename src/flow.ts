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
// The title is also the mode select (1 player, or a 2-player mode; see
// MODE_CHOICES). Every screen after it carries the `mode` picked there, up
// to the end screens and back to stage select, so Retry keeps it.
//
// The game is only ever stepped in `playing`. Once a game ends the machine
// leaves `playing` on that same tick, so the game itself (cells, score,
// lives, positions) never changes any more (this replaces the old
// GameState.locked flag). What follows is `ending`, a short outro: the
// characters' glides finish (see settle in game.ts, which only raises
// moveProgress) so the players are seen arriving on their last cells, then
// the end screen for the outcome. Input is ignored during the outro.
//
// Stage select always has STAGE_COUNT slots. The cursor moves over all of
// them, locked ones included, so the player can see what's ahead; confirm
// only starts a stage that is unlocked and has a level. Saved progress comes
// in through FlowDeps; main records a clear when stageClear is entered, in
// 1-player games only (see recordsProgress). A 2-player game can play any
// stage unlocked in 1-player.
//
// Confirming an open stage goes to character select, with every cursor on
// the character picked last (FlowDeps.lastAnimal, which main loads from
// storage and saves on every pick). Character select keeps one cursor per
// player (`picks`, player 1 first), each moved with that player's own keys;
// both players may pick the same character. A player confirms its pick
// (`ready`); once every player has, the game starts. Back from a player who
// has confirmed takes the confirmation back; from one who hasn't, it goes
// back to stage select. Every game screen carries its `animals`, so Retry
// plays the same characters again.
//
// Menus other than character select (title, stage select, the end screens)
// follow player 1. During a 2-player game either player can pause, and
// either can resume.
//
// The clear time is the game's tick count (GameState.ticks), which only the
// game step adds to, so pauses and the outro don't count. stageClear carries
// the clear's star rating, worked out once on entry.

// What an end screen offers, in menu order. The first is selected on entry,
// so Space retries straight away, as it always has.
export const END_CHOICES = ["retry", "stageSelect"] as const
export type EndChoice = (typeof END_CHOICES)[number]

// How a game is played: by one player, or by two together (co-op) or
// against each other (versus).
export type Mode = "solo" | "coop" | "versus"

// The modes the title's mode select offers, in menu order. Co-op and versus
// get their own rules in KDA-221 and KDA-222; until then "coop" is the one
// "2 players" entry, playing by placeholder rules (see resolveCatch in
// game.ts). To offer versus, add it here (main labels each mode).
export const MODE_CHOICES: readonly Mode[] = ["solo", "coop"]

// How many players a mode has.
export function playerCount(mode: Mode): number {
    return mode === "solo" ? 1 : 2
}

// Whether a mode's clears count towards saved progress (unlocks, bests and
// stars): only 1-player games'.
export function recordsProgress(mode: Mode): boolean {
    return mode === "solo"
}

// One character per player, player 1 first.
export type Picks = readonly [AnimalId, ...AnimalId[]]

export type Screen =
    | { kind: "title"; mode: Mode }
    | { kind: "stageSelect"; mode: Mode; selected: number }
    | {
          kind: "characterSelect"
          mode: Mode
          // The stage that starts once a character is picked.
          level: number
          // Where each player's cursor is, player 1 first.
          picks: Picks
          // Whether each player has confirmed its pick.
          ready: readonly boolean[]
      }
    | {
          kind: "playing"
          mode: Mode
          level: number
          animals: Picks
          game: GameState
      }
    | {
          kind: "paused"
          mode: Mode
          level: number
          animals: Picks
          game: GameState
      }
    | {
          kind: "ending"
          mode: Mode
          level: number
          animals: Picks
          game: GameState
          outcome: Outcome
      }
    | {
          kind: "stageClear"
          mode: Mode
          level: number
          animals: Picks
          game: GameState
          choice: EndChoice
          rating: ClearRating
      }
    | {
          kind: "gameOver"
          mode: Mode
          level: number
          animals: Picks
          game: GameState
          choice: EndChoice
      }

export type ScreenKind = Screen["kind"]

// One tick of input. `player` is the player's index, player 1 (0) unless
// given.
export type TickInput = {
    // Pressed since the previous tick (a press edge; holding doesn't repeat).
    wasPressed(action: Action, player?: number): boolean
    // Movement and the breath press for the game; only read while playing.
    move(player?: number): MoveInput
}

export type FlowDeps = {
    levels: readonly Level[]
    // Which stages are unlocked.
    progress: Progress
    // Tick length in seconds.
    dt: number
    random: Random
    // Where character select's cursors start; DEFAULT_ANIMAL when left out.
    lastAnimal?: AnimalId
    // Injected so tests can watch it; defaults to the real game step.
    step?: typeof step
}

export function initialScreen(): Screen {
    return { kind: "title", mode: MODE_CHOICES[0] }
}

// Start `level` as `animals` (one per player of `mode`; a single animal for
// 1 player).
export function startLevel(
    levels: readonly Level[],
    level: number,
    animals: AnimalId | Picks = DEFAULT_ANIMAL,
    mode: Mode = "solo"
): Screen {
    const picks: Picks = typeof animals === "string" ? [animals] : animals
    return {
        kind: "playing",
        mode,
        level,
        animals: picks,
        game: createGameState(levels[level], picks),
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
            return updateTitle(screen, input)
        case "stageSelect":
            return updateStageSelect(screen, input, deps)
        case "characterSelect":
            return updateCharacterSelect(screen, input, deps)
        case "playing":
            return updatePlaying(screen, input, deps)
        case "paused":
            return anyPressed(screen.mode, input, "pause") ||
                anyPressed(screen.mode, input, "confirm")
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

// Whether any player of `mode` pressed `action` this tick.
function anyPressed(mode: Mode, input: TickInput, action: Action): boolean {
    for (let i = 0; i < playerCount(mode); i++) {
        if (input.wasPressed(action, i)) return true
    }
    return false
}

// Up/down move over MODE_CHOICES; confirm goes on to stage select in that
// mode.
function updateTitle(
    screen: Extract<Screen, { kind: "title" }>,
    input: TickInput
): Screen {
    if (input.wasPressed("confirm")) {
        return { kind: "stageSelect", mode: screen.mode, selected: 0 }
    }
    const index = Math.max(0, MODE_CHOICES.indexOf(screen.mode))
    const next = moveCursor(index, MODE_CHOICES.length, input)
    return next === index ? screen : { ...screen, mode: MODE_CHOICES[next] }
}

function updateStageSelect(
    screen: Extract<Screen, { kind: "stageSelect" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    const { mode } = screen
    if (input.wasPressed("confirm")) {
        // A locked stage, or a slot with no level yet, can't be started.
        if (!isPlayable(deps.progress, deps.levels.length, screen.selected)) {
            return screen
        }
        const count = playerCount(mode)
        const pick = deps.lastAnimal ?? DEFAULT_ANIMAL
        return {
            kind: "characterSelect",
            mode,
            level: screen.selected,
            picks: [pick, ...Array<AnimalId>(count - 1).fill(pick)],
            ready: Array<boolean>(count).fill(false),
        }
    }
    if (input.wasPressed("pause")) return { kind: "title", mode }
    const selected = moveCursor(screen.selected, STAGE_COUNT, input)
    return selected === screen.selected ? screen : { ...screen, selected }
}

// Each player's left/right move its own cursor over ANIMAL_IDS, stopping at
// either end, until it confirms; confirm marks its pick ready, and the
// stage starts once every player is ready. Back takes a confirmation back,
// or returns to stage select on the same stage. // order, player 1 first, so player 1's back wins a tick where both act.
function updateCharacterSelect(
    screen: Extract<Screen, { kind: "characterSelect" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    const picks: AnimalId[] = [...screen.picks]
    const ready = [...screen.ready]
    let changed = false
    for (let i = 0; i < picks.length; i++) {
        if (input.wasPressed("confirm", i)) {
            if (!ready[i]) changed = true
            ready[i] = true
        } else if (input.wasPressed("pause", i)) {
            if (!ready[i]) {
                return {
                    kind: "stageSelect",
                    mode: screen.mode,
                    selected: screen.level,
                }
            }
            ready[i] = false
            changed = true
        } else if (!ready[i]) {
            const index = ANIMAL_IDS.indexOf(picks[i])
            const next = moveAcross(index, ANIMAL_IDS.length, input, i)
            if (next !== index) {
                picks[i] = ANIMAL_IDS[next]
                changed = true
            }
        }
    }
    const animals: Picks = [picks[0], ...picks.slice(1)]
    if (ready.every(Boolean)) {
        return startLevel(deps.levels, screen.level, animals, screen.mode)
    }
    return changed ? { ...screen, picks: animals, ready } : screen
}

function updatePlaying(
    screen: Extract<Screen, { kind: "playing" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    if (anyPressed(screen.mode, input, "pause")) {
        return { ...screen, kind: "paused" }
    }
    const stepGame = deps.step ?? step
    const count = screen.game.players.length
    const moves =
        count === 1
            ? input.move()
            : Array.from({ length: count }, (_, i) => input.move(i))
    const outcome = stepGame(screen.game, deps.dt, moves, deps.random)
    if (!outcome) return screen
    const { mode, level, animals, game } = screen
    return { kind: "ending", mode, level, animals, game, outcome }
}

function endScreen(
    screen: Extract<Screen, { kind: "ending" }>,
    levels: readonly Level[]
): Screen {
    const { mode, level, animals, game } = screen
    const choice = END_CHOICES[0]
    if (screen.outcome !== "won") {
        return { kind: "gameOver", mode, level, animals, game, choice }
    }
    const rating = rateClear(game, levels[level].parTime)
    return { kind: "stageClear", mode, level, animals, game, choice, rating }
}

function updateEnd(
    screen: Extract<Screen, { kind: "stageClear" | "gameOver" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    if (input.wasPressed("confirm")) {
        return screen.choice === "retry"
            ? startLevel(deps.levels, screen.level, screen.animals, screen.mode)
            : { kind: "stageSelect", mode: screen.mode, selected: screen.level }
    }
    const index = END_CHOICES.indexOf(screen.choice)
    const next = moveCursor(index, END_CHOICES.length, input)
    return next === index ? screen : { ...screen, choice: END_CHOICES[next] }
}

// Up/down through a menu of `count` items, stopping at either end.
function moveCursor(index: number, count: number, input: TickInput): number {
    return stepCursor(index, count, input, "up", "down", 0)
}

// Left/right along a row of `count` items, stopping at either end, by
// player `player`'s input.
function moveAcross(
    index: number,
    count: number,
    input: TickInput,
    player: number
): number {
    return stepCursor(index, count, input, "left", "right", player)
}

function stepCursor(
    index: number,
    count: number,
    input: TickInput,
    back: Action,
    forward: Action,
    player: number
): number {
    let next = index
    if (input.wasPressed(back, player)) next--
    if (input.wasPressed(forward, player)) next++
    return Math.min(Math.max(next, 0), count - 1)
}

// The game shown on this screen, if any.
export function gameOf(screen: Screen): GameState | undefined {
    return "game" in screen ? screen.game : undefined
}
