import type { Random } from "./ai"
import { rebind } from "./bindings"
import { CONTROLS_ROWS } from "./controlsMenu"
import {
    createGameState,
    settle,
    step,
    type GameState,
    type Mode,
    type MoveInput,
    type Outcome,
} from "./game"
import type { Action } from "./input"
import type { Level } from "./level"
import { isPlayable, STAGE_COUNT, type Progress } from "./progress"
import { ANIMAL_IDS, DEFAULT_ANIMAL, type AnimalId } from "./roster"
import { bindingsOf, defaultSettings, type Settings } from "./settings"
import {
    changeRow,
    settingsRows,
    type SettingsAction,
    type SettingsContext,
} from "./settingsMenu"
import { rateClear, type ClearRating } from "./stars"
import { matchWinner, roundResult, type RoundResult } from "./versus"

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
//
// Settings open from the title's menu (its last entry, after the modes;
// TITLE_CHOICES) and from the pause menu (PAUSE_CHOICES), and Back returns
// to where they were opened, with the cursor still on Settings; from pause
// that is the same paused game, which isn't stepped meanwhile.
//
//   title <-> settings        paused <-> settings
//
// The settings screen is a list of rows (see settingsMenu.ts): up/down
// move, left/right change a slider or flip a toggle, confirm flips a toggle
// or runs an action. From the title, player 1 drives it, like the title.
// From a 2-player game's pause, either player does, like the pause menu;
// on a tick both players press on, player 1's presses count and player
// 2's are ignored. The screen carries the
// settings as changed so far; main saves them whenever a tick returns them
// changed (as it records progress), and passes the saved ones back in
// through FlowDeps.settings.
//
// Settings opened from the title have a Controls row (KDA-215), which opens
// the controls screen: one player's bindings at a time (CONTROLS_ROWS in
// controlsMenu.ts), player 1's first. Up/down move, left/right switch
// between the players, confirm on a key or pad row waits for the new key or
// button (`capturing`), and Reset to defaults and Back do what they say.
// Back, or the pause action, returns to the settings with the cursor on
// Controls. While capturing, every action press is ignored: the screen only
// reads TickInput.captured, which main fills from raw keydowns (captureKey)
// and pad buttons (captureButton), the first of each kind apart, so a press
// of the wrong kind never hides a good one. A key row takes a key; a pad
// button there cancels, but only on a tick with no key, so a player with
// only a pad can always get out. A pad row takes a button; a key there
// keeps it waiting. Escape cancels on either. The capture goes through
// rebind (so a key in use swaps). Either way capturing ends on that tick,
// whose press edges main then clears, so the press that was captured never
// acts on the menu. Reset to defaults drops the bindings from the settings
// altogether, so they follow the defaults from then on. Like the settings
// screen, it carries the settings as changed so far, and main saves (and
// applies) them whenever a tick returns them changed.
//
//   title <-> settings <-> controls
//
// There is no DOM access here: main feeds in one tick of input at a time,
// renders whatever screen comes back and shows the matching overlay.
//
// The title is also the mode select (1 player, or a 2-player mode; see
// MODE_CHOICES). Every screen after it carries the `mode` picked there, up
// to the end screens and back to stage select, so Retry keeps it.
//
// The game is only ever stepped in `playing`. Once a game ends the machine
// leaves `playing` on that same tick, so the game itself (cells, score,
// health, positions) never changes any more (this replaces the old
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
// Versus (see versus.ts) is a best-of-3 match on one stage. Its game
// screens carry `match`, the rounds finished so far. A cleared round goes
// from `ending` to roundResult, whose menu is ROUND_CHOICES: Next round
// plays it on a fresh copy of the stage with the same characters, Quit
// drops the match for stage select. The round that decides the match goes
// to matchResult instead, whose menu is END_CHOICES (Retry is a rematch: a
// new match from round 1). A versus game is never lost, so it never
// reaches stageClear or gameOver. Both screens ignore confirm for
// END_CONFIRM_DELAY, like the end screens, and follow player 1.
//
//   playing -> ending -> roundResult -> playing (next round) / stageSelect
//                    \-> matchResult -> playing (rematch) / stageSelect
//
// The clear time is the game's tick count (GameState.ticks), which only the
// game step adds to, so pauses and the outro don't count. stageClear carries
// the clear's star rating, worked out once on entry.

// What an end screen offers, in menu order. The first is selected on entry,
// so Space retries (once END_CONFIRM_DELAY has passed).
export const END_CHOICES = ["retry", "stageSelect"] as const
export type EndChoice = (typeof END_CHOICES)[number]

// What a versus round's result offers, in menu order: the next round
// (selected on entry, so Space plays on), or quitting the match for stage
// select, still in versus.
export const ROUND_CHOICES = ["nextRound", "quit"] as const
export type RoundChoice = (typeof ROUND_CHOICES)[number]

// How a game is played (see Mode in game.ts, whose rules it decides).
export type { Mode }

// The modes the title's mode select offers, in menu order. Each game plays
// by its mode's rules (see knockOut in game.ts; versus.ts). Main labels
// each mode.
export const MODE_CHOICES: readonly Mode[] = ["solo", "coop", "versus"]

// The title's whole menu, in order: the modes, then Settings.
export type TitleChoice = Mode | "settings"
export const TITLE_CHOICES: readonly TitleChoice[] = [
    ...MODE_CHOICES,
    "settings",
]

// What the pause screen offers, in menu order. Resume is selected on
// entry, so confirm resumes as the pause action does.
export const PAUSE_CHOICES = ["resume", "settings"] as const
export type PauseChoice = (typeof PAUSE_CHOICES)[number]

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

// How long (seconds) an end screen ignores confirm after it appears, so
// mashing breath (the same button as confirm on a pad) while dying or
// clearing doesn't pick Retry before the player sees the screen. The cursor
// moves meanwhile.
export const END_CONFIRM_DELAY = 0.5

// How long an end screen has been up, in seconds of ticks. A mutable box,
// like the game, so it carries over when the cursor moves (the copy shares
// it) without a new screen every tick. Left out, confirm works at once.
export type ShownFor = { seconds: number }

// The rounds of a versus match finished so far, in order, replayed ones
// included (see RoundResult).
export type Match = readonly RoundResult[]

export type Screen =
    | {
          kind: "title"
          // The mode under the cursor, or the last one it was on while it
          // is on Settings.
          mode: Mode
          // Whether the cursor is on Settings rather than a mode.
          onSettings?: boolean
      }
    | {
          kind: "settings"
          // The mode of the screen it was opened from.
          mode: Mode
          // Where Back returns to: the title or the paused game, as it was.
          back: TitleScreen | PausedScreen
          // The cursor, an index into the rows that show (settingsRows).
          row: number
          // The settings as changed so far.
          settings: Settings
      }
    | {
          kind: "controls"
          // The mode of the title under the settings.
          mode: Mode
          // The settings screen, on its Controls row, that Back returns to.
          back: SettingsScreen
          // Whose controls show (player 1 is 0).
          player: number
          // The cursor, an index into CONTROLS_ROWS.
          row: number
          // Waiting for a key or button for the row under the cursor.
          capturing?: boolean
          // The settings as changed so far.
          settings: Settings
      }
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
          // Versus only: the match so far.
          match?: Match
      }
    | {
          kind: "paused"
          mode: Mode
          level: number
          animals: Picks
          game: GameState
          match?: Match
          // The pause menu's cursor; Resume when left out.
          choice?: PauseChoice
      }
    | {
          kind: "ending"
          mode: Mode
          level: number
          animals: Picks
          game: GameState
          outcome: Outcome
          match?: Match
      }
    | {
          // A versus round is over and the match goes on.
          kind: "roundResult"
          mode: Mode
          level: number
          animals: Picks
          game: GameState
          // The rounds so far, this one last.
          match: Match
          choice: RoundChoice
          shown?: ShownFor
      }
    | {
          // A versus match is over.
          kind: "matchResult"
          mode: Mode
          level: number
          animals: Picks
          game: GameState
          // Every round, the deciding one last.
          match: Match
          // The match winner's index (player 1 is 0).
          winner: number
          choice: EndChoice
          shown?: ShownFor
      }
    | {
          kind: "stageClear"
          mode: Mode
          level: number
          animals: Picks
          game: GameState
          choice: EndChoice
          rating: ClearRating
          shown?: ShownFor
      }
    | {
          kind: "gameOver"
          mode: Mode
          level: number
          animals: Picks
          game: GameState
          choice: EndChoice
          shown?: ShownFor
      }

export type ScreenKind = Screen["kind"]

type TitleScreen = Extract<Screen, { kind: "title" }>
type PausedScreen = Extract<Screen, { kind: "paused" }>
type SettingsScreen = Extract<Screen, { kind: "settings" }>
type ControlsScreen = Extract<Screen, { kind: "controls" }>

// One tick of input. `player` is the player's index, player 1 (0) unless
// given.
export type TickInput = {
    // Pressed since the previous tick (a press edge; holding doesn't repeat).
    wasPressed(action: Action, player?: number): boolean
    // Movement and the breath press for the game; only read while playing.
    move(player?: number): MoveInput
    // The controls screen's capture since the previous tick (see Capture).
    // Only read while capturing.
    captured?(): Capture | undefined
}

// What main captured for the controls screen since the previous tick: the
// first bindable key and the first fresh pad button pressed, each kind
// kept apart, and whether Escape was pressed.
export type Capture = {
    readonly key?: string
    readonly button?: number
    readonly cancel?: boolean
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
    // The saved settings, which the settings screen starts from; the
    // defaults when left out.
    settings?: Settings
    // Whether the device has a touch screen, and whether the system asks
    // for reduced motion: what some settings rows depend on (see
    // SettingsContext). Both false when left out.
    touch?: boolean
    prefersReducedMotion?: boolean
}

export function initialScreen(): Screen {
    return { kind: "title", mode: MODE_CHOICES[0] }
}

// Start `level` as `animals` (one per player of `mode`; a single animal for
// 1 player). A versus game is a round of `match` (the rounds before it; a
// new match unless given).
export function startLevel(
    levels: readonly Level[],
    level: number,
    animals: AnimalId | Picks = DEFAULT_ANIMAL,
    mode: Mode = "solo",
    match: Match = []
): Screen {
    const picks: Picks = typeof animals === "string" ? [animals] : animals
    return {
        kind: "playing",
        mode,
        level,
        animals: picks,
        game: createGameState(levels[level], picks, mode),
        ...(mode === "versus" ? { match } : {}),
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
            return updateTitle(screen, input, deps)
        case "settings":
            return updateSettings(screen, input, deps)
        case "controls":
            return updateControls(screen, input)
        case "stageSelect":
            return updateStageSelect(screen, input, deps)
        case "characterSelect":
            return updateCharacterSelect(screen, input, deps)
        case "playing":
            return updatePlaying(screen, input, deps)
        case "paused":
            return updatePaused(screen, input, deps)
        case "ending":
            return settle(screen.game, deps.dt)
                ? endScreen(screen, deps.levels)
                : screen
        case "stageClear":
        case "gameOver":
            return updateEnd(screen, input, deps)
        case "roundResult":
            return updateRoundResult(screen, input, deps)
        case "matchResult":
            return updateMatchResult(screen, input, deps)
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

// Put player 1's menu cursor on item `index` of the screen's menu (in the
// order the overlay lists them), for a tapped or clicked item; main then
// presses confirm, so the item is picked like with the keys (on settings,
// confirm flips a toggle or runs Back; main presses left or right instead
// for a slider's arrows). Screens without a menu, an index off the menu,
// and a character select player 1 has already confirmed come back
// unchanged (the same object). `deps` decides which settings rows show.
export function selectItem(
    screen: Screen,
    index: number,
    deps: Pick<FlowDeps, "touch" | "prefersReducedMotion"> = {}
): Screen {
    const within = (count: number) =>
        Number.isInteger(index) && index >= 0 && index < count
    switch (screen.kind) {
        case "title": {
            if (!within(TITLE_CHOICES.length)) return screen
            const choice = TITLE_CHOICES[index]
            if (choice === "settings") {
                return screen.onSettings
                    ? screen
                    : { ...screen, onSettings: true }
            }
            return choice === screen.mode && !screen.onSettings
                ? screen
                : { kind: "title", mode: choice }
        }
        case "paused":
            return within(PAUSE_CHOICES.length) &&
                PAUSE_CHOICES[index] !== (screen.choice ?? "resume")
                ? { ...screen, choice: PAUSE_CHOICES[index] }
                : screen
        case "settings": {
            const rows = settingsRows(settingsContext(screen, deps))
            return within(rows.length) && index !== screen.row
                ? { ...screen, row: index }
                : screen
        }
        // While capturing, a tap leaves the screen alone; its confirm press
        // is ignored there too, so it binds nothing.
        case "controls":
            return !screen.capturing &&
                within(CONTROLS_ROWS.length) &&
                index !== screen.row
                ? { ...screen, row: index }
                : screen
        case "stageSelect":
            return within(STAGE_COUNT) && index !== screen.selected
                ? { ...screen, selected: index }
                : screen
        case "characterSelect": {
            const animal = ANIMAL_IDS[index]
            if (!within(ANIMAL_IDS.length) || screen.ready[0]) return screen
            if (animal === screen.picks[0]) return screen
            return { ...screen, picks: [animal, ...screen.picks.slice(1)] }
        }
        case "stageClear":
        case "gameOver":
        case "matchResult":
            return within(END_CHOICES.length) &&
                END_CHOICES[index] !== screen.choice
                ? { ...screen, choice: END_CHOICES[index] }
                : screen
        case "roundResult":
            return within(ROUND_CHOICES.length) &&
                ROUND_CHOICES[index] !== screen.choice
                ? { ...screen, choice: ROUND_CHOICES[index] }
                : screen
        default:
            return screen
    }
}

// Whether any player of `mode` pressed `action` this tick.
function anyPressed(mode: Mode, input: TickInput, action: Action): boolean {
    for (let i = 0; i < playerCount(mode); i++) {
        if (input.wasPressed(action, i)) return true
    }
    return false
}

// Up/down move over TITLE_CHOICES; confirm on a mode goes on to stage
// select in that mode, and on Settings opens them.
function updateTitle(
    screen: TitleScreen,
    input: TickInput,
    deps: FlowDeps
): Screen {
    if (input.wasPressed("confirm")) {
        return screen.onSettings
            ? openSettings(screen, deps)
            : { kind: "stageSelect", mode: screen.mode, selected: 0 }
    }
    const current: TitleChoice = screen.onSettings ? "settings" : screen.mode
    const index = Math.max(0, TITLE_CHOICES.indexOf(current))
    const next = moveCursor(index, TITLE_CHOICES.length, input)
    if (next === index) return screen
    const choice = TITLE_CHOICES[next]
    return choice === "settings"
        ? { ...screen, onSettings: true }
        : { kind: "title", mode: choice }
}

// The pause action resumes, as does confirm on Resume (either player's, in
// a 2-player game); confirm on Settings opens them. Player 1 moves the
// cursor.
function updatePaused(
    screen: PausedScreen,
    input: TickInput,
    deps: FlowDeps
): Screen {
    const { mode } = screen
    const confirmed = anyPressed(mode, input, "confirm")
    if (confirmed && screen.choice === "settings") {
        return openSettings(screen, deps)
    }
    if (confirmed || anyPressed(mode, input, "pause")) {
        const { choice: _, ...game } = screen
        return { ...game, kind: "playing" }
    }
    const index = PAUSE_CHOICES.indexOf(screen.choice ?? "resume")
    const next = moveCursor(index, PAUSE_CHOICES.length, input)
    return next === index ? screen : { ...screen, choice: PAUSE_CHOICES[next] }
}

// The settings screen over `back` (the title or the paused game), on its
// first row, starting from the saved settings.
function openSettings(
    back: TitleScreen | PausedScreen,
    deps: FlowDeps
): SettingsScreen {
    return {
        kind: "settings",
        mode: back.mode,
        back,
        row: 0,
        settings: deps.settings ?? defaultSettings(),
    }
}

// What the settings screen's rows depend on (see SettingsContext).
export function settingsContext(
    screen: SettingsScreen,
    deps: Pick<FlowDeps, "touch" | "prefersReducedMotion">
): SettingsContext {
    return {
        from: screen.back.kind === "title" ? "title" : "pause",
        touch: deps.touch ?? false,
        prefersReducedMotion: deps.prefersReducedMotion ?? false,
    }
}

// The menu actions the settings screen reads.
const SETTINGS_ACTIONS: readonly Action[] = [
    "pause",
    "confirm",
    "up",
    "down",
    "left",
    "right",
]

// Who drives the settings this tick (see the top of this file): player 1
// from the title; from a 2-player game's pause, the first player, in
// player order, who pressed anything on it.
function settingsPlayer(screen: SettingsScreen, input: TickInput): number {
    if (screen.back.kind === "title") return 0
    for (let i = 0; i < playerCount(screen.mode); i++) {
        if (SETTINGS_ACTIONS.some((a) => input.wasPressed(a, i))) return i
    }
    return 0
}

// Back (the pause action) returns to where it was opened.
function updateSettings(
    screen: SettingsScreen,
    tickInput: TickInput,
    deps: FlowDeps
): Screen {
    // Everything below reads the driving player's presses only.
    const who = settingsPlayer(screen, tickInput)
    const input: TickInput = {
        ...tickInput,
        wasPressed: (action) => tickInput.wasPressed(action, who),
    }
    if (input.wasPressed("pause")) return screen.back
    const context = settingsContext(screen, deps)
    const rows = settingsRows(context)
    const row = rows[Math.min(screen.row, rows.length - 1)]
    const change = (delta: -1 | 1): Screen => {
        const settings = changeRow(row, screen.settings, context, delta)
        return settings === screen.settings ? screen : { ...screen, settings }
    }
    if (input.wasPressed("confirm")) {
        if (row.kind === "action") return runAction(screen, row.action)
        return row.kind === "toggle" || row.kind === "choice"
            ? change(1)
            : screen
    }
    const delta =
        Number(input.wasPressed("right")) - Number(input.wasPressed("left"))
    if (delta !== 0) return change(delta < 0 ? -1 : 1)
    const next = moveCursor(screen.row, rows.length, input)
    return next === screen.row ? screen : { ...screen, row: next }
}

function runAction(screen: SettingsScreen, action: SettingsAction): Screen {
    switch (action) {
        case "back":
            return screen.back
        case "controls":
            return {
                kind: "controls",
                mode: screen.mode,
                back: screen,
                player: 0,
                row: 0,
                settings: screen.settings,
            }
        default: {
            const unhandled: never = action
            throw new Error(`Unknown settings action: ${String(unhandled)}`)
        }
    }
}

// See the top of this file. Player 1 drives it.
function updateControls(screen: ControlsScreen, input: TickInput): Screen {
    const row = CONTROLS_ROWS[screen.row]
    if (screen.capturing) {
        const { key, button, cancel } = input.captured?.() ?? {}
        const stop: Screen = { ...screen, capturing: false }
        if (cancel) return stop
        const bind = (target: string | number): Screen => {
            if (row.kind !== "key" && row.kind !== "pad") return stop
            const bindings = bindingsOf(screen.settings)
            const next = rebind(bindings, screen.player, row.action, target)
            return next === bindings
                ? stop
                : { ...stop, settings: { ...screen.settings, bindings: next } }
        }
        if (row.kind === "pad") {
            return button === undefined ? screen : bind(button)
        }
        if (key !== undefined) return bind(key)
        return button === undefined ? screen : stop
    }
    const back = (): Screen => ({ ...screen.back, settings: screen.settings })
    if (input.wasPressed("pause")) return back()
    if (input.wasPressed("confirm")) {
        switch (row.kind) {
            case "back":
                return back()
            case "reset": {
                if (!("bindings" in screen.settings)) return screen
                const { bindings: _, ...settings } = screen.settings
                return { ...screen, settings }
            }
            default:
                return { ...screen, capturing: true }
        }
    }
    const player = moveAcross(screen.player, CONTROLS_PLAYERS, input, 0)
    if (player !== screen.player) return { ...screen, player }
    const next = moveCursor(screen.row, CONTROLS_ROWS.length, input)
    return next === screen.row ? screen : { ...screen, row: next }
}

// The controls screen shows both players' bindings, whatever the mode.
const CONTROLS_PLAYERS = 2

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
// stage starts once every player is ready. Back takes that player's
// confirmation back or, if it hasn't confirmed, returns to stage select on
// the same stage. A player pressing both confirm and back on one tick
// confirms. Players are handled in order, player 1 first, so on a tick
// where both act, player 1's back to stage select wins over anything
// player 2 does.
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
    // The game plays by the saved Players setting (KDA-262) as it is on
    // each tick, so a change made from pause applies once play resumes.
    screen.game.playersBump = (deps.settings ?? defaultSettings()).playersBump
    const stepGame = deps.step ?? step
    const count = screen.game.players.length
    const moves =
        count === 1
            ? input.move()
            : Array.from({ length: count }, (_, i) => input.move(i))
    const outcome = stepGame(screen.game, deps.dt, moves, deps.random)
    if (!outcome) return screen
    const { mode, level, animals, game, match } = screen
    return {
        kind: "ending",
        mode,
        level,
        animals,
        game,
        outcome,
        ...(match ? { match } : {}),
    }
}

function endScreen(
    screen: Extract<Screen, { kind: "ending" }>,
    levels: readonly Level[]
): Screen {
    if (screen.mode === "versus") return versusRoundEnd(screen)
    const { mode, level, animals, game } = screen
    const choice = END_CHOICES[0]
    const shown = { seconds: 0 }
    if (screen.outcome !== "won") {
        return { kind: "gameOver", mode, level, animals, game, choice, shown }
    }
    const rating = rateClear(game, levels[level].parTime)
    return {
        kind: "stageClear",
        mode,
        level,
        animals,
        game,
        choice,
        rating,
        shown,
    }
}

function updateEnd(
    screen: Extract<Screen, { kind: "stageClear" | "gameOver" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    const ready = confirmReady(screen.shown, deps.dt)
    if (ready && input.wasPressed("confirm")) {
        return screen.choice === "retry"
            ? startLevel(deps.levels, screen.level, screen.animals, screen.mode)
            : { kind: "stageSelect", mode: screen.mode, selected: screen.level }
    }
    const index = END_CHOICES.indexOf(screen.choice)
    const next = moveCursor(index, END_CHOICES.length, input)
    return next === index ? screen : { ...screen, choice: END_CHOICES[next] }
}

// A versus round is over (the stage is cleared; a versus game is never
// lost): add its result to the match and show it, or the match's result
// once a player has won enough rounds.
function versusRoundEnd(screen: Extract<Screen, { kind: "ending" }>): Screen {
    const { mode, level, animals, game } = screen
    const match = [...(screen.match ?? []), roundResult(game)]
    const shown = { seconds: 0 }
    const winner = matchWinner(match)
    if (winner === null) {
        const choice = ROUND_CHOICES[0]
        return {
            kind: "roundResult",
            mode,
            level,
            animals,
            game,
            match,
            choice,
            shown,
        }
    }
    return {
        kind: "matchResult",
        mode,
        level,
        animals,
        game,
        match,
        winner,
        choice: END_CHOICES[0],
        shown,
    }
}

// Whether a screen with `shown` takes confirm yet (see END_CONFIRM_DELAY),
// counting this tick.
function confirmReady(shown: ShownFor | undefined, dt: number): boolean {
    if (!shown) return true
    shown.seconds += dt
    // The epsilon absorbs float drift from summing dt.
    return shown.seconds >= END_CONFIRM_DELAY - 1e-9
}

// Next round plays the next round of the match: a fresh copy of the same
// stage, with the same characters. Quit drops the match and goes to stage
// select, still in versus.
function updateRoundResult(
    screen: Extract<Screen, { kind: "roundResult" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    const ready = confirmReady(screen.shown, deps.dt)
    if (ready && input.wasPressed("confirm")) {
        const { level, animals, mode, match } = screen
        return screen.choice === "nextRound"
            ? startLevel(deps.levels, level, animals, mode, match)
            : { kind: "stageSelect", mode, selected: level }
    }
    const index = ROUND_CHOICES.indexOf(screen.choice)
    const next = moveCursor(index, ROUND_CHOICES.length, input)
    return next === index ? screen : { ...screen, choice: ROUND_CHOICES[next] }
}

// Like the end screens: Retry is a rematch (a new match, same stage and
// characters), Stage select goes back to it.
function updateMatchResult(
    screen: Extract<Screen, { kind: "matchResult" }>,
    input: TickInput,
    deps: FlowDeps
): Screen {
    const ready = confirmReady(screen.shown, deps.dt)
    if (ready && input.wasPressed("confirm")) {
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

// The screen shown under this one: for settings (and the controls screen
// over them), the screen they were opened over (the title, or the paused
// game); otherwise the screen itself.
export function baseScreen(screen: Screen): Screen {
    if (screen.kind === "controls") return baseScreen(screen.back)
    return screen.kind === "settings" ? screen.back : screen
}

// The settings a settings or controls screen carries, as changed so far;
// undefined on other screens.
export function screenSettings(screen: Screen): Settings | undefined {
    return screen.kind === "settings" || screen.kind === "controls"
        ? screen.settings
        : undefined
}

// The game shown on this screen (or under it), if any.
export function gameOf(screen: Screen): GameState | undefined {
    const base = baseScreen(screen)
    return "game" in base ? base.game : undefined
}
