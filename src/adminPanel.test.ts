// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { hashPassphrase } from "./adminHash"
import { createAdminPanel, type AdminPanelOptions } from "./adminPanel"

let on = false
function setup(over: Partial<AdminPanelOptions> = {}) {
    const options: AdminPanelOptions = {
        hash: "",
        stageNames: ["Classic", "Wrap maze"],
        isOn: () => on,
        turnOn: vi.fn(() => {
            on = true
        }),
        turnOff: vi.fn(() => {
            on = false
        }),
        jump: vi.fn(),
        closed: vi.fn(),
        ...over,
    }
    const panel = createAdminPanel(document, options)
    panel.open()
    return { panel, options }
}

const root = () => document.querySelector<HTMLElement>("#admin")
const heading = () => root()?.querySelector("h1")?.textContent
const buttons = () =>
    [...(root()?.querySelectorAll("button") ?? [])].map((b) => b.textContent)
const click = (label: string) =>
    [...(root()?.querySelectorAll("button") ?? [])]
        .find((b) => b.textContent === label)!
        .click()

async function submit(passphrase: string) {
    root()!.querySelector<HTMLInputElement>("#admin-passphrase")!.value =
        passphrase
    root()!
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { cancelable: true }))
    // Let the hash settle.
    await vi.waitFor(() =>
        expect(
            root()?.querySelector<HTMLButtonElement>("[type=submit]")?.disabled
        ).not.toBe(true)
    )
}

beforeEach(() => {
    on = false
    document.body.innerHTML = ""
})

describe("the admin panel", () => {
    it("says when no passphrase is set for the build", () => {
        setup()
        expect(root()?.textContent).toMatch(/isn't set up on this build/)
        expect(root()?.querySelector("input")).toBeNull()
    })

    it("turns debug mode on with the passphrase, not another", async () => {
        const { options } = setup({ hash: await hashPassphrase("open sesame") })
        expect(heading()).toBe("Admin")
        await submit("guess")
        expect(options.turnOn).not.toHaveBeenCalled()
        expect(root()?.querySelector(".admin-error")?.textContent).toBe(
            "That passphrase is wrong."
        )
        await submit("open sesame")
        await vi.waitFor(() => expect(heading()).toBe("Debug mode"))
        expect(options.turnOn).toHaveBeenCalledOnce()
        expect(buttons()).toEqual([
            "1 Classic",
            "2 Wrap maze",
            "Story ending",
            "End roll",
            "Turn off debug mode",
            "Close",
        ])
    })

    it("jumps, closing first", () => {
        on = true
        const { panel, options } = setup({ hash: "x" })
        click("2 Wrap maze")
        expect(panel.isOpen).toBe(false)
        expect(root()).toBeNull()
        expect(options.closed).toHaveBeenCalled()
        expect(options.jump).toHaveBeenCalledWith({ kind: "stage", level: 1 })
        panel.open()
        click("End roll")
        expect(options.jump).toHaveBeenLastCalledWith({ kind: "endRoll" })
    })

    it("turns debug mode off, back to the passphrase", () => {
        on = true
        const { options } = setup({ hash: "x" })
        click("Turn off debug mode")
        expect(options.turnOff).toHaveBeenCalled()
        expect(root()?.querySelector("#admin-passphrase")).not.toBeNull()
    })

    it("keeps keys and clicks from the game, and closes on Escape", () => {
        const { panel } = setup({ hash: "x" })
        const heard = vi.fn()
        window.addEventListener("keydown", heard)
        document.addEventListener("click", heard)
        const input = root()!.querySelector("input")!
        input.dispatchEvent(
            new KeyboardEvent("keydown", { code: "Space", bubbles: true })
        )
        input.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        expect(heard).not.toHaveBeenCalled()
        input.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
        expect(panel.isOpen).toBe(false)
        window.removeEventListener("keydown", heard)
        document.removeEventListener("click", heard)
    })
})
