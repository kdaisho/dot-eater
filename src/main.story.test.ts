// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import confetti from "canvas-confetti"
import { END_CONFIRM_DELAY, STORY_CARD_SECONDS } from "./flow"
import type { GameState, Outcome } from "./game"
import type { Pad } from "./gamepad"
import { levels } from "./levels"
import { parseProgress, PROGRESS_KEY, STAGE_COUNT } from "./progress"
import type { Hud } from "./render"

// main in story mode (KDA-271): through the new menus with keys, taps and
// a pad, a run's stages one after another with the run total on the HUD and
// the cards, retry, quit, the ending and its saved best, and a co-op run
// that records nothing. (A separate file, since main is imported once per
// module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// STAGE_COUNT stages, however many are built (the real ones, repeated), so
// a run can reach the ending.
vi.mock("./levels", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./levels")>()
    const { STAGE_COUNT: count } = await import("./progress")
    const fill = <T>(list: readonly T[]) =>
        Array.from({ length: count }, (_, i) => list[i % list.length])
    return { stages: fill(actual.stages), levels: fill(actual.levels) }
})

// Keep the real renderer, but watch the HUD main asks it to draw.
const drawn = vi.hoisted(() => ({ hud: undefined as Hud | undefined }))
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

// Keep the real game, but let the test decide what the next step scores
// for player 1, and when it ends the game, and how.
const next = vi.hoisted(() => ({
    outcome: null as Outcome | null,
    points: 0,
}))
vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return {
        ...actual,
        step: vi.fn((game: GameState) => {
            game.players[0].score += next.points
            next.points = 0
            const outcome = next.outcome
            next.outcome = null
            return outcome
        }),
    }
})

const FRAMES_MS = 100

function pressAndTick(code: string) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
    vi.advanceTimersByTime(FRAMES_MS)
}

// Tap (click) an overlay element and let the loop tick it.
function tap(selector: string) {
    const el = document.querySelector<HTMLElement>(`#overlay ${selector}`)
    if (!el) throw new Error(`No ${selector}`)
    el.click()
    vi.advanceTimersByTime(FRAMES_MS)
}

let pads: Pad[] = []
const A = 0
const START = 9
const DOWN = 13

function pad(buttons: number[] = []): Pad {
    return {
        index: 0,
        buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: buttons.includes(i),
        })),
        axes: [0, 0, 0, 0],
    }
}

// Press pad buttons for a few frames, then let go for a few.
function padTap(...buttons: number[]) {
    pads = [pad(buttons)]
    vi.advanceTimersByTime(FRAMES_MS)
    pads = [pad()]
    vi.advanceTimersByTime(FRAMES_MS)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const lines = () =>
    [...(overlay()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => li.textContent)
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
const saved = () => parseProgress(localStorage.getItem(PROGRESS_KEY))

// End the game on the next step, scoring `points` first, and let the outro
// finish.
function end(outcome: Outcome, points = 0) {
    next.outcome = outcome
    next.points = points
    vi.advanceTimersByTime(1000)
}

// Score `points` during play.
function score(points: number) {
    next.points = points
    vi.advanceTimersByTime(FRAMES_MS)
}

const waitConfirm = () => vi.advanceTimersByTime(END_CONFIRM_DELAY * 1000)

describe("main in story mode", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        Object.defineProperty(navigator, "getGamepads", {
            configurable: true,
            value: () => pads,
        })
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        expect(screen()).toBe("title")
    })

    it("goes through the new menus and back with the keys", () => {
        pressAndTick("Space")
        expect(screen()).toBe("play-select")
        expect(overlay()?.querySelector("h1")?.textContent).toBe("1 player")
        expect(items()).toEqual(["Story", "Stage select"])
        expect(selectedItem()).toBe("Story")
        pressAndTick("Space")
        expect(screen()).toBe("story-menu")
        expect(items()).toEqual([
            `Continue (stage 1: ${levels[0].name})`,
            "New story",
        ])
        expect(selectedItem()).toBe(`Continue (stage 1: ${levels[0].name})`)
        pressAndTick("Escape")
        expect(screen()).toBe("play-select")
        expect(selectedItem()).toBe("Story")
        pressAndTick("Escape")
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("1 player")
    })

    it("taps into a run, with Back on the way", () => {
        tap("li[data-index='0']")
        expect(screen()).toBe("play-select")
        tap("li[data-index='0']")
        expect(screen()).toBe("story-menu")
        tap("li[data-index='1']")
        expect(screen()).toBe("difficulty-select")
        tap("[data-back]")
        expect(screen()).toBe("story-menu")
        expect(selectedItem()).toBe("New story")
        // Hard, then Back from character select to it.
        tap("li[data-index='1']")
        tap("li[data-index='2']")
        expect(screen()).toBe("character-select")
        tap("[data-back]")
        expect(screen()).toBe("difficulty-select")
        expect(selectedItem()).toMatch(/^Hard/)
        tap("li[data-index='2']")
        tap("li.card[data-index='0']")
        expect(screen()).toBe("playing")
        expect(drawn.hud?.difficulty).toBe("Hard")
        expect(drawn.hud?.score).toBe(0)
    })

    it("shows the clear card with the run total, and records the clear", () => {
        score(30)
        expect(drawn.hud?.score).toBe(30)
        end("won", 20)
        expect(screen()).toBe("story-clear")
        expect(overlay()?.querySelector("h1")?.textContent).toBe("Stage clear!")
        expect(lines()).toContain("Score 50")
        expect(lines()).toContain("Run total 50")
        expect(lines().at(-1)).toBe(`Next: Stage 2: ${levels[1].name}`)
        expect(items()).toEqual(["Next stage"])
        expect(confetti).toHaveBeenCalled()
        // Stage 1 cleared, which unlocks stage 2, with Hard's bests.
        expect(saved().stages[0]).toMatchObject({
            cleared: true,
            byDifficulty: { hard: { stars: expect.any(Number) } },
        })
    })

    it("starts the next stage by itself, the run total carried on", () => {
        vi.advanceTimersByTime(STORY_CARD_SECONDS * 1000)
        expect(screen()).toBe("playing")
        expect(drawn.hud?.score).toBe(50)
        score(15)
        expect(drawn.hud?.score).toBe(65)
    })

    it("offers Retry and Quit on a failed stage, and retries from the stage's start total", () => {
        end("dead")
        expect(screen()).toBe("game-over")
        expect(lines()).toEqual(["Difficulty Hard", "Score 15", "Run total 50"])
        expect(items()).toEqual(["Retry", "Quit"])
        // Regression: the HUD behind the card added the failed stage's
        // score (65); it shows the card's run total, what Retry plays on
        // from.
        expect(drawn.hud?.score).toBe(50)
        waitConfirm()
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        expect(drawn.hud?.score).toBe(50)
    })

    it("quits the run from the pause menu", () => {
        pressAndTick("Escape")
        expect(screen()).toBe("pause")
        expect(items()).toEqual(["Resume", "Settings", "Quit"])
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Quit")
        pressAndTick("Space")
        expect(screen()).toBe("title")
    })

    it("continues from stage 2 now, and plays the run to the ending with a pad", () => {
        pads = [pad()]
        dispatchEvent(
            Object.assign(new Event("gamepadconnected"), {
                gamepad: { index: 0 },
            })
        )
        vi.advanceTimersByTime(20)
        padTap(A)
        expect(screen()).toBe("play-select")
        padTap(A)
        expect(screen()).toBe("story-menu")
        expect(selectedItem()).toBe(`Continue (stage 2: ${levels[1].name})`)
        // Back and forth with the pad.
        padTap(DOWN)
        expect(selectedItem()).toBe("New story")
        padTap(START)
        expect(screen()).toBe("play-select")
        padTap(A)
        padTap(A)
        expect(screen()).toBe("difficulty-select")
        // Hard, picked last.
        expect(selectedItem()).toMatch(/^Hard/)
        padTap(A)
        expect(screen()).toBe("character-select")
        padTap(A)
        expect(screen()).toBe("playing")

        // Stage 2 on: 100 points each.
        for (let stage = 2; stage < STAGE_COUNT; stage++) {
            end("won", 100)
            expect(screen()).toBe("story-clear")
            expect(lines()).toContain(`Run total ${(stage - 1) * 100}`)
            waitConfirm()
            padTap(A)
            expect(screen()).toBe("playing")
        }
        end("won", 100)
        const total = (STAGE_COUNT - 1) * 100
        expect(screen()).toBe("story-end")
        expect(overlay()?.querySelector("h1")?.textContent).toBe("🎉 The end")
        expect(lines()).toEqual([
            "Difficulty Hard",
            `Run total ${total}`,
            `Best ${total}`,
            "Thanks for playing!",
        ])
        expect(saved().storyBests).toEqual({ hard: total })
        expect(saved().stages.every((s) => s.cleared)).toBe(true)
        waitConfirm()
        padTap(A)
        expect(screen()).toBe("title")
        pads = []
    })

    it("plays a co-op run that records nothing", () => {
        const before = localStorage.getItem(PROGRESS_KEY)
        const setItem = vi.spyOn(localStorage, "setItem")
        pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Co-op")
        pressAndTick("Space")
        expect(overlay()?.querySelector("h1")?.textContent).toBe("Co-op")
        pressAndTick("Space")
        // The 1-player unlocks: every stage reached.
        expect(selectedItem()).toBe(
            `Continue (stage ${STAGE_COUNT}: ${levels[STAGE_COUNT - 1].name})`
        )
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("character-select")
        pressAndTick("Space")
        pressAndTick("KeyE")
        expect(screen()).toBe("playing")
        score(40)
        // Both players' scores stay; the run total is in the middle.
        expect(drawn.hud?.round).toBe("Total 40")
        end("won", 10)
        expect(screen()).toBe("story-clear")
        expect(lines()).toContain("Run total 50")
        waitConfirm()
        pressAndTick("Space")
        expect(drawn.hud?.round).toBe("Total 50")
        end("dead")
        expect(screen()).toBe("game-over")
        expect(items()).toEqual(["Retry", "Quit"])
        waitConfirm()
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("title")
        expect(localStorage.getItem(PROGRESS_KEY)).toBe(before)
        expect(setItem).not.toHaveBeenCalledWith(
            PROGRESS_KEY,
            expect.anything()
        )
        setItem.mockRestore()
    })
})
