import { describe, expect, it } from "vite-plus/test"
import { LOOKS } from "./palette"
import { missingGlyphs, logoText, menuText } from "./pixelType"
import { CHARACTER_ORDER } from "./promo3Cuts"

describe("the promo's lettering", () => {
    it("has a glyph for every word the promo shows", () => {
        const words = [
            "DOT EATER",
            "PLAY FREE",
            "kdaisho.github.io/dot-eater",
            "Keyboard · Gamepad · Touch",
            ...CHARACTER_ORDER.flatMap((a) => [
                LOOKS[a].name,
                LOOKS[a].ability,
                LOOKS[a].sound,
            ]),
        ]
        expect(words.flatMap(missingGlyphs)).toEqual([])
    })

    it("draws the menu font bold on an 8-pixel advance", () => {
        const art = menuText("I", "#fff")
        expect(art.height).toBe(7)
        // The I's top bar: five dots, each 2 pixels wide.
        expect(art.rects.filter((r) => r.y === 0)).toHaveLength(5)
        expect(menuText("II", "#fff").width).toBe(14)
    })

    it("draws the logo's face over its side and outline", () => {
        const art = logoText("T")
        const colours = art.rects.map((r) => r.colour)
        // The face (gold) comes last, over the dark outline and side.
        expect(colours.at(-1)).toBe("#fce0a8")
        expect(colours[0]).toBe("#401800")
        expect(art.rects.every((r) => r.x >= -1 && r.x < art.width)).toBe(true)
    })
})
