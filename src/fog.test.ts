import { describe, expect, it } from "vite-plus/test"
import { fogDistance, fogWrap, lightBand, lightCentres } from "./fog"
import { cellsFrom } from "./test/helpers"
import { vec2 } from "./vec2"

describe("fogWrap", () => {
    it("wraps only the axes with a tunnel", () => {
        const closed = cellsFrom([
            [1, 1, 1],
            [1, 0, 1],
            [1, 1, 1],
        ])
        expect(fogWrap(closed)).toEqual({ x: false, y: false })
        const sideways = cellsFrom([
            [1, 1, 1],
            [0, 0, 0],
            [1, 1, 1],
        ])
        expect(fogWrap(sideways)).toEqual({ x: true, y: false })
        const both = cellsFrom([
            [1, 0, 1],
            [0, 0, 0],
            [1, 0, 1],
        ])
        expect(fogWrap(both)).toEqual({ x: true, y: true })
    })
})

describe("fogDistance", () => {
    const none = { x: false, y: false }
    const both = { x: true, y: true }

    it("is the straight-line distance in cells", () => {
        expect(fogDistance(vec2(1, 1), vec2(4, 5), 20, 20, none)).toBe(5)
    })

    it("goes through a tunnel when that is shorter, only on wrapping axes", () => {
        expect(fogDistance(vec2(0, 0), vec2(9, 0), 10, 10, both)).toBe(1)
        expect(fogDistance(vec2(0, 0), vec2(9, 0), 10, 10, none)).toBe(9)
        expect(fogDistance(vec2(0, 1), vec2(0, 8), 10, 10, both)).toBe(3)
    })

    it("handles positions poking over an edge mid-tunnel", () => {
        expect(fogDistance(vec2(-0.5, 0), vec2(9, 0), 10, 10, both)).toBe(0.5)
        expect(fogDistance(vec2(9.5, 0), vec2(0, 0), 10, 10, both)).toBe(0.5)
    })
})

describe("lightCentres and lightBand", () => {
    it("uses only the player without wrapping, lighting the whole map", () => {
        const wrap = { x: false, y: false }
        const centres = lightCentres(vec2(2, 3), 10, 8, wrap)
        expect(centres).toEqual([vec2(2, 3)])
        expect(lightBand(centres[0], 10, 8, wrap)).toEqual({
            left: 0,
            top: 0,
            right: 10,
            bottom: 8,
        })
    })

    it("splits a wrapping axis into bands that tile the map", () => {
        const wrap = { x: true, y: false }
        const bands = lightCentres(vec2(1, 3), 10, 8, wrap)
            .map((c) => lightBand(c, 10, 8, wrap))
            .filter((b) => b !== null)
            .sort((a, b) => a.left - b.left)
        // The player's band reaches half a map either side of its centre
        // (1.5); the rest is nearer the copy one map to the right.
        expect(bands).toEqual([
            { left: 0, top: 0, right: 6.5, bottom: 8 },
            { left: 6.5, top: 0, right: 10, bottom: 8 },
        ])
    })
})
