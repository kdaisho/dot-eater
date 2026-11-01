// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { LOGO_SECONDS } from "./opening"

// main's opening (opening.ts) on a fresh load: the studio logo waits for
// any key, holds, then the title rises; Start goes to the title menu.
// (A separate file, since main is imported once per module graph, and the
// other main tests skip the opening; see src/test/setup.ts.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

const FRAMES_MS = 100

function pressAndTick(code: string, key = "") {
    dispatchEvent(new KeyboardEvent("keydown", { code, key }))
    dispatchEvent(new KeyboardEvent("keyup", { code, key }))
    vi.advanceTimersByTime(FRAMES_MS)
}

const layer = () => document.querySelector<HTMLCanvasElement>("#opening")
const overlay = () =>
    document.querySelector<HTMLElement>("#overlay")?.dataset.screen

describe("main's opening", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        delete (globalThis as { skipOpening?: boolean }).skipOpening
        document.body.innerHTML =
            '<main id="play"><canvas id="game"></canvas></main>'
        await import("./main")
        vi.advanceTimersByTime(FRAMES_MS)
    })

    it("starts on the studio logo, over everything, with no menu", () => {
        expect(layer()?.hidden).toBe(false)
        expect(overlay()).toBeUndefined()
    })

    it("goes on with any key, even one bound to nothing", () => {
        pressAndTick("KeyQ", "q")
        // Frame by frame, as the loop caps the time one frame catches up.
        for (let ms = 0; ms < LOGO_SECONDS * 1000 + 500; ms += FRAMES_MS)
            vi.advanceTimersByTime(FRAMES_MS)
        // The title is rising; a press skips to its menu.
        pressAndTick("KeyQ", "q")
        expect(layer()?.hidden).toBe(false)
    })

    it("opens the title menu on Start", () => {
        pressAndTick("Space", " ")
        expect(layer()?.hidden).toBe(true)
        expect(overlay()).toBe("title")
    })
})
