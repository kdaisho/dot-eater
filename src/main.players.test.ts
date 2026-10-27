// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import {
    bringBack,
    createGameState,
    step,
    takeOut,
    type GameState,
    type Outcome,
} from "./game"
import { LAST_PICK_KEY } from "./lastPick"
import { levels } from "./levels"
import { emptyProgress, PROGRESS_KEY, serializeProgress } from "./progress"
import { vec2 } from "./vec2"

// main in a 2-player game, end to end through the keyboard: the title's mode
// select, two players picking with their own keys, both moving, either
// pausing, and a win that leaves saved progress alone. The saved
// 1-player pick is left alone too. (A separate file,
// since main is imported once per module graph.)

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
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
const cardOf = (player: 1 | 2) =>
    overlay()?.querySelector<HTMLElement>(`li.card.p${player}`)?.dataset.animal

describe("main with two players", () => {
    it("picks co-op, picks a character each and plays together", async () => {
        vi.useFakeTimers()
        const saved = serializeProgress(emptyProgress())
        localStorage.setItem(PROGRESS_KEY, saved)
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")

        // The title is the mode select, on 1 player.
        expect(screen()).toBe("title")
        expect(
            [...(overlay()?.querySelectorAll("li") ?? [])].map(
                (li) => li.textContent
            )
        ).toEqual(["1 player", "Co-op"])
        expect(selectedItem()).toBe("1 player")
        pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Co-op")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        pressAndTick("Space")

        // Character select: both cursors start on the Dragon; each player
        // moves its own.
        expect(screen()).toBe("character-select")
        expect(cardOf(1)).toBe("dragon")
        expect(cardOf(2)).toBe("dragon")
        pressAndTick("KeyD")
        pressAndTick("KeyD")
        expect(cardOf(1)).toBe("dragon")
        expect(cardOf(2)).toBe("owl")
        pressAndTick("Space")
        // Player 1 is ready; the game waits for player 2.
        expect(screen()).toBe("character-select")
        expect(overlay()?.querySelector(".card-player.p1")?.textContent).toBe(
            "1P ✓"
        )
        pressAndTick("KeyE")
        expect(screen()).toBe("playing")
        expect(vi.mocked(createGameState).mock.lastCall).toEqual([
            levels[0],
            ["dragon", "owl"],
            "coop",
        ])
        // The saved 1-player pick is left alone, player 1's included.
        expect(localStorage.getItem(LAST_PICK_KEY)).toBeNull()

        // Both players' keys reach the game, one input each.
        keydown("ArrowLeft")
        keydown("KeyS")
        vi.advanceTimersByTime(100)
        const moves = vi.mocked(step).mock.lastCall?.[2]
        expect(moves).toEqual([
            { held: [vec2(-1, 0)], pressed: vec2(0, 0), breath: false },
            { held: [vec2(0, 1)], pressed: vec2(0, 0), breath: false },
        ])
        keyup("ArrowLeft")
        keyup("KeyS")

        // The HUD shows each player's score and meter.
        const game = drawn.last?.[0] as GameState
        expect(game.players).toHaveLength(2)
        expect(drawn.last?.[2]).toMatchObject({
            lives: game.lives,
            players: [{ score: 0 }, { score: 0 }],
        })
        expect(drawn.last?.[2]).not.toHaveProperty("players.0.out")

        // A player out of play shows when it is back instead of its meter.
        takeOut(game.players[1], 2.5)
        vi.advanceTimersByTime(100)
        expect(drawn.last?.[2]).toMatchObject({
            players: [{ score: 0 }, { score: 0, out: { respawnIn: 2.5 } }],
        })
        expect(drawn.last?.[2]).not.toHaveProperty("players.0.out")
        bringBack(game, game.players[1])

        // Player 2 can pause, and resume.
        pressAndTick("KeyQ")
        expect(screen()).toBe("pause")
        pressAndTick("KeyE")
        expect(screen()).toBe("playing")

        // A win shows the combined score, each player's share and dots,
        // and saves nothing.
        game.players[0].score = 30
        game.players[0].dots = 3
        game.players[1].score = 20
        game.players[1].dots = 2
        const setItem = vi.spyOn(localStorage, "setItem")
        nextOutcome = "won"
        vi.advanceTimersByTime(1000)
        expect(screen()).toBe("stage-clear")
        const lines = [...(overlay()?.querySelectorAll(".overlay-line") ?? [])]
        expect(lines.slice(0, 3).map((p) => p.textContent)).toEqual([
            "Score 50",
            "1P 30 · 3 dots",
            "2P 20 · 2 dots",
        ])
        expect(setItem).not.toHaveBeenCalledWith(
            PROGRESS_KEY,
            expect.anything()
        )
        expect(localStorage.getItem(PROGRESS_KEY)).toBe(saved)

        // Retry plays the same two characters again.
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        expect(vi.mocked(createGameState).mock.lastCall?.[1]).toEqual([
            "dragon",
            "owl",
        ])

        // Game over shows the same breakdown.
        const again = drawn.last?.[0] as GameState
        again.players[0].score = 10
        again.players[0].dots = 1
        nextOutcome = "dead"
        vi.advanceTimersByTime(1000)
        expect(screen()).toBe("game-over")
        const over = [...(overlay()?.querySelectorAll(".overlay-line") ?? [])]
        expect(over.map((p) => p.textContent)).toEqual([
            "Score 10",
            "1P 10 · 1 dot",
            "2P 0 · 0 dots",
        ])
    })
})
