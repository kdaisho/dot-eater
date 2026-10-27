import { energyHud } from "./breath"
import { MAX_FRAME_MS, TICK_MS } from "./constants"
import {
    END_CHOICES,
    gameOf,
    initialScreen,
    pauseIfPlaying,
    update,
    type EndChoice,
    type Screen,
} from "./flow"
import type { GameState } from "./game"
import { browserPadList, GamepadSource, type PadChange } from "./gamepad"
import { InputState, KeyboardSource } from "./input"
import { loadLastPick, saveLastPick } from "./lastPick"
import { levels } from "./levels"
import { createLoop } from "./loop"
import {
    loadProgress,
    recordClear,
    stageSlots,
    type Progress,
} from "./progress"
import { createRenderer } from "./render"
import { ANIMAL_IDS, ANIMALS, type AnimalId } from "./roster"
import {
    burst,
    celebrate,
    hideOverlay,
    hideToast,
    showCharacterSelect,
    showGameOver,
    showPause,
    showStageClear,
    showStageSelect,
    showTitle,
    showToast,
    type EndScreenView,
} from "./ui"

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

const canvas = document.getElementById("game")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("No #game canvas")
const renderer = createRenderer(canvas)
addEventListener("resize", () => renderer.resize())

const input = new InputState()
const player1 = input.player(0)
const tickInput = {
    wasPressed: player1.wasPressed.bind(player1),
    move: () => ({
        held: player1.heldSteps(),
        pressed: player1.pressedStep(),
        breath: player1.wasPressed("breath"),
    }),
}

// Gamepads: in one-player play every pad drives player 1, alongside the
// keyboard. A pad in use lost mid-game pauses it, like leaving the window;
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
pads.setAssignment("shared")
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
// at once, mid-game.
function tick(dt: number) {
    const boss = gameOf(screen)?.boss
    const wasDefeated = boss?.defeated ?? true
    const next = update(screen, tickInput, {
        levels,
        progress,
        lastAnimal,
        dt,
        random: Math.random,
    })
    input.endTick()
    if (boss && !wasDefeated && boss.defeated) burst()
    if (next !== screen) enter(screen, next)
}

function enter(prev: Screen, next: Screen) {
    screen = next
    // Play started from a menu (character select or Retry): a direction
    // still held from the menu waits for a fresh press. Resuming from pause
    // keeps held directions, so holding through a pause carries on moving.
    if (next.kind === "playing" && prev.kind !== "paused") input.ignoreHeld()
    if (next.kind === "playing" && prev.kind === "characterSelect") {
        lastAnimal = next.animal
        saveLastPick(storage, lastAnimal)
    }
    if (next.kind === "stageClear" && prev.kind === "ending") {
        const { stars, ticks } = next.rating
        progress = recordClear(progress, storage, next.level, { stars, ticks })
        celebrate(10)
    }
    showOverlay(next)
}

// Interpolation only moves on during play and the ending outro (where the
// glides finish); other screens with a game keep the last picture still. Screens without one (title, stage select) show an
// empty canvas rather than the previous game's board.
let lastAlpha = 0

function render(alpha: number) {
    const game = gameOf(screen)
    if (!game) return renderer.clear()
    if (screen.kind === "playing" || screen.kind === "ending") {
        lastAlpha = alpha
    }
    // Every screen with a game also says which level it is.
    const rules = "level" in screen ? levels[screen.level]?.rules : undefined
    renderer.draw(
        game,
        lastAlpha,
        { score: game.score, lives: game.lives, energy: energyHud(game) },
        rules
    )
}

function showOverlay(s: Screen) {
    switch (s.kind) {
        case "title":
            return showTitle()
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
                s.picks[0]
            )
        case "playing":
        case "ending":
            return hideOverlay()
        case "paused":
            return showPause()
        case "stageClear":
            return showStageClear({
                ...endView(s.game, s.choice),
                rating: s.rating,
            })
        case "gameOver":
            return showGameOver(endView(s.game, s.choice))
    }
}

const END_LABELS = { retry: "Retry", stageSelect: "Stage select" } as const

function endView(game: GameState, choice: EndChoice): EndScreenView {
    return {
        score: game.score,
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

new KeyboardSource().attach(input)
pads.attach(input)
showOverlay(screen)
loop.start()
