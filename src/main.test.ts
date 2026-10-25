// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { TICK_MS } from "./constants"
import { createGameState, tick, type GameState } from "./game"

// canvas-confetti touches a 2D canvas context on import, which happy-dom
// doesn't provide.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// Keep the real game, but let the test decide when the next tick ends it.
let endOnNextTick = false
vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return {
        ...actual,
        createGameState: vi.fn(actual.createGameState),
        tick: vi.fn((state: GameState) => {
            if (!endOnNextTick) return null
            endOnNextTick = false
            state.locked = true
            return "dead"
        }),
    }
})

function press(key: string, repeat = false) {
    dispatchEvent(new KeyboardEvent("keydown", { key, repeat }))
}

function gameOver() {
    endOnNextTick = true
    vi.advanceTimersByTime(TICK_MS)
    expect(document.querySelectorAll("#msg")).toHaveLength(1)
}

const starts = () => vi.mocked(createGameState).mock.calls.length

describe("main key handler", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        document.body.innerHTML = '<div id="root"></div>'
        await import("./main")
        expect(starts()).toBe(1)
    })

    it("restarts exactly once per Space after several game-overs", () => {
        for (let i = 0; i < 3; i++) {
            gameOver()
            const before = starts()
            press(" ")
            expect(starts()).toBe(before + 1)
            expect(document.querySelector("#msg")).toBeNull()
            expect(document.querySelector("#backdrop")).toBeNull()
        }
    })

    it("does nothing on Space during play", () => {
        const before = starts()
        press(" ")
        expect(starts()).toBe(before)
        expect(document.querySelector("#msg")).toBeNull()
    })

    it("ignores other keys and auto-repeated Space after the game ends", () => {
        gameOver()
        const before = starts()
        press("ArrowUp")
        press(" ", true)
        expect(starts()).toBe(before)
        expect(document.querySelector("#msg")).not.toBeNull()
        press(" ")
        expect(starts()).toBe(before + 1)
    })

    it("stops ticking once the game has ended", () => {
        gameOver()
        const ticks = vi.mocked(tick).mock.calls.length
        vi.advanceTimersByTime(TICK_MS * 5)
        expect(vi.mocked(tick).mock.calls.length).toBe(ticks)
        press(" ")
    })
})
