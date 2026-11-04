// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { CARDS, cardText } from "./cards"
import { cardsPageStale } from "./cardsView"
import { hideOverlay, overlayTap, showCards, showTitle } from "./ui"

// The Cards page (KDA-320) as ui.ts shows it: the selected card with its
// text, its neighbours, arrows and dots to tap, and Back.

// canvas-confetti touches a 2D canvas context on import, which happy-dom
// doesn't provide.
vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

afterEach(() => {
    document.body.innerHTML = ""
})

const page = () => document.querySelector<HTMLElement>("#overlay")
const current = () => page()?.querySelector<HTMLElement>(".cards-current")
const textOf = (selector: string, root = current()) =>
    root?.querySelector(selector)?.textContent

describe("showCards", () => {
    it("shows the selected card's name, ability, quote and attack", () => {
        showCards(0)
        expect(page()?.dataset.screen).toBe("cards")
        expect(page()?.querySelector("h1")?.textContent).toBe("CARDS")
        expect(textOf(".cards-count", page())).toBe("No.01/15")
        expect(textOf(".tcard-name")).toBe("DRAGON")
        expect(textOf(".tcard-tag")).toBe("HERO")
        expect(textOf(".tcard-ability")).toBe("FIRE BREATH")
        expect(textOf(".tcard-quote")).toBe("Hot-headed and brave.")
        expect(textOf(".tcard-attack")).toBe("FIRE BREATH20 EN")
        expect(current()?.textContent).toContain("CHARGE Charge it to spread")
        expect(current()?.textContent).toContain("PLAYABLE FROM THE START")
        expect(current()?.getAttribute("aria-label")).toBe("No.01 DRAGON")
    })

    it("shows an enemy's hit, weakness and first stage", () => {
        const snake = CARDS.findIndex((c) => c.name === "SNAKE")
        showCards(snake)
        expect(textOf(".cards-count", page())).toBe("No.12/15")
        expect(textOf(".tcard-name")).toBe("SNAKE")
        expect(textOf(".tcard-tag")).toBe("ENEMY")
        expect(textOf(".tcard-attack")).toBe("BREATH-20")
        const t = cardText(CARDS[snake]!)
        expect(current()?.textContent).toContain(`WEAK ${t.note.text}`)
        expect(textOf(".tcard-foot")).toBe(t.foot.join(""))
        expect(t.foot.at(-1)).toBe("FIRST SEEN: STAGE 1 · CLASSIC")
    })

    it("shows the bosses' names in red", () => {
        showCards(14)
        expect(textOf(".tcard-name")).toBe("PHANTOM LORD")
        expect(current()?.querySelector(".tcard-name.boss")).not.toBeNull()
        expect(textOf(".tcard-tag")).toBe("BOSS")
    })

    it("has the neighbours, the arrows and the dots go to their card on a tap", () => {
        showCards(0)
        const tapOn = (selector: string) =>
            overlayTap(page()?.querySelector(selector) ?? null)
        expect(tapOn(".cards-arrow.prev")).toEqual({ kind: "item", index: 14 })
        expect(tapOn(".cards-arrow.next")).toEqual({ kind: "item", index: 1 })
        expect(tapOn(".cards-peek.prev .tcard-art")).toEqual({
            kind: "item",
            index: 14,
        })
        expect(tapOn(".cards-peek.next .tcard-name")).toEqual({
            kind: "item",
            index: 1,
        })
        expect(
            textOf(".tcard-name", page()?.querySelector(".cards-peek.next"))
        ).toBe("PENGUIN")
        expect(tapOn(".cards-dot[data-index='9']")).toEqual({
            kind: "item",
            index: 9,
        })
        // The card itself does nothing.
        expect(tapOn(".cards-current .tcard-name")).toEqual({ kind: "panel" })
        expect(tapOn(".cards-back")).toEqual({ kind: "back" })
    })

    it("lights the selected card's dot, in groups of heroes, enemies and bosses", () => {
        showCards(6)
        const groups = [...(page()?.querySelectorAll(".cards-dot-group") ?? [])]
        expect(groups.map((g) => g.children.length)).toEqual([5, 8, 2])
        const on = [...(page()?.querySelectorAll(".cards-dot.on") ?? [])]
        expect(on.map((d) => (d as HTMLElement).dataset.index)).toEqual(["6"])
    })

    it("replaces the overlay, and goes with hideOverlay", () => {
        showTitle()
        showCards(3)
        expect(document.querySelectorAll("#overlay")).toHaveLength(1)
        expect(document.querySelector("#backdrop")).toBeNull()
        showCards(4)
        expect(document.querySelectorAll("#overlay")).toHaveLength(1)
        expect(textOf(".tcard-name")).toBe("BOAR")
        hideOverlay()
        expect(page()).toBeNull()
    })

    it("isn't made again while the font is as it was", () => {
        showCards(0)
        expect(cardsPageStale()).toBe(false)
    })
})
