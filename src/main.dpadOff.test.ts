// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { defaultSettings, serializeSettings, SETTINGS_KEY } from "./settings"

// main without a touch screen, Show D-pad saved on (from a phone, say): the
// D-pad stays hidden, as the Settings row does. (A separate file, since
// main is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

describe("main without a touch screen", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        localStorage.setItem(
            SETTINGS_KEY,
            serializeSettings({ ...defaultSettings(), showDpad: true })
        )
        document.body.innerHTML =
            '<main id="play"><canvas id="game"></canvas></main>'
        await import("./main")
    })

    it("keeps the D-pad and the pause button hidden", () => {
        expect(document.body.dataset.touch).toBe("off")
        expect(document.body.dataset.dpad).toBe("off")
    })
})
