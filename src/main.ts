import { TICK_MS } from "./constants"
import {
    checkEnd,
    createGameState,
    movePlayer,
    tick,
    type GameState,
    type Outcome,
} from "./game"
import {
    directionStep,
    InputState,
    isDirection,
    KeyboardSource,
    type Action,
} from "./input"
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

// Player 1's presses: move one cell per press during play, and restart on
// confirm (Space) once the game has ended.
function onPress(player: number, action: Action) {
    if (!state || player !== 0) return
    if (state.locked) {
        if (action === "confirm") {
            hideMessage()
            init()
        }
        return
    }
    if (!isDirection(action)) return
    if (!movePlayer(state, directionStep(action))) return
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

// Event-driven until the tick loop polls the input instead.
const input = new InputState()
input.onPress((player, action) => {
    onPress(player, action)
    input.endTick()
})
new KeyboardSource().attach(input)
init()
