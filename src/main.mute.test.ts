// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { defaultSettings, SETTINGS_KEY } from "./settings"

// main's mute button: on every screen, unmuted at first, saving the mute
// like the settings screen does, and agreeing with that screen when
// pressed on it. (A separate file, since main is imported once per module
// graph and reads storage on import.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

function pressAndTick(code: string) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
    vi.advanceTimersByTime(100)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => li.textContent)
const saved = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null")
const mute = () => document.querySelector<HTMLButtonElement>("#mute")!

describe("main's mute button", () => {
    it("mutes from anywhere, in step with the settings screen", async () => {
        vi.useFakeTimers()
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")

        expect(screen()).toBe("title")
        expect(mute().getAttribute("aria-pressed")).toBe("false")
        mute().click()
        expect(saved()).toEqual({ ...defaultSettings(), muted: true })
        expect(mute().getAttribute("aria-pressed")).toBe("true")

        // The settings screen shows it, and the button there changes it
        // on the screen too, so the next change there keeps it.
        for (let i = 0; i < 3; i++) pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("settings")
        expect(items()).toContain("Mute On")
        mute().click()
        expect(items()).toContain("Mute Off")
        pressAndTick("ArrowRight")
        expect(selectedItem()).toBe("Music volume ◀ 8 ▶")
        expect(saved()).toEqual({ ...defaultSettings(), musicVolume: 8 })

        // Muting on the settings screen shows on the button.
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(selectedItem()).toBe("Mute On")
        expect(mute().getAttribute("aria-pressed")).toBe("true")
    })
})
