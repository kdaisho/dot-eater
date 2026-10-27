// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import type { Pad } from "./gamepad"

// main with a gamepad: the pad drives the menus and play, a toast reports
// connects and disconnects, and losing the pad mid-game pauses. (A separate
// file, since main is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// Keep the game from ending on its own.
vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return { ...actual, step: vi.fn(() => null) }
})

let pads: (Pad | null)[] = []

function pad(buttons: number[] = [], index = 0): Pad {
    return {
        index,
        buttons: Array.from({ length: 17 }, (_, i) => ({
            pressed: buttons.includes(i),
        })),
        axes: [0, 0, 0, 0],
    }
}

function padEvent(type: string, index = 0) {
    dispatchEvent(Object.assign(new Event(type), { gamepad: { index } }))
}

const A = 0
const START = 9
const UP = 12
const DOWN = 13
const RIGHT = 15

// Hold the buttons for a few frames, then let go for a few.
function tap(...buttons: number[]) {
    pads = [pad(buttons)]
    vi.advanceTimersByTime(100)
    pads = [pad()]
    vi.advanceTimersByTime(100)
}

// With two pads listed, hold the buttons on pad `index` for a few frames,
// then let go for a few.
function tapPad(index: number, ...buttons: number[]) {
    pads = [pad(index === 0 ? buttons : []), pad(index === 1 ? buttons : [], 1)]
    vi.advanceTimersByTime(100)
    pads = [pad(), pad([], 1)]
    vi.advanceTimersByTime(100)
}

function disconnect() {
    pads = []
    padEvent("gamepaddisconnected")
}

// Connect an idle pad and let a frame list it (a button held when a pad is
// first listed doesn't press).
function connect() {
    pads = [pad()]
    padEvent("gamepadconnected")
    vi.advanceTimersByTime(20)
}

const screen = () =>
    document.querySelector<HTMLElement>("#overlay")?.dataset.screen ?? "playing"
const overlay = () => document.querySelector<HTMLElement>("#overlay")
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
// The card a player's cursor is on (player 1's is the selected one).
const selectedCard = () =>
    overlay()?.querySelector<HTMLElement>("li.card.selected")?.dataset.animal
const cardOf = (player: 1 | 2) =>
    overlay()?.querySelector<HTMLElement>(`li.card.p${player}`)?.dataset.animal
// The toast's text, or undefined while it is hidden (empty).
const toast = () => document.querySelector("#toast")?.textContent || undefined

describe("main with a gamepad", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        Object.defineProperty(navigator, "getGamepads", {
            configurable: true,
            value: () => pads,
        })
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
    })

    // Regression: the region was only added with a toast's text in it,
    // which screen readers don't announce.
    it("puts the empty toast live region in place at startup", () => {
        const region = document.querySelector("#toast")
        expect(region?.getAttribute("role")).toBe("status")
        expect(region?.textContent).toBe("")
    })

    it("shows a toast on connect that hides after about 2 s", () => {
        connect()
        expect(toast()).toBe("Controller connected")
        vi.advanceTimersByTime(1900)
        expect(toast()).toBe("Controller connected")
        vi.advanceTimersByTime(200)
        expect(toast()).toBeUndefined()
    })

    it("does not pause or leave the menu when lost on the title", () => {
        expect(screen()).toBe("title")
        disconnect()
        expect(toast()).toBe("Controller disconnected")
        expect(screen()).toBe("title")
        connect()
    })

    // In 1-player any pad drives player 1; in a 2-player mode pads take
    // players in connection order from stage select on. The title shares
    // them, so any pad picks the mode.
    describe("with two pads", () => {
        it("lets either pad drive player 1 in 1-player", () => {
            pads = [pad(), pad([], 1)]
            padEvent("gamepadconnected", 1)
            vi.advanceTimersByTime(100)
            expect(selectedItem()).toBe("1 player")
            tapPad(1, DOWN)
            expect(selectedItem()).toBe("Co-op")
            tapPad(0, UP)
            expect(selectedItem()).toBe("1 player")
            tapPad(1, A)
            expect(screen()).toBe("stage-select")
            tapPad(0, A)
            expect(screen()).toBe("character-select")
            const first = selectedCard()
            tapPad(1, RIGHT)
            expect(selectedCard()).not.toBe(first)
            tapPad(1, START)
            expect(screen()).toBe("stage-select")
            tapPad(0, START)
            expect(screen()).toBe("title")
        })

        it("gives pad 1 to player 1 and pad 2 to player 2 in 2-player", () => {
            tapPad(1, DOWN)
            expect(selectedItem()).toBe("Co-op")
            tapPad(0, A)
            expect(screen()).toBe("stage-select")
            // Stage select follows player 1, and pad 2 is player 2's now.
            tapPad(1, A)
            expect(screen()).toBe("stage-select")
            tapPad(0, A)
            expect(screen()).toBe("character-select")
            const p1 = cardOf(1)
            const p2 = cardOf(2)
            tapPad(1, RIGHT)
            expect(cardOf(1)).toBe(p1)
            expect(cardOf(2)).not.toBe(p2)
            tapPad(0, RIGHT)
            expect(cardOf(1)).not.toBe(p1)
            tapPad(1, A)
            expect(
                overlay()?.querySelector("li.card.p2 .card-player.p2")
                    ?.textContent
            ).toBe("2P ✓")
            expect(screen()).toBe("character-select")
            // Player 1 isn't ready, so its back leaves character select.
            tapPad(0, START)
            expect(screen()).toBe("stage-select")
        })

        it("shares the pads again on the title and in 1-player", () => {
            tapPad(0, START)
            expect(screen()).toBe("title")
            tapPad(1, UP)
            expect(selectedItem()).toBe("1 player")
            tapPad(1, A)
            expect(screen()).toBe("stage-select")
            tapPad(1, A)
            expect(screen()).toBe("character-select")
            const first = selectedCard()
            tapPad(1, RIGHT)
            expect(selectedCard()).not.toBe(first)
            tapPad(1, START)
            tapPad(0, START)
            expect(screen()).toBe("title")
            // The tests below use one pad.
            pads = [pad()]
            padEvent("gamepaddisconnected", 1)
            vi.advanceTimersByTime(20)
        })
    })

    it("plays through the menus with A", () => {
        tap(A)
        expect(screen()).toBe("stage-select")
        tap(A)
        expect(screen()).toBe("character-select")
        tap(A)
        expect(screen()).toBe("playing")
    })

    it("pauses and resumes with Start", () => {
        tap(START)
        expect(screen()).toBe("pause")
        tap(START)
        expect(screen()).toBe("playing")
    })

    // Regression: every disconnect paused play.
    it("doesn't pause when an idle second pad disconnects", () => {
        pads = [pad(), pad([], 1)]
        padEvent("gamepadconnected", 1)
        vi.advanceTimersByTime(100)
        pads = [pad()]
        padEvent("gamepaddisconnected", 1)
        expect(toast()).toBe("Controller disconnected")
        expect(screen()).toBe("playing")
    })

    it("pauses when the pad disconnects during play", () => {
        vi.advanceTimersByTime(3000)
        expect(toast()).toBeUndefined()
        disconnect()
        expect(screen()).toBe("pause")
        expect(toast()).toBe("Controller disconnected")
        vi.advanceTimersByTime(2100)
        expect(toast()).toBeUndefined()
    })

    it("keeps a reconnect from hiding the new toast early", () => {
        connect()
        vi.advanceTimersByTime(1500)
        disconnect()
        vi.advanceTimersByTime(1000)
        // The first toast's timer was cleared; the second still shows.
        expect(toast()).toBe("Controller disconnected")
        vi.advanceTimersByTime(1100)
        expect(toast()).toBeUndefined()
    })

    // Regression: a throw from polling broke the frame chain for good.
    it("keeps running when polling the pads throws", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        connect()
        expect(screen()).toBe("pause")
        const bad = {
            get index(): number {
                throw new Error("bad pad")
            },
        }
        pads = [bad as unknown as Pad]
        vi.advanceTimersByTime(100)
        // Logged once, not every frame.
        expect(error).toHaveBeenCalledTimes(1)
        pads = [pad()]
        vi.advanceTimersByTime(100)
        tap(START)
        expect(screen()).toBe("playing")
        error.mockRestore()
    })
})
