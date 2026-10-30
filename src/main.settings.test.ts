// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { defaultSettings, SETTINGS_KEY } from "./settings"

// main's settings screen end to end through the keyboard: opened from the
// title and from pause, every change saved at once, and Back to where it
// came from. A save that can't be read shows the defaults. (A separate
// file, since main is imported once per module graph and reads storage on
// import.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

function pressAndTick(code: string) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
    vi.advanceTimersByTime(100)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const items = () =>
    [...(overlay()?.querySelectorAll("li") ?? [])].map((li) => li.textContent)
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
const saved = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null")

describe("main's settings", () => {
    it("opens from the title and pause, saving every change", async () => {
        vi.useFakeTimers()
        localStorage.setItem(SETTINGS_KEY, "{oops")
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")

        // The title's menu ends with Settings.
        for (let i = 0; i < 3; i++) pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Settings")
        pressAndTick("Space")
        expect(screen()).toBe("settings")
        // The bad save gave the defaults; nothing is saved by just looking.
        expect(items()).toEqual([
            "Music volume ◀ 7 ▶",
            "Effects volume ◀ 8 ▶",
            "Mute Off",
            "Screen shake On",
            "Facing guide ◀ Arrow ▶",
            "Players ◀ Pass through ▶",
            "Controls",
            "Back",
        ])
        expect(localStorage.getItem(SETTINGS_KEY)).toBe("{oops")

        pressAndTick("ArrowRight")
        expect(selectedItem()).toBe("Music volume ◀ 8 ▶")
        expect(saved()).toEqual({ ...defaultSettings(), musicVolume: 8 })

        // Back to the title, still on Settings; opened again, the change
        // holds.
        pressAndTick("Escape")
        expect(screen()).toBe("title")
        expect(selectedItem()).toBe("Settings")
        pressAndTick("Space")
        expect(selectedItem()).toBe("Music volume ◀ 8 ▶")
        pressAndTick("Escape")

        // Play, pause and open the settings from the pause menu.
        for (let i = 0; i < 3; i++) pressAndTick("ArrowUp")
        pressAndTick("Space")
        pressAndTick("Space")
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        pressAndTick("KeyP")
        expect(screen()).toBe("pause")
        expect(items()).toEqual(["Resume", "Settings"])
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("settings")

        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(selectedItem()).toBe("Mute On")
        expect(saved()).toEqual({
            ...defaultSettings(),
            musicVolume: 8,
            muted: true,
        })

        // The Facing guide shows from pause too, and cycles both ways.
        pressAndTick("ArrowDown")
        pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Facing guide ◀ Arrow ▶")
        pressAndTick("ArrowRight")
        expect(selectedItem()).toBe("Facing guide ◀ Aim ▶")
        expect(saved()).toMatchObject({ facingGuide: "aim" })
        pressAndTick("ArrowRight")
        expect(selectedItem()).toBe("Facing guide ◀ Arrow ▶")
        pressAndTick("ArrowLeft")
        expect(selectedItem()).toBe("Facing guide ◀ Aim ▶")
        pressAndTick("ArrowLeft")
        expect(saved()).toMatchObject({ facingGuide: "arrow" })

        // So does Players (KDA-262).
        pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Players ◀ Pass through ▶")
        pressAndTick("Space")
        expect(selectedItem()).toBe("Players ◀ Bump ▶")
        expect(saved()).toMatchObject({ playersBump: true })

        // Back to the paused game, then on with it.
        pressAndTick("Escape")
        expect(screen()).toBe("pause")
        expect(selectedItem()).toBe("Settings")
        pressAndTick("KeyP")
        expect(screen()).toBe("playing")
    })
})
