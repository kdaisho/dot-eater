import { energyHud } from "./breath"
import { MAX_FRAME_MS, TICK_MS } from "./constants"
import { applyMotion, effectsForEvents } from "./eventEffects"
import { takeEvents, type GameEvent } from "./events"
import {
    baseScreen,
    END_CHOICES,
    ROUND_CHOICES,
    gameOf,
    initialScreen,
    PAUSE_CHOICES,
    pauseIfPlaying,
    playerCount,
    recordsProgress,
    settingsContext,
    TITLE_CHOICES,
    update,
    type EndChoice,
    type FlowDeps,
    type Mode,
    type Screen,
    type TickInput,
    type TitleChoice,
} from "./flow"
import { totalScore, type GameState } from "./game"
import {
    browserPadList,
    GamepadSource,
    type PadAssignment,
    type PadChange,
} from "./gamepad"
import {
    InputState,
    KeyboardSource,
    PLAYER_1_KEYS,
    PLAYER_2_KEYS,
} from "./input"
import { loadLastPick, saveLastPick } from "./lastPick"
import { levels } from "./levels"
import { createLoop } from "./loop"
import {
    loadProgress,
    recordClear,
    stageSlots,
    type Progress,
} from "./progress"
import { createParticles } from "./particles"
import { createRenderer, type Effects, type Hud } from "./render"
import { ANIMAL_IDS, ANIMALS, type AnimalId } from "./roster"
import { loadSettings, saveSettings, type Settings } from "./settings"
import { rowValue, settingsRows } from "./settingsMenu"
import { createShake } from "./shake"
import {
    burst,
    celebrate,
    hideOverlay,
    hideToast,
    showCharacterSelect,
    showGameOver,
    showMatchResult,
    showPause,
    showRoundResult,
    showSettings,
    showStageClear,
    showStageSelect,
    showTitle,
    showToast,
    type EndScreenView,
} from "./ui"
import { roundWins, stunned, tallyText } from "./versus"

let screen: Screen = initialScreen()

// Even reading window.localStorage can throw (e.g. when site data is
// blocked); the game then runs with progress kept for this session only.
function browserStorage(): Storage | undefined {
    try {
        return window.localStorage
    } catch {
        return undefined
    }
}
const storage = browserStorage()
let progress: Progress = loadProgress(storage)
// Kept here too, so the last pick holds for the session if saving fails.
let lastAnimal: AnimalId = loadLastPick(storage)
// Likewise the settings: saved on every change on the settings screen.
let settings: Settings = loadSettings(storage)

// The system's reduced motion setting, read as it is now on every tick (it
// can change while the game runs), and whether this is a touch device:
// what some settings depend on (see SettingsContext).
function mediaQuery(query: string): MediaQueryList | undefined {
    try {
        return window.matchMedia(query)
    } catch {
        return undefined
    }
}
const reducedMotion = mediaQuery("(prefers-reduced-motion: reduce)")
const touch = navigator.maxTouchPoints > 0

const canvas = document.getElementById("game")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("No #game canvas")
const renderer = createRenderer(canvas)
addEventListener("resize", () => renderer.resize())

// Particles and screen shake (KDA-213): visual only, never read by the
// game. They move on with the game's ticks (so they freeze while paused),
// start over with each game, and show only while it is played, paused or
// ending. With reduced motion there is no shake and particles are fewer and
// shorter; the Screen shake setting, when set, overrides the shake part.
const particles = createParticles({ random: Math.random })
const shake = createShake()
const effects = {
    // Follow reduced motion and the Screen shake setting: on load, when the
    // settings change and when the system setting does.
    motion() {
        const reduced = reducedMotion?.matches ?? false
        applyMotion({ particles, shake }, settings, reduced)
    },
    // The bursts and shakes for a tick's game events (see eventEffects.ts).
    events(events: readonly GameEvent[], game: GameState) {
        effectsForEvents(events, game, { particles, shake })
    },
    tick(dt: number) {
        if (screen.kind !== "playing" && screen.kind !== "ending") return
        particles.update(dt)
        shake.update(dt)
    },
    reset() {
        particles.clear()
        shake.clear()
    },
    of(s: Screen): Effects {
        if (
            s.kind !== "playing" &&
            s.kind !== "ending" &&
            s.kind !== "paused"
        ) {
            return {}
        }
        const moving = s.kind !== "paused"
        return {
            particles: particles.list,
            ...(moving ? { shake: shake.offset(Math.random) } : {}),
        }
    },
}
effects.motion()
reducedMotion?.addEventListener?.("change", () => effects.motion())

const input = new InputState()
// Each player's input, by index (player 1 is 0): flow asks for player 2's
// only in a 2-player mode.
const tickInput: TickInput = {
    wasPressed: (action, player = 0) => input.player(player).wasPressed(action),
    move: (player = 0) => {
        const p = input.player(player)
        return {
            held: p.heldSteps(),
            pressed: p.pressedStep(),
            breath: p.wasPressed("breath"),
        }
    },
}

// Gamepads: in one-player play every pad drives player 1, alongside the
// keyboard; in a 2-player mode the first pad connected drives player 1 and
// the second player 2 (see padAssignment). A pad in use lost mid-game pauses it, like leaving the window;
// an idle pad going to sleep doesn't. Set up before the loop, whose frames
// poll it. (Toasts and auto-pause only run on events, after startup.)
const TOAST_MS = 2000
let toastTimer: ReturnType<typeof setTimeout> | undefined
function onPadChange(change: PadChange) {
    showToast(
        change.kind === "connected"
            ? "Controller connected"
            : "Controller disconnected"
    )
    clearTimeout(toastTimer)
    toastTimer = setTimeout(hideToast, TOAST_MS)
    if (change.kind === "disconnected" && change.wasUsed) autoPause()
}
const pads = new GamepadSource(
    browserPadList(navigator),
    globalThis,
    onPadChange
)
pads.setAssignment(padAssignment(screen))
let padPollFailed = false

// The loop ticks on every screen; menus and pause poll their input per tick
// like play does. Only `playing` steps the game.
const loop = createLoop({
    update: tick,
    render,
    stepMs: TICK_MS,
    maxFrameMs: MAX_FRAME_MS,
    now: () => performance.now(),
    // Pads are polled once per frame, before the frame's ticks read input.
    // A throw from a bad pad entry must not stop the frame: the loop asks
    // for the next frame from within this one.
    requestFrame: (callback) =>
        requestAnimationFrame(() => {
            try {
                pads.poll()
            } catch (error) {
                // Once, not every frame.
                if (!padPollFailed) console.error(error)
                padPollFailed = true
            }
            callback()
        }),
    cancelFrame: (id) => cancelAnimationFrame(id),
})

// One logic tick: advance the screen machine with player 1's input, then
// clear this tick's press edges, so a press is seen by exactly one tick (and
// one screen). A boss defeated during the tick gets its burst of confetti
// at once, mid-game. What the game step reported goes to onGameEvents.
function tick(dt: number) {
    const game = gameOf(screen)
    const boss = game?.boss
    const wasDefeated = boss?.defeated ?? true
    const next = update(screen, tickInput, flowDeps(dt))
    input.endTick()
    if (game) onGameEvents(takeEvents(game), game)
    if (boss && !wasDefeated && boss.defeated) burst()
    if (next !== screen) enter(screen, next)
    effects.tick(dt)
}

function flowDeps(dt: number): FlowDeps {
    return {
        levels,
        progress,
        lastAnimal,
        dt,
        random: Math.random,
        settings,
        touch,
        prefersReducedMotion: reducedMotion?.matches ?? false,
    }
}

// What happened in the tick's game step, if it stepped the game (see
// events.ts); empty otherwise. Sound (KDA-212) and particles and screen
// shake (KDA-213) hook in here.
function onGameEvents(events: readonly GameEvent[], game: GameState) {
    effects.events(events, game)
}

// How pads map to players on a screen. The title, where the mode is still
// being chosen, shares every pad with player 1, so any pad can pick the
// mode (and go back to 1 player). From stage select on, a 2-player mode
// gives each pad its own player, so player 2's pad picks its character.
// Settings follow the screen they were opened over.
function padAssignment(shown: Screen): PadAssignment {
    const screen = baseScreen(shown)
    return screen.kind !== "title" && playerCount(screen.mode) > 1
        ? "perPad"
        : "shared"
}

function enter(prev: Screen, next: Screen) {
    screen = next
    pads.setAssignment(padAssignment(next))
    // Play started from a menu (character select or Retry): a direction
    // still held from the menu waits for a fresh press. Resuming from pause
    // keeps held directions, so holding through a pause carries on moving.
    // A new game also starts with no particles or shake left over.
    if (next.kind === "playing" && prev.kind !== "paused") {
        input.ignoreHeld()
        effects.reset()
    }
    // Only 1-player games remember the pick: 2-player games leave saved
    // data alone.
    if (
        next.kind === "playing" &&
        prev.kind === "characterSelect" &&
        playerCount(next.mode) === 1
    ) {
        lastAnimal = next.animals[0]
        saveLastPick(storage, lastAnimal)
    }
    if (next.kind === "stageClear" && prev.kind === "ending") {
        // 2-player games leave saved progress alone.
        if (recordsProgress(next.mode)) {
            const { stars, ticks } = next.rating
            progress = recordClear(progress, storage, next.level, {
                stars,
                ticks,
            })
        }
        celebrate(10)
    }
    if (next.kind === "matchResult" && prev.kind === "ending") celebrate(10)
    // Every change on the settings screen is saved at once.
    if (next.kind === "settings" && next.settings !== settings) {
        settings = next.settings
        saveSettings(storage, settings)
        effects.motion()
    }
    showOverlay(next)
}

// Interpolation only moves on during play and the ending outro (where the
// glides finish); other screens with a game keep the last picture still. Screens without one (title, stage select) show an
// empty canvas rather than the previous game's board.
let lastAlpha = 0

function render(alpha: number) {
    // Settings over a paused game show that game behind them.
    const shown = baseScreen(screen)
    const game = gameOf(shown)
    if (!game) return renderer.clear()
    if (shown.kind === "playing" || shown.kind === "ending") {
        lastAlpha = alpha
    }
    // Every screen with a game also says which level it is.
    const rules = "level" in shown ? levels[shown.level]?.rules : undefined
    const hud = game.mode === "versus" ? versusHud(game, shown) : hudOf(game)
    renderer.draw(game, lastAlpha, hud, rules, effects.of(shown))
}

// The versus HUD: each player's dots, meter, stun or respawn countdown, and
// the round tally (no lives). The result screens keep showing the round
// just played as it was during play.
function versusHud(game: GameState, s: Screen): Hud {
    const match =
        s.kind === "roundResult" || s.kind === "matchResult"
            ? s.match.slice(0, -1)
            : "match" in s
              ? (s.match ?? [])
              : []
    return {
        round: tallyText(match),
        players: game.players.map((p, i) => ({
            score: p.score,
            dots: p.dots,
            energy: energyHud(game, i),
            ...(p.out ? { out: { respawnIn: p.respawnIn } } : {}),
            ...(stunned(p) ? { stunned: p.stunnedFor } : {}),
        })),
    }
}

// The HUD: with one player its score and meter; with two, each one's.
function hudOf(game: GameState): Hud {
    if (game.players.length === 1) {
        return {
            score: totalScore(game),
            lives: game.lives,
            energy: energyHud(game),
        }
    }
    return {
        lives: game.lives,
        players: game.players.map((p, i) => ({
            score: p.score,
            energy: energyHud(game, i),
            ...(p.out ? { out: { respawnIn: p.respawnIn } } : {}),
        })),
    }
}

function showOverlay(s: Screen) {
    switch (s.kind) {
        case "title": {
            const current: TitleChoice = s.onSettings ? "settings" : s.mode
            return showTitle(
                TITLE_CHOICES.map((choice) => ({
                    label: TITLE_LABELS[choice],
                    selected: choice === current,
                }))
            )
        }
        case "settings": {
            const context = settingsContext(s, flowDeps(0))
            return showSettings(
                settingsRows(context).map((row, i) => {
                    const value = rowValue(row, s.settings, context)
                    return {
                        label: row.label,
                        ...(value === undefined ? {} : { value }),
                        selected: i === s.row,
                    }
                })
            )
        }
        case "stageSelect":
            return showStageSelect(
                stageSlots(
                    progress,
                    levels.map((level) => level.name)
                ),
                s.selected
            )
        case "characterSelect":
            return showCharacterSelect(
                ANIMAL_IDS.map((id) => ANIMALS[id]),
                s.picks,
                s.ready
            )
        case "playing":
        case "ending":
            return hideOverlay()
        case "paused":
            return showPause(
                s.game.players.length,
                PAUSE_CHOICES.map((c) => ({
                    label: PAUSE_LABELS[c],
                    selected: c === (s.choice ?? "resume"),
                }))
            )
        case "stageClear":
            return showStageClear({
                ...endView(s.game, s.choice),
                rating: s.rating,
            })
        case "gameOver":
            return showGameOver(endView(s.game, s.choice))
        case "roundResult": {
            const last = s.match[s.match.length - 1]
            return showRoundResult({
                round: s.match.length,
                winner: last.winner,
                dots: last.dots,
                scores: last.scores,
                wins: roundWins(s.match),
                items: ROUND_CHOICES.map((c) => ({
                    label: ROUND_LABELS[c],
                    selected: c === s.choice,
                })),
            })
        }
        case "matchResult":
            return showMatchResult({
                winner: s.winner,
                rounds: s.match,
                wins: roundWins(s.match),
                items: END_CHOICES.map((c) => ({
                    label: MATCH_LABELS[c],
                    selected: c === s.choice,
                })),
            })
    }
}

// The round result's menu: Quit drops the match for stage select.
const ROUND_LABELS = { nextRound: "Next round", quit: "Quit" } as const

// The match result's menu: Retry plays a new match.
const MATCH_LABELS = { retry: "Rematch", stageSelect: "Stage select" } as const

const END_LABELS = { retry: "Retry", stageSelect: "Stage select" } as const

// The mode select's labels, one per mode; the title offers them all, in
// MODE_CHOICES order, then Settings.
const MODE_LABELS: Record<Mode, string> = {
    solo: "1 player",
    coop: "Co-op",
    versus: "Versus",
}

const TITLE_LABELS: Record<TitleChoice, string> = {
    ...MODE_LABELS,
    settings: "Settings",
}

const PAUSE_LABELS = { resume: "Resume", settings: "Settings" } as const

function endView(game: GameState, choice: EndChoice): EndScreenView {
    return {
        score: totalScore(game),
        ...(game.players.length > 1
            ? {
                  playerScores: game.players.map((p) => p.score),
                  playerDots: game.players.map((p) => p.dots),
              }
            : {}),
        items: END_CHOICES.map((c) => ({
            label: END_LABELS[c],
            selected: c === choice,
        })),
    }
}

// Auto-pause: leaving the window or hiding the tab mid-game pauses it, so
// the game doesn't play on unwatched.
function autoPause() {
    const next = pauseIfPlaying(screen)
    if (next !== screen) enter(screen, next)
}
addEventListener("blur", autoPause)
document.addEventListener("visibilitychange", () => {
    if (document.hidden) autoPause()
})

new KeyboardSource([PLAYER_1_KEYS, PLAYER_2_KEYS]).attach(input)
pads.attach(input)
// The (empty) toast live region goes in at once, so screen readers already
// watch it when the first toast shows.
hideToast()
showOverlay(screen)
loop.start()
