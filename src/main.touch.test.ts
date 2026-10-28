// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { END_CONFIRM_DELAY } from "./flow"
import { createGameState, step, type MoveInput, type Outcome } from "./game"
import { ANIMAL_IDS } from "./roster"

// main on a phone: overlays are tapped, swipes on the play area steer and
// taps breathe, and the pause button pauses. (A separate file, since main
// is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// Keep the real game, but let the test decide when the next step ends it.
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

const FRAMES_MS = 100

const screen = () =>
    document.querySelector<HTMLElement>("#overlay")?.dataset.screen ?? "playing"
const selectedItem = () =>
    document.querySelector("#overlay li.selected")?.textContent
const el = (selector: string) => {
    const found = document.querySelector<HTMLElement>(selector)
    if (!found) throw new Error(`No ${selector}`)
    return found
}

// Tap (click) an element and let the loop tick it.
function tap(selector: string) {
    el(selector).click()
    vi.advanceTimersByTime(FRAMES_MS)
}

function pointer(target: Element, type: string, x: number, y: number) {
    target.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
            pointerId: 1,
            pointerType: "touch",
            clientX: x,
            clientY: y,
        })
    )
}

// Player 1's input in each game step since call `from`.
const moves = (from = 0): MoveInput[] =>
    vi
        .mocked(step)
        .mock.calls.slice(from)
        .map(([, , m]) => ("held" in m ? m : m[0]))

describe("main on a touch screen", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        document.body.innerHTML =
            '<main id="play"><canvas id="game"></canvas></main>'
        await import("./main")
    })

    it("starts with the D-pad off and no pause button", () => {
        expect(document.querySelector("#touch-controls")).not.toBeNull()
        expect(document.body.dataset.dpad).toBe("off")
        expect(document.body.dataset.playing).toBe("off")
    })

    it("taps through the menus into play, with Back on the way", () => {
        expect(screen()).toBe("title")
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("stage-select")
        tap("#overlay [data-back]")
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("Co-op")
        tap("#overlay li[data-index='0']")
        expect(screen()).toBe("stage-select")
        // A locked stage only moves the cursor there.
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("stage-select")
        expect(
            document.querySelector("#overlay li.selected")?.textContent
        ).toContain("🔒")
        tap("#overlay li[data-index='0']")
        expect(screen()).toBe("character-select")
        tap("#overlay li.card[data-index='2']")
        expect(screen()).toBe("playing")
        expect(vi.mocked(createGameState).mock.lastCall?.[1]).toEqual([
            ANIMAL_IDS[2],
        ])
        expect(document.body.dataset.playing).toBe("on")
    })

    it("steers with a swipe that sticks and breathes on a tap", () => {
        const play = el("#play")
        const from = vi.mocked(step).mock.calls.length
        pointer(play, "pointerdown", 100, 100)
        pointer(play, "pointermove", 100, 60)
        pointer(play, "pointerup", 100, 60)
        vi.advanceTimersByTime(FRAMES_MS)
        const after = moves(from)
        expect(after[0]?.pressed).toEqual({ x: 0, y: -1 })
        // Still held after the lift.
        expect(after.at(-1)?.held).toEqual([{ x: 0, y: -1 }])

        const before = vi.mocked(step).mock.calls.length
        pointer(play, "pointerdown", 100, 100)
        pointer(play, "pointerup", 100, 100)
        vi.advanceTimersByTime(FRAMES_MS)
        expect(moves(before).filter((m) => m.breath)).toHaveLength(1)
    })

    it("pauses on the pause button and resumes on a tap", () => {
        const button = el("#touch-controls [data-action=pause]")
        pointer(button, "pointerdown", 0, 0)
        pointer(button, "pointerup", 0, 0)
        vi.advanceTimersByTime(FRAMES_MS)
        expect(screen()).toBe("pause")
        expect(document.body.dataset.playing).toBe("off")
        tap("#overlay")
        expect(screen()).toBe("playing")
        expect(document.body.dataset.playing).toBe("on")
    })

    it("picks an end screen's item once its confirm delay is over", () => {
        nextOutcome = "dead"
        vi.advanceTimersByTime(FRAMES_MS)
        expect(screen()).toBe("game-over")
        // Too soon: the cursor moves, but nothing is picked.
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("game-over")
        expect(selectedItem()).toBe("Stage select")
        vi.advanceTimersByTime(END_CONFIRM_DELAY * 1000)
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("stage-select")
    })
})
