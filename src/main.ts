import { TICK_MS } from "./constants"
import {
    checkEnd,
    createGameState,
    movePlayer,
    tick,
    type GameState,
    type Outcome,
} from "./game"
import { keyToStep } from "./input"
import { draw } from "./render"
import { celebrate, displayMessage } from "./ui"

let state: GameState | undefined

function init() {
    if (state?.intervalId) {
        clearInterval(state.intervalId)
    }
    state = createGameState()
    state.intervalId = setInterval(onInterval, TICK_MS)
    // Same function reference every time, so the listener is only added once.
    addEventListener("keydown", onKeyDown)
    draw(state)
}

function onKeyDown(event: KeyboardEvent) {
    if (!state) return
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
    displayMessage(outcome === "dead", init)
}

init()
