// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { createGameState, type Outcome } from "./game"
import { LAST_DIFFICULTY_KEY } from "./lastPick"
import { stages } from "./levels"
import {
    emptyProgress,
    markCleared,
    parseProgress,
    PROGRESS_KEY,
    serializeProgress,
} from "./progress"

// main with a difficulty saved by an earlier visit (KDA-265): stage select
// shows that difficulty's bests, difficulty select opens on it, and a
// 1-player pick is saved and played, its clear recorded at it. (A separate
// file, since main is imported once per module graph and reads storage on
// import.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// Keep the real renderer, but watch the HUD main asks it to draw.
const drawn = vi.hoisted(() => ({ hud: undefined as unknown }))
vi.mock("./render", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./render")>()
    return {
        ...actual,
        createRenderer: (...args: Parameters<typeof actual.createRenderer>) => {
            const renderer = actual.createRenderer(...args)
            return {
                ...renderer,
                draw: (...a: Parameters<typeof renderer.draw>) => {
                    drawn.hud = a[2]
                    renderer.draw(...a)
                },
            }
        },
    }
})

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

function pressAndTick(code: string) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
    vi.advanceTimersByTime(100)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const lines = () =>
    [...(overlay()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => li.textContent)
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
const savedStage0 = () =>
    parseProgress(localStorage.getItem(PROGRESS_KEY)).stages[0]

describe("main with a saved difficulty", () => {
    it("shows its bests, opens on it, and saves and plays a new 1-player pick", async () => {
        vi.useFakeTimers()
        localStorage.setItem(LAST_DIFFICULTY_KEY, "hard")
        // Stage 1 cleared: Hard's bests apart, and Medium's at the top, as
        // a save from before difficulties has them.
        const cleared = markCleared(emptyProgress(), 0)
        localStorage.setItem(
            PROGRESS_KEY,
            serializeProgress({
                ...cleared,
                stages: [
                    {
                        cleared: true,
                        stars: 1,
                        bestTime: 6000,
                        byDifficulty: { hard: { stars: 3, bestTime: 600 } },
                    },
                    ...cleared.stages.slice(1),
                ],
            })
        )
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")

        // Stage select shows Hard's bests, and says so.
        pressAndTick("Space")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        expect(lines()[0]).toBe("Bests on Hard")
        expect(selectedItem()).toBe(`${stages[0].hard.name} · ★★★ · 0:10.0`)

        // Difficulty select opens on Hard, each with its description.
        pressAndTick("Space")
        expect(screen()).toBe("difficulty-select")
        expect(items()).toEqual([
            "Easy 3 enemies, medium maze",
            "Medium 4 enemies, medium maze",
            "Hard 6 enemies, large maze",
            "Super Hard 8 enemies, large maze",
        ])
        expect(selectedItem()).toBe("Hard 6 enemies, large maze")

        // Moving and going back picks nothing.
        pressAndTick("ArrowUp")
        expect(selectedItem()).toMatch(/^Medium/)
        pressAndTick("Escape")
        expect(screen()).toBe("stage-select")
        expect(lines()[0]).toBe("Bests on Hard")
        expect(localStorage.getItem(LAST_DIFFICULTY_KEY)).toBe("hard")

        // Super Hard: saved once picked, and played.
        pressAndTick("Space")
        expect(selectedItem()).toMatch(/^Hard/)
        pressAndTick("ArrowRight")
        pressAndTick("Space")
        expect(screen()).toBe("character-select")
        expect(localStorage.getItem(LAST_DIFFICULTY_KEY)).toBe("superHard")
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        expect(vi.mocked(createGameState).mock.lastCall?.[0]).toBe(
            stages[0].superHard
        )
        expect(drawn.hud).toMatchObject({ difficulty: "Super Hard" })

        // A win is shown and recorded at Super Hard, leaving the others.
        nextOutcome = "won"
        vi.advanceTimersByTime(1000)
        expect(screen()).toBe("stage-clear")
        expect(lines()[0]).toBe("Difficulty Super Hard")
        expect(savedStage0()).toEqual({
            cleared: true,
            stars: 1,
            bestTime: 6000,
            byDifficulty: {
                hard: { stars: 3, bestTime: 600 },
                // The mocked step leaves the clear time at 0 ticks, which
                // isn't a time to keep.
                superHard: { stars: 3 },
            },
        })

        // Stage select now shows Super Hard's bests.
        pressAndTick("ArrowDown")
        vi.advanceTimersByTime(1000)
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        expect(lines()[0]).toBe("Bests on Super Hard")
        expect(selectedItem()).toBe(`${stages[0].hard.name} · ★★★`)

        // Back from character select returns to difficulty select on it.
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("character-select")
        pressAndTick("Escape")
        expect(screen()).toBe("difficulty-select")
        expect(selectedItem()).toMatch(/^Super Hard/)
    })
})
