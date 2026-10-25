// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import confetti from "canvas-confetti"
import { TICK_MS } from "./constants"
import {
    createGameState,
    movePlayer,
    tick,
    type GameState,
    type Outcome,
} from "./game"
import { vec2 } from "./vec2"

// canvas-confetti touches a 2D canvas context on import, which happy-dom
// doesn't provide.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// Keep the real game, but let the test decide when the next tick ends it, and
// how.
let nextOutcome: Outcome | null = null
vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return {
        ...actual,
        createGameState: vi.fn(actual.createGameState),
        movePlayer: vi.fn(actual.movePlayer),
        tick: vi.fn((state: GameState) => {
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

function gameOver(outcome: Outcome = "dead") {
    nextOutcome = outcome
    vi.advanceTimersByTime(TICK_MS)
    expect(document.querySelectorAll("#msg")).toHaveLength(1)
}

const starts = () => vi.mocked(createGameState).mock.calls.length

// Every keydown listener added to the window, to catch listeners piling up.
// (vi.spyOn doesn't see main's import-time call, so wrap it by hand.)
const keydownListeners = new Set<unknown>()

describe("main key handler", () => {
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
    // each test during play so they don't depend on the order they run in.
    beforeEach(() => {
        if (document.querySelector("#msg")) press("Space")
        expect(document.querySelector("#msg")).toBeNull()
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

    it("ignores other keys and auto-repeated Space after the game ends", () => {
        gameOver()
        const before = starts()
        press("ArrowUp")
        press("Enter")
        keydown("Space", true)
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

    it("moves the player one cell per arrow press, ignoring auto-repeat", () => {
        vi.mocked(movePlayer).mockClear()
        keydown("ArrowRight")
        keydown("ArrowRight", true)
        keydown("ArrowRight", true)
        keyup("ArrowRight")
        press("ArrowUp")
        press("KeyW")
        expect(
            vi.mocked(movePlayer).mock.calls.map(([, step]) => step)
        ).toEqual([vec2(1, 0), vec2(0, -1)])
    })

    it("stops ticking once the game has ended", () => {
        gameOver()
        const ticks = vi.mocked(tick).mock.calls.length
        vi.advanceTimersByTime(TICK_MS * 5)
        expect(vi.mocked(tick).mock.calls.length).toBe(ticks)
    })

    it("fires the full confetti on every win and none on a loss", () => {
        const bursts = () => {
            // Let any running celebration finish first.
            vi.advanceTimersByTime(TICK_MS)
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
