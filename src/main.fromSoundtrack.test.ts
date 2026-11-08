// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"

// Back from the soundtrack player page (KDA-333): the game, loaded with
// ?from=soundtrack, opens on the title with the cursor on Soundtrack, not
// on the opening, and takes the query off the URL. (A separate file, since
// main is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

describe("main back from the soundtrack player", () => {
    it("opens on the title on Soundtrack and cleans the URL", async () => {
        // The opening plays on a normal load; only the query skips it.
        ;(globalThis as { skipOpening?: boolean }).skipOpening = false
        history.replaceState(null, "", "/dot-eater/?from=soundtrack#x")
        document.body.innerHTML = '<canvas id="game"></canvas>'
        vi.useFakeTimers()
        await import("./main")
        await vi.advanceTimersByTimeAsync(100)

        const overlay = document.querySelector<HTMLElement>("#overlay")
        expect(overlay?.dataset.screen).toBe("title")
        expect(
            overlay?.querySelector("li.selected")?.firstChild?.textContent
        ).toBe("Soundtrack")
        expect(location.search).toBe("")
        expect(location.pathname).toBe("/dot-eater/")
        expect(location.hash).toBe("#x")
    })
})
