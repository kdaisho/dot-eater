// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { END_CONFIRM_DELAY } from "./flow"
import { createGameState, step, type MoveInput, type Outcome } from "./game"
import { BUTTONS_SPACE, computeLayout, controlsSpace } from "./layout"
import { levels, stages } from "./levels"
import { ANIMAL_IDS } from "./roster"
import { SETTINGS_KEY } from "./settings"

// main on a phone: overlays are tapped, a flick on the play area steers
// (the player runs on after the lift, and a flick back stops it), the
// punch and breath buttons press, and the pause button pauses. (A separate file, since main is imported once per
// module graph.)

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

// Keep the real touch source, but count the times main lets go of the
// drag.
const touchReleases = vi.hoisted(() => ({ count: 0 }))
vi.mock("./touch", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./touch")>()
    class Counted extends actual.TouchSource {
        override release() {
            touchReleases.count++
            super.release()
        }
    }
    return { ...actual, TouchSource: Counted }
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

function pointer(
    target: Element,
    type: string,
    x: number,
    y: number,
    pointerId = 1
) {
    target.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
            pointerId,
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
        // happy-dom's own controls, which the DOM types don't know: a small
        // window on its side.
        const { happyDOM } = window as unknown as {
            happyDOM: {
                setViewport(size: { width: number; height: number }): void
            }
        }
        happyDOM.setViewport({ width: 600, height: 500 })
        // A touch screen that is the main input (a phone), so the
        // touch-only parts show.
        Object.defineProperty(navigator, "maxTouchPoints", {
            configurable: true,
            value: 5,
        })
        const media = window.matchMedia.bind(window)
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: (query: string) =>
                query.includes("pointer: coarse")
                    ? { media: query, matches: true }
                    : media(query),
        })
        document.body.innerHTML =
            '<main id="play"><canvas id="game"></canvas></main>'
        await import("./main")
    })

    it("starts with the D-pad off and no pause button", () => {
        expect(document.querySelector("#touch-controls")).not.toBeNull()
        expect(document.body.dataset.touch).toBe("on")
        expect(document.body.dataset.buttons).toBe("on")
        expect(document.body.dataset.dpad).toBe("off")
        expect(document.body.dataset.playing).toBe("off")
    })

    it("taps through the menus into play, with Back on the way", () => {
        expect(screen()).toBe("title")
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("play-select")
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("stage-select")
        tap("#overlay [data-back]")
        expect(screen()).toBe("play-select")
        expect(selectedItem()).toBe("Stage select")
        tap("#overlay [data-back]")
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("Co-op")
        tap("#overlay li[data-index='0']")
        expect(screen()).toBe("play-select")
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("stage-select")
        // A locked stage only moves the cursor there.
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("stage-select")
        expect(
            document.querySelector("#overlay li.selected")?.textContent
        ).toContain("🔒")
        tap("#overlay li[data-index='0']")
        expect(screen()).toBe("difficulty-select")
        // One tap picks a difficulty: Hard, then back and Medium instead.
        tap("#overlay li[data-index='2']")
        expect(screen()).toBe("character-select")
        tap("#overlay [data-back]")
        expect(screen()).toBe("difficulty-select")
        expect(selectedItem()).toMatch(/^Hard/)
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("character-select")
        tap("#overlay li.card[data-index='2']")
        expect(screen()).toBe("playing")
        expect(vi.mocked(createGameState).mock.lastCall?.slice(0, 2)).toEqual([
            stages[0].medium,
            [ANIMAL_IDS[2]],
        ])
        expect(document.body.dataset.playing).toBe("on")
    })

    it("fits the maze beside the punch and breath buttons' band, without the D-pad", () => {
        expect(document.querySelector("[data-action=punch]")).not.toBeNull()
        expect(document.querySelector("[data-action=breath]")).not.toBeNull()
        const map = levels[0]
        const cols = map.cells[0].length
        const rows = map.cells.length
        const room = controlsSpace(600, 500, "buttons")
        expect(room.width).toBe(BUTTONS_SPACE)
        const fitted = computeLayout(600 - room.width, 500, cols, rows)
        // The band costs the maze some size here, so the test can tell.
        expect(fitted.cell).toBeLessThan(
            computeLayout(600, 500, cols, rows).cell
        )
        expect(el("canvas").style.width).toBe(`${fitted.width}px`)
    })

    it("steers with a flick that holds after the lift, and stops at a flick back", () => {
        const play = el("#play")
        const from = vi.mocked(step).mock.calls.length
        pointer(play, "pointerdown", 100, 100)
        pointer(play, "pointermove", 100, 60)
        vi.advanceTimersByTime(FRAMES_MS)
        const during = moves(from)
        expect(during[0]?.pressed).toEqual({ x: 0, y: -1 })
        // Held, and not pressed again, while the finger stays down...
        expect(during.at(-1)?.held).toEqual([{ x: 0, y: -1 }])
        expect(during.at(-1)?.pressed).toEqual({ x: 0, y: 0 })
        // ...and after the lift.
        pointer(play, "pointerup", 100, 60)
        const lifted = vi.mocked(step).mock.calls.length
        vi.advanceTimersByTime(FRAMES_MS)
        expect(moves(lifted).at(-1)?.held).toEqual([{ x: 0, y: -1 }])

        // The player on its way up (step is mocked, so set it so): main
        // tells the touch source each tick, and a flick down stops it.
        const game = vi.mocked(step).mock.lastCall![0]
        game.players[0].character.moveProgress = 0.5
        game.players[0].breather.facing = { x: 0, y: -1 }
        vi.advanceTimersByTime(FRAMES_MS)
        pointer(play, "pointerdown", 100, 100)
        pointer(play, "pointerup", 100, 140)
        const stopped = vi.mocked(step).mock.calls.length
        vi.advanceTimersByTime(FRAMES_MS)
        expect(moves(stopped).at(-1)?.held).toEqual([])
        // Standing again, for the tests after.
        game.players[0].character.moveProgress = 1
        vi.advanceTimersByTime(FRAMES_MS)
    })

    it("doesn't breathe on a tap on the board", () => {
        const play = el("#play")
        const before = vi.mocked(step).mock.calls.length
        pointer(play, "pointerdown", 100, 100)
        pointer(play, "pointerup", 100, 100)
        vi.advanceTimersByTime(FRAMES_MS)
        expect(moves(before).filter((m) => m.breath)).toHaveLength(0)
    })

    it.each(["punch", "breath"] as const)(
        "steers with one finger while another presses %s",
        (action) => {
            const play = el("#play")
            const button = el(`#touch-controls [data-action=${action}]`)
            const from = vi.mocked(step).mock.calls.length
            pointer(play, "pointerdown", 100, 100, 1)
            pointer(play, "pointermove", 140, 100, 1)
            pointer(button, "pointerdown", 0, 0, 2)
            vi.advanceTimersByTime(FRAMES_MS)
            // Held down over several ticks: one press.
            const both = moves(from)
            expect(both.length).toBeGreaterThan(1)
            expect(both.filter((m) => m[action])).toHaveLength(1)
            expect(both[0]?.[action]).toBe(true)
            expect(both.at(-1)?.held).toEqual([{ x: 1, y: 0 }])
            // Lifting the button's finger leaves the steering finger alone.
            pointer(button, "pointerup", 0, 0, 2)
            const after = vi.mocked(step).mock.calls.length
            vi.advanceTimersByTime(FRAMES_MS)
            expect(moves(after).at(-1)?.held).toEqual([{ x: 1, y: 0 }])
            pointer(play, "pointerup", 140, 100, 1)
            vi.advanceTimersByTime(FRAMES_MS)
        }
    )

    // KDA-289: the breath charges while held and fires on the lift.
    it.each(["pointerup", "lostpointercapture"])(
        "holds the breath while a finger is on Breath, letting go on %s",
        (lift) => {
            const button = el("#touch-controls [data-action=breath]")
            const from = vi.mocked(step).mock.calls.length
            pointer(button, "pointerdown", 0, 0, 3)
            vi.advanceTimersByTime(FRAMES_MS)
            const held = moves(from)
            expect(held.length).toBeGreaterThan(1)
            expect(held[0]?.breath).toBe(true)
            expect(held.every((m) => m.breathHeld)).toBe(true)
            pointer(button, lift, 0, 0, 3)
            const after = vi.mocked(step).mock.calls.length
            vi.advanceTimersByTime(FRAMES_MS)
            expect(moves(after).every((m) => !m.breathHeld)).toBe(true)
        }
    )

    it("lights the breath button while player 1 can breathe", () => {
        const breath = el("#touch-controls [data-action=breath]")
        // The game being played: what the latest step was given.
        vi.advanceTimersByTime(FRAMES_MS)
        const game = vi.mocked(step).mock.lastCall?.[0]
        const breather = game!.players[0].breather
        breather.energy = 0
        vi.advanceTimersByTime(FRAMES_MS)
        expect(breath.classList.contains("ready")).toBe(false)
        breather.energy = breather.breath.maxEnergy
        breather.cooldown = 0
        vi.advanceTimersByTime(FRAMES_MS)
        expect(breath.classList.contains("ready")).toBe(true)
    })

    it("lets a key take over from the drag", () => {
        const play = el("#play")
        pointer(play, "pointerdown", 100, 100)
        pointer(play, "pointermove", 100, 140)
        vi.advanceTimersByTime(FRAMES_MS)
        dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowLeft" }))
        const from = vi.mocked(step).mock.calls.length
        vi.advanceTimersByTime(FRAMES_MS)
        expect(moves(from)[0]?.pressed).toEqual({ x: -1, y: 0 })
        expect(moves(from)[0]?.held).toEqual([{ x: -1, y: 0 }])
        dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowLeft" }))
        // The finger still down holds nothing now.
        const after = vi.mocked(step).mock.calls.length
        vi.advanceTimersByTime(FRAMES_MS)
        expect(moves(after)[0]?.held).toEqual([])
        pointer(play, "pointerup", 100, 140)
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

    it("taps through the settings from pause: a slider, Players, Show D-pad, Back", () => {
        const button = el("#touch-controls [data-action=pause]")
        pointer(button, "pointerdown", 0, 0)
        pointer(button, "pointerup", 0, 0)
        vi.advanceTimersByTime(FRAMES_MS)
        tap("#overlay li[data-index='1']")
        expect(screen()).toBe("settings")
        const label = (i: number) =>
            el(`#overlay li[data-index='${i}']`).textContent
        expect(label(6)).toBe("Show D-pad Off")
        // Music volume's ◀: one step down, the cursor on it.
        tap("#overlay li[data-index='0'] [data-step='-1']")
        expect(label(0)).toBe("Music volume ◀ 6 ▶")
        expect(selectedItem()).toBe("Music volume ◀ 6 ▶")
        tap("#overlay li[data-index='1'] [data-step='1']")
        expect(label(1)).toBe("Effects volume ◀ 9 ▶")
        // Facing guide's ▶ and ◀ step it, wrapping round.
        tap("#overlay li[data-index='4'] [data-step='1']")
        expect(selectedItem()).toBe("Facing guide ◀ Aim ▶")
        tap("#overlay li[data-index='4'] [data-step='1']")
        expect(label(4)).toBe("Facing guide ◀ Arrow ▶")
        tap("#overlay li[data-index='4'] [data-step='-1']")
        expect(label(4)).toBe("Facing guide ◀ Aim ▶")
        expect(localStorage.getItem(SETTINGS_KEY)).toContain(
            '"facingGuide":"aim"'
        )
        // Players' ▶ steps it to Bump, which is saved.
        tap("#overlay li[data-index='5'] [data-step='1']")
        expect(label(5)).toBe("Players ◀ Bump ▶")
        expect(localStorage.getItem(SETTINGS_KEY)).toContain(
            '"playersBump":true'
        )
        // Show D-pad: shows at once and is saved.
        tap("#overlay li[data-index='6']")
        expect(label(6)).toBe("Show D-pad On")
        expect(document.body.dataset.dpad).toBe("on")
        expect(localStorage.getItem(SETTINGS_KEY)).toContain('"showDpad":true')
        tap("#overlay li[data-index='6']")
        expect(document.body.dataset.dpad).toBe("off")
        // Back returns to the pause menu.
        tap("#overlay li[data-index='7']")
        expect(screen()).toBe("pause")
        tap("#overlay li[data-index='0']")
        expect(screen()).toBe("playing")
    })

    // Regression (PR #56 review): the swipe kept holding left through the
    // game over, so the retry set left aside (ignoreHeld) and ArrowLeft
    // couldn't move left until the player swiped left again. A finger kept
    // down through the game over could do the same with a drag.
    it("lets go of a drag when the game ends, so the keys work after Retry", () => {
        const play = el("#play")
        pointer(play, "pointerdown", 100, 100)
        pointer(play, "pointermove", 60, 100)
        vi.advanceTimersByTime(FRAMES_MS)
        // Pausing (with another finger) and resuming keep the drag.
        const releases = touchReleases.count
        const pause = el("#touch-controls [data-action=pause]")
        pointer(pause, "pointerdown", 0, 0, 2)
        pointer(pause, "pointerup", 0, 0, 2)
        vi.advanceTimersByTime(FRAMES_MS)
        tap("#overlay li[data-index='0']")
        expect(screen()).toBe("playing")
        expect(touchReleases.count).toBe(releases)
        // The game ending lets go of it, and so does the retry.
        nextOutcome = "dead"
        vi.advanceTimersByTime(FRAMES_MS)
        expect(touchReleases.count).toBe(releases + 1)
        expect(screen()).toBe("game-over")
        vi.advanceTimersByTime(END_CONFIRM_DELAY * 1000)
        tap("#overlay li[data-index='0']")
        expect(screen()).toBe("playing")
        expect(touchReleases.count).toBe(releases + 2)
        // Nothing steers the new game until the player does.
        expect(moves(vi.mocked(step).mock.calls.length - 1)[0]?.held).toEqual(
            []
        )
        const from = vi.mocked(step).mock.calls.length
        dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowLeft" }))
        vi.advanceTimersByTime(FRAMES_MS)
        expect(moves(from)[0]?.pressed).toEqual({ x: -1, y: 0 })
        expect(moves(from).at(-1)?.held).toEqual([{ x: -1, y: 0 }])
        dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowLeft" }))
        pointer(play, "pointerup", 60, 100)
    })

    // Regression (PR #79 review): with the page in the background and no
    // pointercancel, the drag's direction stayed held.
    it("lets go of the drag when the window loses focus", () => {
        const play = el("#play")
        pointer(play, "pointerdown", 100, 100, 5)
        pointer(play, "pointermove", 140, 100, 5)
        vi.advanceTimersByTime(FRAMES_MS)
        dispatchEvent(new Event("blur"))
        vi.advanceTimersByTime(FRAMES_MS)
        expect(screen()).toBe("pause")
        tap("#overlay li[data-index='0']")
        expect(screen()).toBe("playing")
        // The finger's lift never came, yet nothing is held.
        const from = vi.mocked(step).mock.calls.length
        vi.advanceTimersByTime(FRAMES_MS)
        expect(moves(from).at(-1)?.held).toEqual([])
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
