// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { ADMIN_KEY } from "./admin"
import { hashPassphrase } from "./adminHash"
import { type Outcome } from "./game"
import { PROGRESS_KEY } from "./progress"

// main's debug mode (admin.ts): #admin opens the admin panel, the
// passphrase turns debug mode on, every stage opens in stage select, the
// jumps go to a stage, the story's ending and the end roll, and a clear
// isn't saved. (A separate file, since main is imported once per module
// graph and reads the hash and storage on import.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

let nextOutcome: Outcome | null = null
vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return {
        ...actual,
        step: vi.fn(() => {
            const outcome = nextOutcome
            nextOutcome = null
            return outcome
        }),
    }
})

function pressAndTick(code: string) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
    vi.advanceTimersByTime(100)
}

const admin = () => document.querySelector<HTMLElement>("#admin")
const badge = () => document.querySelector<HTMLElement>("#admin-badge")!
const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () =>
    document.querySelector("#end-roll")
        ? "end-roll"
        : (overlay()?.dataset.screen ?? "playing")
const lockedItems = () =>
    overlay()?.querySelectorAll("li[aria-disabled=true]").length
const click = (label: string) =>
    [...(admin()?.querySelectorAll("button") ?? [])]
        .find((b) => b.textContent === label)!
        .click()

describe("main's debug mode", () => {
    it("opens at #admin, unlocks with the passphrase, and jumps", async () => {
        vi.useFakeTimers()
        ;(globalThis as { adminHash?: string }).adminHash =
            await hashPassphrase("open sesame")
        location.hash = "#admin"
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        expect(admin()).not.toBeNull()

        const input = admin()!.querySelector<HTMLInputElement>("input")!
        input.value = "open sesame"
        admin()!
            .querySelector("form")!
            .dispatchEvent(new Event("submit", { cancelable: true }))
        await vi.waitFor(() =>
            expect(admin()?.querySelector("h1")?.textContent).toBe("Debug mode")
        )
        expect(localStorage.getItem(ADMIN_KEY)).toBe(
            (globalThis as { adminHash?: string }).adminHash
        )
        expect(badge().hidden).toBe(false)

        // The story's ending, then the end roll.
        click("Story ending")
        expect(admin()).toBeNull()
        expect(location.hash).toBe("")
        expect(screen()).toBe("story-end")
        vi.advanceTimersByTime(2000)
        pressAndTick("Space")
        expect(screen()).toBe("end-roll")

        // Back to the title, then stage select: every stage open.
        location.hash = "#admin"
        dispatchEvent(new HashChangeEvent("hashchange"))
        click("Close")
        while (screen() !== "title") pressAndTick("Escape")
        pressAndTick("Space")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        expect(screen()).toBe("stage-select")
        expect(lockedItems()).toBe(0)

        // A stage from the panel, played and cleared: not saved.
        location.hash = "#admin"
        dispatchEvent(new HashChangeEvent("hashchange"))
        admin()!.querySelectorAll("button")[5].click()
        expect(screen()).toBe("difficulty-select")
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        nextOutcome = "won"
        vi.advanceTimersByTime(1000)
        expect(screen()).toBe("stage-clear")
        expect(localStorage.getItem(PROGRESS_KEY)).toBeNull()

        // The badge's Clear turns debug mode off and forgets it.
        badge().querySelector("button")!.click()
        expect(badge().hidden).toBe(true)
        expect(localStorage.getItem(ADMIN_KEY)).toBeNull()
    })
})
