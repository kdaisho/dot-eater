import { MAX_FRAME_MS, TICK_MS } from "./constants"
import {
    END_CHOICES,
    gameOf,
    initialScreen,
    update,
    type EndChoice,
    type Screen,
} from "./flow"
import { InputState, KeyboardSource } from "./input"
import { levels } from "./levels"
import { createLoop } from "./loop"
import { createRenderer } from "./render"
import {
    celebrate,
    hideOverlay,
    showGameOver,
    showPause,
    showStageClear,
    showStageSelect,
    showTitle,
    type EndScreenView,
} from "./ui"

let screen: Screen = initialScreen()

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
    }),
}

// The loop ticks on every screen; menus and pause poll their input per tick
// like play does. Only `playing` steps the game.
const loop = createLoop({
    update: tick,
    render,
    stepMs: TICK_MS,
    maxFrameMs: MAX_FRAME_MS,
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
})

// One logic tick: advance the screen machine with player 1's input, then
// clear this tick's press edges, so a press is seen by exactly one tick (and
// one screen).
function tick(dt: number) {
    const next = update(screen, tickInput, {
        levels,
        dt,
        random: Math.random,
    })
    input.endTick()
    if (next !== screen) enter(screen, next)
}

function enter(prev: Screen, next: Screen) {
    screen = next
    if (next.kind === "stageClear" && prev.kind === "playing") celebrate(10)
    showOverlay(next)
}

// Interpolation only moves on during play; other screens with a game keep
// the last picture still. Screens without one (title, stage select) show an
// empty canvas rather than the previous game's board.
let lastAlpha = 0

function render(alpha: number) {
    const game = gameOf(screen)
    if (!game) return renderer.clear()
    if (screen.kind === "playing") lastAlpha = alpha
    renderer.draw(game, lastAlpha)
}

function showOverlay(s: Screen) {
    switch (s.kind) {
        case "title":
            return showTitle()
        case "stageSelect":
            return showStageSelect(
                levels.map((level) => level.name),
                s.selected
            )
        case "playing":
            return hideOverlay()
        case "paused":
            return showPause()
        case "stageClear":
            return showStageClear(endView(s.choice))
        case "gameOver":
            return showGameOver(endView(s.choice))
    }
}

const END_LABELS = { retry: "Retry", stageSelect: "Stage select" } as const

function endView(choice: EndChoice): EndScreenView {
    return {
        items: END_CHOICES.map((c) => ({
            label: END_LABELS[c],
            selected: c === choice,
        })),
    }
}

new KeyboardSource().attach(input)
showOverlay(screen)
loop.start()
