import { MAX_FRAME_MS, TICK_MS } from "./constants"
import { createGameState, step, type GameState, type Outcome } from "./game"
import { createLoop } from "./loop"
import { draw } from "./render"
import { celebrate, displayMessage, hideMessage } from "./ui"
import { vec2, type Vec2 } from "./vec2"

let state: GameState = createGameState()

const loop = createLoop({
    update,
    render,
    stepMs: TICK_MS,
    maxFrameMs: MAX_FRAME_MS,
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
})

function update(dt: number) {
    endGame(step(state, dt, playerStep(), Math.random))
}

function render(alpha: number) {
    draw(state, alpha)
}

function start() {
    releaseAll()
    loop.start()
    draw(state, 0)
}

function endGame(outcome: Outcome | null) {
    if (!outcome) return
    loop.stop()
    if (outcome === "won") celebrate(10)
    displayMessage(outcome === "dead")
}

// Temporary held-arrow tracker and pause key, replaced by the KDA-194 input
// action layer. Like its step(), the most recently pressed arrow that is
// still held wins, and a tap released before the next tick still counts once.
const ARROW_STEPS: Record<string, Vec2> = {
    ArrowUp: vec2(0, -1),
    ArrowDown: vec2(0, 1),
    ArrowLeft: vec2(-1, 0),
    ArrowRight: vec2(1, 0),
}
const ARROWS = Object.keys(ARROW_STEPS)
let held: string[] = []
let tapped: Vec2 = vec2(0, 0)

function playerStep(): Vec2 {
    const key = held.at(-1)
    const result = key ? ARROW_STEPS[key] : tapped
    tapped = vec2(0, 0)
    return result
}

function releaseAll() {
    held = []
    tapped = vec2(0, 0)
}

function onKeyDown(event: KeyboardEvent) {
    if (state.locked) {
        if (event.key === " " && !event.repeat) {
            hideMessage()
            state = createGameState()
            start()
        }
        return
    }
    if (ARROWS.includes(event.key)) {
        if (event.repeat) return
        held = [...held.filter((k) => k !== event.key), event.key]
        tapped = ARROW_STEPS[event.key]
        return
    }
    if (
        (event.key.toLowerCase() === "p" || event.key === "Escape") &&
        !event.repeat
    ) {
        if (loop.paused) loop.resume()
        else loop.pause()
    }
}

function onKeyUp(event: KeyboardEvent) {
    held = held.filter((k) => k !== event.key)
}

addEventListener("keydown", onKeyDown)
addEventListener("keyup", onKeyUp)
// Keys released while the window is unfocused never send keyup.
addEventListener("blur", releaseAll)
start()
