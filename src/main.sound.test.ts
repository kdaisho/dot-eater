// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { MASTER_LEVEL, MUSIC_LEVEL } from "./audio"
import { defaultSettings, SETTINGS_KEY } from "./settings"
import { fakeContext } from "./test/fakeAudio"

// main's sound end to end: nothing before the first key press, then the
// saved volumes, live volume changes from the settings screen, and the
// music frozen while paused. Runs on a fake AudioContext. (A separate file,
// since main is imported once per module graph and reads storage on
// import.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

const context = fakeContext()
const AudioContext = vi.fn(function () {
    return context
})
vi.stubGlobal("AudioContext", AudioContext)
// Stage music is recorded files; keep them loading rather than reaching
// for a server, so stages stay silent and the tests see no fetch errors.
vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => undefined))
)

// Key presses go to the document, as the browser's do, and bubble on to
// the window's keyboard source.
function pressAndTick(code: string) {
    document.dispatchEvent(
        new KeyboardEvent("keydown", { code, bubbles: true })
    )
    document.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }))
    vi.advanceTimersByTime(100)
}

// Let `seconds` pass on the audio clock and the timers, together, in
// 25 ms steps.
function wait(seconds: number) {
    for (let ms = 0; ms < seconds * 1000; ms += 25) {
        context.currentTime += 0.025
        vi.advanceTimersByTime(25)
    }
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const lastGain = (n: number) => context.gains[n].gain.events.at(-1)?.[1]

describe("main's sound", () => {
    it("unlocks on a key, applies volumes live and freezes on pause", async () => {
        vi.useFakeTimers()
        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify({
                ...defaultSettings(),
                musicVolume: 4,
                effectsVolume: 6,
            })
        )
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        vi.advanceTimersByTime(500)
        expect(AudioContext).not.toHaveBeenCalled()

        // The first key press unlocks: the saved volumes, and the title
        // tune.
        pressAndTick("ArrowDown")
        expect(AudioContext).toHaveBeenCalledTimes(1)
        expect(lastGain(0)).toBe(MASTER_LEVEL)
        expect(lastGain(1)).toBeCloseTo(0.16 * MUSIC_LEVEL)
        expect(lastGain(2)).toBeCloseTo(0.36)
        expect(context.sources.length).toBeGreaterThan(0)

        // Settings: a music volume step applies at once.
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("settings")
        pressAndTick("ArrowRight")
        expect(lastGain(1)).toBeCloseTo(0.25 * MUSIC_LEVEL)
        pressAndTick("ArrowRight")
        expect(lastGain(1)).toBeCloseTo(0.36 * MUSIC_LEVEL)
        pressAndTick("Escape")

        // Play, then pause: no new notes while paused.
        for (let i = 0; i < 3; i++) pressAndTick("ArrowUp")
        pressAndTick("Space")
        pressAndTick("ArrowDown")
        for (let i = 0; i < 4; i++) pressAndTick("Space")
        expect(screen()).toBe("playing")
        wait(1)
        pressAndTick("KeyP")
        expect(screen()).toBe("pause")
        const count = context.sources.length
        wait(3)
        expect(context.sources.length).toBe(count)

        // Muting from the pause screen's settings applies at once too.
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(lastGain(0)).toBe(0)
        pressAndTick("Space")
        expect(lastGain(0)).toBe(MASTER_LEVEL)
        pressAndTick("Escape")

        // Resumed, the tune goes on.
        pressAndTick("KeyP")
        expect(screen()).toBe("playing")
        wait(1)
        expect(context.sources.length).toBeGreaterThan(count)
    })
})
