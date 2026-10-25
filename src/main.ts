import { TICK_MS } from "./constants"
import {
    checkEnd,
    createGameState,
    movePlayer,
    tick,
    type GameState,
    type Outcome,
} from "./game"
import { keyToStep, shouldRestart } from "./input"
import { draw } from "./render"
import { celebrate, displayMessage, hideMessage } from "./ui"

let state: GameState | undefined

function init() {
    if (state?.intervalId) {
        clearInterval(state.intervalId)
    }
    state = createGameState()
    state.intervalId = setInterval(onInterval, TICK_MS)
    draw(state)
}

// The only keydown handler: moves the player during play, and restarts on
// Space once the game has ended.
function onKeyDown(event: KeyboardEvent) {
    if (!state) return
    if (state.locked) {
        if (shouldRestart(state, event)) {
            hideMessage()
            init()
        }
        return
    }
    if (!movePlayer(state, keyToStep(event.key))) return
    endGame(state, checkEnd(state))
    draw(state)
}

function onInterval() {
    if (!state) return
    endGame(state, tick(state, Math.random))
    draw(state)
}

function endGame(state: GameState, outcome: Outcome | null) {
    if (!outcome) return
    if (outcome === "won") celebrate(10)
    clearInterval(state.intervalId)
    displayMessage(outcome === "dead")
}

addEventListener("keydown", onKeyDown)
init()
