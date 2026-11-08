// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { fakeContext } from "./test/fakeAudio"

// main's Soundtrack (KDA-333): picking it on the title leaves for the
// player page (soundtrack/), once, with the title tune stopped. (A
// separate file, since main is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

const context = fakeContext()
vi.stubGlobal(
    "AudioContext",
    vi.fn(function () {
        return context
    })
)
vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {}))
)

const leaveFor = vi.fn()
;(globalThis as { leaveFor?: (url: string) => void }).leaveFor = leaveFor

async function pressAndTick(code: string) {
    document.dispatchEvent(
        new KeyboardEvent("keydown", { code, bubbles: true })
    )
    document.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }))
    await vi.advanceTimersByTimeAsync(100)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const selectedItem = () =>
    overlay()?.querySelector("li.selected")?.firstChild?.textContent

// Whether the title's chip tune makes notes over the next second.
async function titleTunePlays(): Promise<boolean> {
    const before = context.oscillators.length
    for (let i = 0; i < 10; i++) {
        context.currentTime += 0.1
        await vi.advanceTimersByTimeAsync(100)
    }
    return context.oscillators.length > before
}

describe("main's Soundtrack", () => {
    it("leaves for the player page, with the music stopped", async () => {
        vi.useFakeTimers()
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        await vi.advanceTimersByTimeAsync(100)

        for (let i = 0; i < 4; i++) await pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Soundtrack")
        expect(await titleTunePlays()).toBe(true)
        expect(leaveFor).not.toHaveBeenCalled()

        await pressAndTick("Space")
        expect(leaveFor).toHaveBeenCalledExactlyOnceWith("soundtrack/")
        expect(overlay()).toBeNull()
        expect(await titleTunePlays()).toBe(false)

        // Keys pressed while the page loads don't leave again.
        await pressAndTick("Space")
        await pressAndTick("Escape")
        expect(leaveFor).toHaveBeenCalledOnce()
    })
})
