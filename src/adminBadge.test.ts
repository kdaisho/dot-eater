// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { createAdminBadge } from "./adminBadge"

const badge = () => document.querySelector<HTMLElement>("#admin-badge")!
const clear = () => badge().querySelector("button")!

describe("createAdminBadge", () => {
    beforeEach(() => {
        document.body.innerHTML = ""
    })

    it("shows the label while debug mode is on, and hides it while off", () => {
        let on = true
        const shown = createAdminBadge(document, {
            isOn: () => on,
            clear: () => {},
        })
        expect(badge().hidden).toBe(false)
        expect(badge().textContent).toContain("DEBUG MODE")
        on = false
        shown.update()
        expect(badge().hidden).toBe(true)
    })

    it("clears debug mode and hides, the click going no further", () => {
        let on = true
        const clicked = vi.fn()
        document.addEventListener("click", clicked)
        createAdminBadge(document, {
            isOn: () => on,
            clear: () => {
                on = false
            },
        })
        expect(clear().getAttribute("aria-label")).toBe("Clear debug mode")
        clear().click()
        expect(on).toBe(false)
        expect(badge().hidden).toBe(true)
        expect(clicked).not.toHaveBeenCalled()
        document.removeEventListener("click", clicked)
    })

    it("keeps Space and Enter on the button from the game", () => {
        createAdminBadge(document, { isOn: () => true, clear: () => {} })
        const pressed = vi.fn()
        document.addEventListener("keydown", pressed)
        for (const key of [" ", "Enter"]) {
            clear().dispatchEvent(
                new KeyboardEvent("keydown", { key, bubbles: true })
            )
        }
        expect(pressed).not.toHaveBeenCalled()
        document.removeEventListener("keydown", pressed)
    })
})
