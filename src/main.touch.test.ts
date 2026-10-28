// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { END_CONFIRM_DELAY } from "./flow"
import { createGameState, step, type MoveInput, type Outcome } from "./game"
import { ANIMAL_IDS } from "./roster"
import { SETTINGS_KEY } from "./settings"

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
        // A touch screen, so the touch-only parts show.
        Object.defineProperty(navigator, "maxTouchPoints", {
            configurable: true,
            value: 5,
        })
        document.body.innerHTML =
            '<main id="play"><canvas id="game"></canvas></main>'
        await import("./main")
    })

    it("starts with the D-pad off and no pause button", () => {
        expect(document.querySelector("#touch-controls")).not.toBeNull()
        expect(document.body.dataset.touch).toBe("on")
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

    it("pauses on the pause button and resumes on a tap on Resume", () => {
        const button = el("#touch-controls [data-action=pause]")
        pointer(button, "pointerdown", 0, 0)
        pointer(button, "pointerup", 0, 0)
        vi.advanceTimersByTime(FRAMES_MS)
        expect(screen()).toBe("pause")
        expect(document.body.dataset.playing).toBe("off")
        // Elsewhere on the panel does nothing now that pause is a menu.
        tap("#overlay")
        expect(screen()).toBe("pause")
        tap("#overlay li[data-index='0']")
        expect(screen()).toBe("playing")
        expect(document.body.dataset.playing).toBe("on")
    })

    it("taps through the settings from pause: a slider, Show D-pad, Back", () => {
        const button = el("#touch-controls [data-action=pause]")
        pointer(button, "pointerdown", 0, 0)
        pointer(button, "pointerup", 0, 0)
        vi.advanceTimersByTime(FRAMES_MS)
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("settings")
        const label = (i: number) =>
            el(`#overlay li[data-index='${i}']`).textContent
        expect(label(4)).toBe("Show D-pad Off")
        // Music volume's ◀: one step down, the cursor on it.
        tap("#overlay li[data-index='0'] [data-step='-1']")
        expect(label(0)).toBe("Music volume ◀ 6 ▶")
        expect(selectedItem()).toBe("Music volume ◀ 6 ▶")
        tap("#overlay li[data-index='1'] [data-step='1']")
        expect(label(1)).toBe("Effects volume ◀ 9 ▶")
        // Show D-pad: shows at once and is saved.
        tap("#overlay li[data-index='4']")
        expect(label(4)).toBe("Show D-pad On")
        expect(document.body.dataset.dpad).toBe("on")
        expect(localStorage.getItem(SETTINGS_KEY)).toContain('"showDpad":true')
        tap("#overlay li[data-index='4']")
        expect(document.body.dataset.dpad).toBe("off")
        // Back returns to the pause menu.
        tap("#overlay li[data-index='5']")
        expect(screen()).toBe("pause")
        tap("#overlay li[data-index='0']")
        expect(screen()).toBe("playing")
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
