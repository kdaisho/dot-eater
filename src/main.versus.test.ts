// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { createGameState, type GameState, type Outcome } from "./game"
import { MAX_HEALTH } from "./constants"
import { LAST_DIFFICULTY_KEY, LAST_PICK_KEY } from "./lastPick"
import { stages } from "./levels"
import { emptyProgress, PROGRESS_KEY, serializeProgress } from "./progress"

// main through a versus match, end to end through the keyboard: versus on
// the title, the versus HUD, a round result, the next round and the match
// result, with saved progress and the last pick left alone. (A separate
// file, since main is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// Keep the real renderer, but remember the latest draw's game and HUD.
const drawn = vi.hoisted(() => ({ last: undefined as unknown[] | undefined }))
vi.mock("./render", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./render")>()
    return {
        ...actual,
        createRenderer: (...args: Parameters<typeof actual.createRenderer>) => {
            const renderer = actual.createRenderer(...args)
            return {
                ...renderer,
                draw: (...a: Parameters<typeof renderer.draw>) => {
                    drawn.last = a
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

const keydown = (code: string) =>
    dispatchEvent(new KeyboardEvent("keydown", { code }))
const keyup = (code: string) =>
    dispatchEvent(new KeyboardEvent("keyup", { code }))

function pressAndTick(code: string) {
    keydown(code)
    keyup(code)
    vi.advanceTimersByTime(100)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const heading = () => overlay()?.querySelector("h1")?.textContent
const menu = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => li.textContent)
const lines = () =>
    [...(overlay()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)
const game = () => drawn.last?.[0] as GameState
const hud = () => drawn.last?.[2]

// End the round being played with player 1 on `p1` dots and player 2 on
// `p2`.
function finishRound(p1: number, p2: number) {
    const [a, b] = game().players
    a.dots = p1
    b.dots = p2
    nextOutcome = "won"
    vi.advanceTimersByTime(1000)
}

describe("main in versus", () => {
    it("plays a best-of-3 match and saves nothing", async () => {
        vi.useFakeTimers()
        const saved = serializeProgress(emptyProgress())
        localStorage.setItem(PROGRESS_KEY, saved)
        // Without ?record nothing is recorded or downloaded.
        const createObjectURL = vi.fn(() => "blob:unexpected")
        URL.createObjectURL = createObjectURL
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        const setItem = vi.spyOn(localStorage, "setItem")
        expect(document.getElementById("rec-badge")).toBeNull()

        expect(menu()).toEqual(["1 player", "Co-op", "Versus", "Settings"])
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        pressAndTick("Space")
        // Super Hard.
        expect(screen()).toBe("difficulty-select")
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("character-select")
        pressAndTick("KeyD")
        pressAndTick("Space")
        pressAndTick("KeyE")
        expect(screen()).toBe("playing")
        expect(vi.mocked(createGameState).mock.lastCall?.[2]).toBe("versus")
        expect(vi.mocked(createGameState).mock.lastCall?.[0]).toBe(
            stages[0].superHard
        )

        // The HUD: dots and health per player, the round tally and the
        // difficulty.
        expect(hud()).toMatchObject({
            round: "Round 1 · 0–0",
            difficulty: "Super Hard",
            players: [
                { dots: 0, health: { health: MAX_HEALTH } },
                { dots: 0, health: { health: MAX_HEALTH } },
            ],
        })
        expect(hud()).not.toHaveProperty("players.1.stunned")
        // A stun shows in its player's slot.
        game().players[1].stunnedFor = 1.5
        vi.advanceTimersByTime(100)
        expect(hud()).toMatchObject({ players: [{}, { stunned: 1.5 }] })
        game().players[1].stunnedFor = 0

        // Round 1 to player 1, then the next round on a fresh stage.
        const first = game()
        finishRound(3, 1)
        expect(screen()).toBe("round-result")
        expect(heading()).toBe("Round 1: 1P wins!")
        expect(menu()).toEqual(["Next round", "Quit"])
        expect(lines()[0]).toBe("Difficulty Super Hard")
        // The HUD under it still shows the round as it was played.
        expect(hud()).toMatchObject({ round: "Round 1 · 0–0" })
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        expect(game()).not.toBe(first)
        expect(vi.mocked(createGameState).mock.lastCall?.[1]).toEqual([
            "dragon",
            "penguin",
        ])
        expect(hud()).toMatchObject({ round: "Round 2 · 1–0" })

        // Round 2 to player 1 too: the match is over.
        finishRound(5, 2)
        expect(screen()).toBe("match-result")
        expect(heading()).toBe("🏆 1P wins the match!")
        expect(menu()).toEqual(["Rematch", "Stage select"])
        expect(lines()[0]).toBe("Difficulty Super Hard")

        // Nothing saved: no progress, no last pick.
        expect(setItem).not.toHaveBeenCalled()
        expect(localStorage.getItem(PROGRESS_KEY)).toBe(saved)
        expect(localStorage.getItem(LAST_PICK_KEY)).toBeNull()
        expect(localStorage.getItem(LAST_DIFFICULTY_KEY)).toBeNull()
        // And no recording of the rounds.
        expect(createObjectURL).not.toHaveBeenCalled()

        // A rematch starts again from round 1.
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        expect(hud()).toMatchObject({ round: "Round 1 · 0–0" })
        expect(vi.mocked(createGameState).mock.lastCall?.[0]).toBe(
            stages[0].superHard
        )
    })
})
