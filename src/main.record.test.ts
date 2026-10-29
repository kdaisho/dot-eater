// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { levels } from "./levels"
import { tickCount, verify, type Recording } from "./replay"

// main with ?record: a real game of stage 1, paused for a while midway
// (with a visit to the settings), played until it is lost. The recording
// must download as JSON when the game over screen comes up, leave out the
// paused ticks and replay to the same end. (A separate file, since main is imported once per module graph
// and reads the URL on import.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

const keydown = (code: string) =>
    dispatchEvent(new KeyboardEvent("keydown", { code }))
const keyup = (code: string) =>
    dispatchEvent(new KeyboardEvent("keyup", { code }))

function pressAndTick(code: string) {
    keydown(code)
    keyup(code)
    vi.advanceTimersByTime(100)
}

const screen = () =>
    document.querySelector<HTMLElement>("#overlay")?.dataset.screen ?? "playing"

describe("main with ?record", () => {
    it("downloads a recording of each run that replays to its end", async () => {
        vi.useFakeTimers()
        history.replaceState(null, "", "/?record")
        const blobs: Blob[] = []
        URL.createObjectURL = vi.fn((blob: Blob) => {
            blobs.push(blob)
            return "blob:recording"
        })
        URL.revokeObjectURL = vi.fn()
        const names: string[] = []
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
            function (this: HTMLAnchorElement) {
                names.push(this.download)
            }
        )
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")

        expect(document.getElementById("rec-badge")?.textContent).toBe("● REC")
        pressAndTick("Space")
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("playing")

        // Walk a little, pause for two seconds or so, walk again.
        keydown("ArrowLeft")
        vi.advanceTimersByTime(1000)
        keyup("ArrowLeft")
        pressAndTick("Escape")
        expect(screen()).toBe("pause")
        vi.advanceTimersByTime(1000)
        // Settings from pause come back to the same paused game, which
        // carries on the same run (and recording) when resumed.
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("settings")
        vi.advanceTimersByTime(1000)
        pressAndTick("Escape")
        expect(screen()).toBe("pause")
        pressAndTick("Escape")
        expect(screen()).toBe("playing")
        keydown("ArrowRight")
        vi.advanceTimersByTime(1000)
        keyup("ArrowRight")

        // Standing still, the enemies take every life.
        for (let i = 0; i < 120 && screen() !== "game-over"; i++) {
            vi.advanceTimersByTime(1000)
        }
        expect(screen()).toBe("game-over")
        expect(names).toHaveLength(1)
        expect(names[0]).toMatch(
            /^dot-eater-stage1-solo-dragon-lost-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.json$/
        )
        expect(blobs[0].type).toBe("application/json")
        const recording = JSON.parse(await blobs[0].text()) as Recording
        expect(recording.final.kind).toBe("gameOver")
        expect(recording.final.ticks).toBeGreaterThan(0)
        // Beyond the game's own ticks, only the short ending outro: none
        // of the time paused or in the settings.
        const extra = tickCount(recording) - recording.final.ticks
        expect(extra).toBeGreaterThan(0)
        expect(extra).toBeLessThan(60)
        expect(verify(recording, levels)).toBe(true)

        // Retry (once the end screen takes confirm) is a new run, recorded
        // with a seed of its own.
        vi.advanceTimersByTime(1000)
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        for (let i = 0; i < 120 && screen() !== "game-over"; i++) {
            vi.advanceTimersByTime(1000)
        }
        expect(names).toHaveLength(2)
        const second = JSON.parse(await blobs[1].text()) as Recording
        expect(second.seed).not.toBe(recording.seed)
        expect(verify(second, levels)).toBe(true)
    })
})
