// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import confetti from "canvas-confetti"
import { energyHud } from "./breath"
import { DOT_POINTS, START_LIVES, TICK_MS, TICK_RATE } from "./constants"
import { createGameState, step, type GameState, type Outcome } from "./game"
import { levels } from "./levels"
import {
    emptyProgress,
    isUnlocked,
    markCleared,
    parseProgress,
    PROGRESS_KEY,
    serializeProgress,
    STAGE_COUNT,
} from "./progress"
import { formatTicks, starText } from "./stars"
import { vec2 } from "./vec2"

// canvas-confetti touches a 2D canvas context on import, which happy-dom
// doesn't provide.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// Keep the real renderer, but watch what main asks it to draw.
const drawn = vi.hoisted(() => ({
    draw: 0,
    clear: 0,
    // The arguments of the latest draw.
    last: undefined as unknown[] | undefined,
    // The alpha of every draw.
    alphas: [] as number[],
}))
vi.mock("./render", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./render")>()
    return {
        ...actual,
        createRenderer: (...args: Parameters<typeof actual.createRenderer>) => {
            const renderer = actual.createRenderer(...args)
            return {
                ...renderer,
                draw: (...a: Parameters<typeof renderer.draw>) => {
                    drawn.draw++
                    drawn.last = a
                    drawn.alphas.push(a[1])
                    renderer.draw(...a)
                },
                clear: () => {
                    drawn.clear++
                    renderer.clear()
                },
            }
        },
    }
})

// Keep the real game, but let the test decide when the next step ends it, and
// how.
let nextOutcome: Outcome | null = null
vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return {
        ...actual,
        createGameState: vi.fn(actual.createGameState),
        step: vi.fn(() => {
            const outcome = nextOutcome
            nextOutcome = null
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

// Press a key and let the loop tick it.
function pressAndTick(code: string) {
    press(code)
    vi.advanceTimersByTime(FRAMES_MS)
}

// The screen showing: its overlay's name, or "playing" when there is none.
function screen(): string {
    const overlays = document.querySelectorAll<HTMLElement>("#overlay")
    expect(overlays.length).toBeLessThanOrEqual(1)
    expect(document.querySelectorAll("#backdrop")).toHaveLength(overlays.length)
    return overlays[0]?.dataset.screen ?? "playing"
}

// The selected menu item on the overlay.
const selectedItem = () =>
    document.querySelector("#overlay li.selected")?.textContent

function gameOver(outcome: Outcome = "dead") {
    nextOutcome = outcome
    vi.advanceTimersByTime(FRAMES_MS)
    expect(screen()).toBe(outcome === "won" ? "stage-clear" : "game-over")
}

const starts = () => vi.mocked(createGameState).mock.calls.length
const lastStartedLevel = () => vi.mocked(createGameState).mock.lastCall?.[0]
const steps = () => vi.mocked(step).mock.calls.length
// The player input passed to each game step since call `from`.
const moves = (from = 0) =>
    vi
        .mocked(step)
        .mock.calls.slice(from)
        .map((c) => c[2])
// The held directions passed to the latest game step, newest first.
const lastHeld = () => vi.mocked(step).mock.lastCall?.[2].held
const isZero = (v: { x: number; y: number }) => v.x === 0 && v.y === 0

// Every keydown listener added to the window, to catch listeners piling up.
// (vi.spyOn doesn't see main's import-time call, so wrap it by hand.)
const keydownListeners = new Set<unknown>()

describe("main", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        document.body.innerHTML = '<canvas id="game"></canvas>'
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

        // Opens on the title screen, with no game yet.
        expect(screen()).toBe("title")
        vi.advanceTimersByTime(1000)
        expect(screen()).toBe("title")
        expect(drawn.draw).toBe(0)
        expect(drawn.clear).toBeGreaterThan(0)
        expect(starts()).toBe(0)
        expect(steps()).toBe(0)

        // Space: the stage list, with the first stage selected.
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        expect(selectedItem()).toBe(levels[0].name)
        expect(steps()).toBe(0)

        // Space: play the selected stage.
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        expect(starts()).toBe(1)
        expect(lastStartedLevel()).toBe(levels[0])
        expect(steps()).toBeGreaterThan(0)
    })

    // main is imported once, so its state carries over between tests. Start
    // each test during play, unpaused and with no keys held, so they don't
    // depend on the order they run in.
    beforeEach(() => {
        for (const key of [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Space",
        ]) {
            keyup(key)
        }
        nextOutcome = null
        for (let i = 0; i < 4 && screen() !== "playing"; i++) {
            if (screen() === "pause") {
                pressAndTick("KeyP")
            } else {
                // A menu: pick its first item.
                pressAndTick("ArrowUp")
                pressAndTick("Space")
            }
        }
        expect(screen()).toBe("playing")
        const before = steps()
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

    it("passes the held arrows to the game, newest first", () => {
        vi.advanceTimersByTime(FRAMES_MS)
        expect(lastHeld()).toEqual([])
        keydown("ArrowRight")
        vi.advanceTimersByTime(FRAMES_MS)
        expect(lastHeld()).toEqual([vec2(1, 0)])
        keydown("ArrowUp")
        // Auto-repeat doesn't change which arrow is held or newest.
        keydown("ArrowRight", true)
        vi.advanceTimersByTime(FRAMES_MS)
        expect(lastHeld()).toEqual([vec2(0, -1), vec2(1, 0)])
        keyup("ArrowUp")
        vi.advanceTimersByTime(FRAMES_MS)
        expect(lastHeld()).toEqual([vec2(1, 0)])
        keyup("ArrowRight")
        vi.advanceTimersByTime(FRAMES_MS)
        expect(lastHeld()).toEqual([])
    })

    it("counts an arrow tapped between two steps once", () => {
        press("ArrowLeft")
        const before = steps()
        vi.advanceTimersByTime(FRAMES_MS)
        const pressed = moves(before).map((m) => m.pressed)
        expect(pressed).toContainEqual(vec2(-1, 0))
        expect(pressed.filter((v) => !isZero(v))).toHaveLength(1)
    })

    it("passes a held arrow as pressed only on the tick it went down", () => {
        keydown("ArrowDown")
        const before = steps()
        vi.advanceTimersByTime(FRAMES_MS)
        const pressed = moves(before).map((m) => m.pressed)
        expect(pressed[0]).toEqual(vec2(0, 1))
        expect(pressed.slice(1).every(isZero)).toBe(true)
        expect(lastHeld()).toEqual([vec2(0, 1)])
        keyup("ArrowDown")
    })

    it("passes a breath press (right Shift) to the game on one tick", () => {
        press("ShiftRight")
        const before = steps()
        vi.advanceTimersByTime(FRAMES_MS)
        const breaths = moves(before).map((m) => m.breath)
        expect(breaths.filter(Boolean)).toHaveLength(1)
        expect(breaths[0]).toBe(true)
    })

    it("pauses and resumes on P", () => {
        pressAndTick("KeyP")
        expect(screen()).toBe("pause")
        const paused = steps()
        vi.advanceTimersByTime(1000)
        expect(steps()).toBe(paused)
        pressAndTick("KeyP")
        expect(screen()).toBe("playing")
        expect(steps()).toBeGreaterThan(paused)
        // Time spent paused is not caught up on.
        expect(steps() - paused).toBeLessThan(FRAMES_MS / TICK_MS + 2)
    })

    it("pauses and resumes on Escape", () => {
        pressAndTick("Escape")
        expect(screen()).toBe("pause")
        const paused = steps()
        vi.advanceTimersByTime(1000)
        expect(steps()).toBe(paused)
        pressAndTick("Escape")
        expect(screen()).toBe("playing")
        expect(steps()).toBeGreaterThan(paused)
    })

    it("resumes on Space", () => {
        pressAndTick("KeyP")
        expect(screen()).toBe("pause")
        pressAndTick("Space")
        expect(screen()).toBe("playing")
    })

    it("drops arrow taps made while paused", () => {
        pressAndTick("KeyP")
        press("ArrowLeft")
        press("KeyP")
        const before = steps()
        vi.advanceTimersByTime(FRAMES_MS)
        const calls = moves(before)
        expect(calls.length).toBeGreaterThan(0)
        expect(
            calls.every((m) => m.held.length === 0 && isZero(m.pressed))
        ).toBe(true)
    })

    it("retries exactly once per Space after several game-overs", () => {
        for (let i = 0; i < 3; i++) {
            gameOver()
            expect(selectedItem()).toBe("Retry")
            const before = starts()
            pressAndTick("Space")
            expect(starts()).toBe(before + 1)
            expect(lastStartedLevel()).toBe(levels[0])
            expect(screen()).toBe("playing")
        }
        expect(keydownListeners.size).toBe(1)
    })

    it("does nothing on Space during play", () => {
        const before = starts()
        pressAndTick("Space")
        expect(starts()).toBe(before)
        expect(screen()).toBe("playing")
    })

    it("clears the old board from the canvas on stage select", () => {
        gameOver()
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        drawn.draw = 0
        drawn.clear = 0
        vi.advanceTimersByTime(FRAMES_MS)
        expect(drawn.draw).toBe(0)
        expect(drawn.clear).toBeGreaterThan(0)
    })

    it("pauses when the window loses focus during play", () => {
        dispatchEvent(new Event("blur"))
        expect(screen()).toBe("pause")
        const before = steps()
        vi.advanceTimersByTime(1000)
        expect(steps()).toBe(before)
        pressAndTick("KeyP")
        expect(screen()).toBe("playing")
    })

    it("pauses when the tab is hidden during play", () => {
        const hidden = vi.spyOn(document, "hidden", "get")
        try {
            hidden.mockReturnValue(false)
            document.dispatchEvent(new Event("visibilitychange"))
            expect(screen()).toBe("playing")
            hidden.mockReturnValue(true)
            document.dispatchEvent(new Event("visibilitychange"))
            expect(screen()).toBe("pause")
        } finally {
            hidden.mockRestore()
        }
    })

    it("doesn't auto-pause outside of play", () => {
        gameOver()
        dispatchEvent(new Event("blur"))
        expect(screen()).toBe("game-over")
    })

    it("goes from game over to stage select and back into play", () => {
        gameOver()
        pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Stage select")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        expect(selectedItem()).toBe(levels[0].name)
        const before = starts()
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        expect(starts()).toBe(before + 1)
    })

    it("ignores other keys after the game ends", () => {
        gameOver()
        const before = starts()
        pressAndTick("ArrowUp")
        pressAndTick("Enter")
        vi.advanceTimersByTime(FRAMES_MS)
        expect(starts()).toBe(before)
        expect(screen()).toBe("game-over")
        pressAndTick("Space")
        expect(starts()).toBe(before + 1)
    })

    it("ignores a Space held through the game-over until it is pressed again", () => {
        keydown("Space")
        gameOver()
        const before = starts()
        keydown("Space", true)
        keydown("Space", true)
        vi.advanceTimersByTime(FRAMES_MS)
        expect(starts()).toBe(before)
        keyup("Space")
        pressAndTick("Space")
        expect(starts()).toBe(before + 1)
    })

    it("doesn't carry an arrow tapped on the game-over screen into the retry", () => {
        gameOver()
        press("ArrowLeft")
        press("Space")
        const before = steps()
        vi.advanceTimersByTime(FRAMES_MS)
        expect(screen()).toBe("playing")
        const calls = moves(before)
        expect(calls.length).toBeGreaterThan(0)
        expect(
            calls.every((m) => m.held.length === 0 && isZero(m.pressed))
        ).toBe(true)
    })

    it("stops stepping once the game has ended, even with an arrow held", () => {
        gameOver()
        const before = steps()
        keydown("ArrowRight")
        vi.advanceTimersByTime(1000)
        expect(steps()).toBe(before)
        keyup("ArrowRight")
    })

    it("steps again after a retry", () => {
        gameOver()
        pressAndTick("Space")
        const before = steps()
        vi.advanceTimersByTime(FRAMES_MS)
        expect(steps()).toBeGreaterThan(before)
    })

    it("shows stage clear on a win, then retries or goes to stage select", () => {
        gameOver("won")
        expect(selectedItem()).toBe("Retry")
        const before = steps()
        vi.advanceTimersByTime(1000)
        expect(steps()).toBe(before)
        const starting = starts()
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        expect(starts()).toBe(starting + 1)

        gameOver("won")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
    })

    // Regression: stage clear (overlay and confetti) came up on the tick the
    // last dot was eaten, with the player frozen a cell short of it.
    it("lets the player's last glide finish before stage clear", () => {
        vi.advanceTimersByTime(1000)
        vi.mocked(confetti).mockClear()
        const game = drawnGame()
        // The player has just moved onto the last dot: a whole glide to go,
        // 1 / speed seconds.
        game.player.moveProgress = 0
        const glideMs = 1000 / game.player.speed
        nextOutcome = "won"
        vi.advanceTimersByTime(FRAMES_MS)
        const ended = steps()
        drawn.alphas.length = 0

        // The outro: no overlay, no confetti, no stepping, input ignored, and
        // losing focus doesn't pause it.
        expect(screen()).toBe("playing")
        const starting = starts()
        press("Space")
        press("ArrowLeft")
        dispatchEvent(new Event("blur"))
        vi.advanceTimersByTime(FRAMES_MS)
        expect(screen()).toBe("playing")
        expect(vi.mocked(confetti)).not.toHaveBeenCalled()
        expect(game.player.moveProgress).toBeGreaterThan(0)
        expect(game.player.moveProgress).toBeLessThan(1)
        // The picture keeps moving between ticks.
        expect(new Set(drawn.alphas).size).toBeGreaterThan(1)

        vi.advanceTimersByTime(glideMs)
        expect(screen()).toBe("stage-clear")
        expect(game.player.moveProgress).toBe(1)
        expect(selectedItem()).toBe("Retry")
        expect(steps()).toBe(ended)
        expect(starts()).toBe(starting)
        vi.advanceTimersByTime(1000)
        expect(vi.mocked(confetti)).toHaveBeenCalled()
    })

    it("lets the last glide finish before game over too, without confetti", () => {
        vi.advanceTimersByTime(1000)
        vi.mocked(confetti).mockClear()
        const game = drawnGame()
        game.player.moveProgress = 0
        nextOutcome = "dead"
        vi.advanceTimersByTime(FRAMES_MS)
        expect(screen()).toBe("playing")
        vi.advanceTimersByTime(1000 / game.player.speed)
        expect(screen()).toBe("game-over")
        vi.advanceTimersByTime(1000)
        expect(vi.mocked(confetti)).not.toHaveBeenCalled()
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
        pressAndTick("Space")

        gameOver("dead")
        expect(bursts()).toBe(0)
        pressAndTick("Space")

        gameOver("won")
        expect(bursts()).toBe(11)
    })

    // Order-independent: an earlier win may already have saved it.
    it("saves stage 1 as cleared on a win, unlocking stage 2", () => {
        gameOver("won")
        const saved = parseProgress(localStorage.getItem(PROGRESS_KEY))
        expect(saved.stages[0].cleared).toBe(true)
        expect(isUnlocked(saved, 1)).toBe(true)
    })

    it("shows the clear time and stars, saves the bests and lists them on stage select", () => {
        // The step is mocked, so set the clear: one life lost, 1:02.5.
        const game = drawnGame()
        game.ticks = 62.5 * TICK_RATE
        game.lives = START_LIVES - 1
        gameOver("won")
        expect(overlayLines().slice(1)).toEqual([
            "Time 1:02.5",
            "★ Cleared",
            "☆ No lives lost",
            "☆ Under par (1:00)",
        ])
        const saved = parseProgress(localStorage.getItem(PROGRESS_KEY))
        // Order-independent: an earlier win (0 ticks, 3 stars) may have
        // saved better bests already.
        expect(saved.stages[0].stars).toBeGreaterThanOrEqual(1)
        expect(saved.stages[0].bestTime).toBeLessThanOrEqual(62.5 * TICK_RATE)

        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        const { stars = 0, bestTime = 0 } = saved.stages[0]
        expect(selectedItem()).toBe(
            `${levels[0].name} · ${starText(stars)} · ${formatTicks(bestTime)}`
        )
    })

    it("doesn't write progress on a loss", () => {
        const setItem = vi.spyOn(localStorage, "setItem")
        try {
            gameOver("dead")
            expect(setItem).not.toHaveBeenCalled()
        } finally {
            setItem.mockRestore()
        }
    })

    it("shows STAGE_COUNT slots on stage select, stage 1 open", () => {
        gameOver("dead")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        const slots = document.querySelectorAll("#overlay li")
        expect(slots).toHaveLength(STAGE_COUNT)
        expect(slots[0].classList.contains("locked")).toBe(false)
        const placeholders = [...slots].filter(
            (li) => li.textContent === "Coming soon"
        )
        expect(placeholders).toHaveLength(
            Math.max(STAGE_COUNT - levels.length, 0)
        )
    })

    it("draws the game's score and lives in the HUD", () => {
        const game = drawnGame()
        game.score = 7 * DOT_POINTS
        game.lives = 2
        vi.advanceTimersByTime(FRAMES_MS)
        expect(drawn.last?.[2]).toEqual({
            score: 7 * DOT_POINTS,
            lives: 2,
            energy: energyHud(game),
        })
    })

    it("draws the game's energy meter in the HUD", () => {
        const game = drawnGame()
        game.breather.energy = 60
        vi.advanceTimersByTime(FRAMES_MS)
        expect(drawn.last?.[2]).toMatchObject({
            energy: { energy: 60, max: 100, cost: 50, ready: true },
        })
    })

    it("draws with the playing level's rules", () => {
        drawnGame()
        expect(drawn.last?.[3]).toBe(levels[0].rules)
    })

    it("draws a fog level with its fog", () => {
        const fog = levels.findIndex((level) => level.rules.fog)
        expect(fog).toBeGreaterThan(0)
        // Unlock it: clears saved elsewhere (e.g. another tab) are merged in
        // when a win is recorded.
        let unlocked = emptyProgress()
        for (let i = 0; i < fog; i++) unlocked = markCleared(unlocked, i)
        localStorage.setItem(PROGRESS_KEY, serializeProgress(unlocked))
        gameOver("won")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        // The cursor starts on stage 1, the one just played.
        for (let i = 0; i < fog; i++) pressAndTick("ArrowDown")
        expect(selectedItem()).toBe(levels[fog].name)
        pressAndTick("Space")
        try {
            expect(screen()).toBe("playing")
            expect(lastStartedLevel()).toBe(levels[fog])
            drawnGame()
            expect(drawn.last?.[3]).toBe(levels[fog].rules)
            expect(drawn.last?.[3]).toEqual({
                fog: { radius: expect.any(Number) },
            })
        } finally {
            // Back to stage 1, which the other tests play.
            gameOver()
            pressAndTick("ArrowDown")
            pressAndTick("Space")
            for (let i = 0; i < fog; i++) pressAndTick("ArrowUp")
            pressAndTick("Space")
        }
        expect(lastStartedLevel()).toBe(levels[0])
    })

    it.each(["dead", "won"] as const)(
        "shows the final score on the end screen (%s), and retries from 0",
        (outcome) => {
            drawnGame().score = 12 * DOT_POINTS
            gameOver(outcome)
            expect(overlayLines()[0]).toBe(`Score ${12 * DOT_POINTS}`)
            pressAndTick("Space")
            expect(screen()).toBe("playing")
            expect(drawn.last?.[2]).toMatchObject({
                score: 0,
                lives: START_LIVES,
            })
        }
    )
})

// The game main drew last (this test's game, during play).
function drawnGame(): GameState {
    vi.advanceTimersByTime(FRAMES_MS)
    return drawn.last?.[0] as GameState
}

const overlayLines = () =>
    [...document.querySelectorAll("#overlay p")].map((p) => p.textContent)
