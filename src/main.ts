import { MAX_FRAME_MS, TICK_MS } from "./constants"
import { createGameState, step, type GameState, type Outcome } from "./game"
import { InputState, KeyboardSource, type Action } from "./input"
import { createLoop } from "./loop"
import { createRenderer } from "./render"
import { celebrate, displayMessage, hideMessage } from "./ui"

let state: GameState = createGameState()

const canvas = document.getElementById("game")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("No #game canvas")
const renderer = createRenderer(canvas)
addEventListener("resize", () => renderer.resize())

const input = new InputState()
const player1 = input.player(0)

const loop = createLoop({
    update,
    render,
    stepMs: TICK_MS,
    maxFrameMs: MAX_FRAME_MS,
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
})

// One logic tick: read player 1's movement, advance the game, then clear this
// tick's press edges.
function update(dt: number) {
    const move = { held: player1.heldSteps(), pressed: player1.pressedStep() }
    endGame(step(state, dt, move, Math.random))
    input.endTick()
}

function render(alpha: number) {
    renderer.draw(state, alpha)
}

function start() {
    // Presses made while the loop wasn't ticking don't carry into play.
    input.endTick()
    loop.start()
    renderer.draw(state, 0)
}

function endGame(outcome: Outcome | null) {
    if (!outcome) return
    loop.stop()
    if (outcome === "won") celebrate(10)
    displayMessage(outcome === "dead")
}

// The loop stops after game over and doesn't tick while paused, so pause and
// restart react to presses as they happen instead of being polled.
function onPress(player: number, action: Action) {
    if (player !== 0) return
    if (state.locked) {
        if (action === "confirm") {
            hideMessage()
            state = createGameState()
            start()
        }
        return
    }
    if (action === "pause") {
        if (loop.paused) {
            // Presses made while paused don't carry into play.
            input.endTick()
            loop.resume()
        } else {
            loop.pause()
        }
    }
}

input.onPress(onPress)
new KeyboardSource().attach(input)
start()
