// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import confetti from "canvas-confetti"
import { TICK_MS } from "./constants"
import { createGameState, step, type GameState, type Outcome } from "./game"
import { vec2 } from "./vec2"

// canvas-confetti touches a 2D canvas context on import, which happy-dom
// doesn't provide.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// Keep the real game, but let the test decide when the next step ends it, and
// how.
let nextOutcome: Outcome | null = null
vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return {
        ...actual,
        createGameState: vi.fn(actual.createGameState),
        step: vi.fn((state: GameState) => {
            const outcome = nextOutcome
            if (!outcome) return null
            nextOutcome = null
            state.locked = true
            return outcome
        }),
    }
})

function keydown(code: string, repeat = false) {
    dispatchEvent(new KeyboardEvent("keydown", { code, repeat }))
}

function keyup(code: string) {
    dispatchEvent(new KeyboardEvent("keyup", { code }))
}

function press(code: string) {
    keydown(code)
    keyup(code)
}

// Long enough for several frames and logic steps.
const FRAMES_MS = 100

function gameOver(outcome: Outcome = "dead") {
    nextOutcome = outcome
    vi.advanceTimersByTime(FRAMES_MS)
    expect(document.querySelectorAll("#msg")).toHaveLength(1)
}

const starts = () => vi.mocked(createGameState).mock.calls.length
const steps = () => vi.mocked(step).mock.calls.length
// The player step passed to the latest game step.
const lastPlayerStep = () => vi.mocked(step).mock.lastCall?.[2]

// Every keydown listener added to the window, to catch listeners piling up.
// (vi.spyOn doesn't see main's import-time call, so wrap it by hand.)
const keydownListeners = new Set<unknown>()

describe("main", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        document.body.innerHTML = '<div id="root"></div>'
        const realAdd = globalThis.addEventListener.bind(globalThis)
        globalThis.addEventListener = ((
            type: string,
            listener: unknown,
            options?: unknown
        ) => {
            if (type === "keydown") keydownListeners.add(listener)
            return realAdd(type as never, listener as never, options as never)
        }) as typeof addEventListener
        await import("./main")
        expect(starts()).toBe(1)
    })

    // main is imported once, so its state carries over between tests. Start
    // each test during play, unpaused and with no keys held, so they don't
    // depend on the order they run in.
    beforeEach(() => {
        if (document.querySelector("#msg")) press("Space")
        expect(document.querySelector("#msg")).toBeNull()
        for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])
            keyup(key)
        const before = steps()
        vi.advanceTimersByTime(FRAMES_MS)
        if (steps() === before) press("KeyP")
        vi.advanceTimersByTime(FRAMES_MS)
        expect(steps()).toBeGreaterThan(before)
    })

    it("steps the game at the fixed tick rate", () => {
        const before = steps()
        vi.advanceTimersByTime(1000)
        // Frames arrive every ~16 ms, so allow for a step of slack.
        expect(Math.abs(steps() - before - 1000 / TICK_MS)).toBeLessThanOrEqual(
            1
        )
        expect(vi.mocked(step).mock.lastCall?.[1]).toBeCloseTo(TICK_MS / 1000)
    })

    it("passes the most recently pressed held arrow to the game", () => {
        vi.advanceTimersByTime(FRAMES_MS)
        expect(lastPlayerStep()).toEqual(vec2(0, 0))
        keydown("ArrowRight")
        vi.advanceTimersByTime(FRAMES_MS)
        expect(lastPlayerStep()).toEqual(vec2(1, 0))
        keydown("ArrowUp")
        // Auto-repeat doesn't change which arrow is held or newest.
        keydown("ArrowRight", true)
        vi.advanceTimersByTime(FRAMES_MS)
        expect(lastPlayerStep()).toEqual(vec2(0, -1))
        keyup("ArrowUp")
        vi.advanceTimersByTime(FRAMES_MS)
        expect(lastPlayerStep()).toEqual(vec2(1, 0))
        keyup("ArrowRight")
        vi.advanceTimersByTime(FRAMES_MS)
        expect(lastPlayerStep()).toEqual(vec2(0, 0))
    })

    it("counts an arrow tapped between two steps once", () => {
        press("ArrowLeft")
        const before = steps()
        vi.advanceTimersByTime(FRAMES_MS)
        const calls = vi.mocked(step).mock.calls.slice(before)
        expect(calls.map((c) => c[2])).toContainEqual(vec2(-1, 0))
        expect(calls.filter((c) => c[2].x !== 0)).toHaveLength(1)
    })

    it("pauses and resumes on P", () => {
        press("KeyP")
        const paused = steps()
        vi.advanceTimersByTime(1000)
        expect(steps()).toBe(paused)
        press("KeyP")
        vi.advanceTimersByTime(FRAMES_MS)
        expect(steps()).toBeGreaterThan(paused)
        // Time spent paused is not caught up on.
        expect(steps() - paused).toBeLessThan(FRAMES_MS / TICK_MS + 2)
    })

    it("pauses and resumes on Escape", () => {
        press("Escape")
        const paused = steps()
        vi.advanceTimersByTime(1000)
        expect(steps()).toBe(paused)
        press("Escape")
        vi.advanceTimersByTime(FRAMES_MS)
        expect(steps()).toBeGreaterThan(paused)
    })

    it("drops arrow taps made while paused", () => {
        press("KeyP")
        press("ArrowLeft")
        press("KeyP")
        const before = steps()
        vi.advanceTimersByTime(FRAMES_MS)
        const calls = vi.mocked(step).mock.calls.slice(before)
        expect(calls.length).toBeGreaterThan(0)
        expect(calls.every((c) => c[2].x === 0 && c[2].y === 0)).toBe(true)
    })

    it("restarts exactly once per Space after several game-overs", () => {
        for (let i = 0; i < 3; i++) {
            gameOver()
            const before = starts()
            press("Space")
            expect(starts()).toBe(before + 1)
            expect(document.querySelector("#msg")).toBeNull()
            expect(document.querySelector("#backdrop")).toBeNull()
        }
        expect(keydownListeners.size).toBe(1)
    })

    it("does nothing on Space during play", () => {
        const before = starts()
        press("Space")
        expect(starts()).toBe(before)
        expect(document.querySelector("#msg")).toBeNull()
    })

    it("ignores other keys after the game ends", () => {
        gameOver()
        const before = starts()
        press("ArrowUp")
        press("Enter")
        expect(starts()).toBe(before)
        expect(document.querySelector("#msg")).not.toBeNull()
        press("Space")
        expect(starts()).toBe(before + 1)
    })

    it("ignores a Space held through the game-over until it is pressed again", () => {
        keydown("Space")
        gameOver()
        const before = starts()
        keydown("Space", true)
        keydown("Space", true)
        expect(starts()).toBe(before)
        keyup("Space")
        press("Space")
        expect(starts()).toBe(before + 1)
    })

    it("stops stepping once the game has ended, even with an arrow held", () => {
        gameOver()
        const before = steps()
        keydown("ArrowRight")
        vi.advanceTimersByTime(1000)
        expect(steps()).toBe(before)
        keyup("ArrowRight")
    })

    it("steps again after a restart", () => {
        gameOver()
        press("Space")
        const before = steps()
        vi.advanceTimersByTime(FRAMES_MS)
        expect(steps()).toBeGreaterThan(before)
    })

    it("fires the full confetti on every win and none on a loss", () => {
        const bursts = () => {
            // Let any running celebration finish first.
            vi.advanceTimersByTime(1000)
            const n = vi.mocked(confetti).mock.calls.length
            vi.mocked(confetti).mockClear()
            return n
        }
        bursts()

        gameOver("won")
        expect(bursts()).toBe(11)
        press("Space")

        gameOver("dead")
        expect(bursts()).toBe(0)
        press("Space")

        gameOver("won")
        expect(bursts()).toBe(11)
    })
})
