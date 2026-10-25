import { describe, expect, it } from "vite-plus/test"
import { Cell } from "./constants"
import { hasDots, loopPos, setDots } from "./level"
import { cellsFrom } from "./test/helpers"
import { vec2 } from "./vec2"

const map = [
    [1, 0, 1],
    [0, 0, 0],
    [1, 0, 1],
] as const

describe("loopPos", () => {
    const cells = cellsFrom(map)

    it("leaves in-bounds positions alone", () => {
        expect(loopPos(cells, vec2(1, 1))).toEqual(vec2(1, 1))
    })

    it("wraps each edge onto the opposite edge", () => {
        expect(loopPos(cells, vec2(-1, 1))).toEqual(vec2(2, 1))
        expect(loopPos(cells, vec2(3, 1))).toEqual(vec2(0, 1))
        expect(loopPos(cells, vec2(1, -1))).toEqual(vec2(1, 2))
        expect(loopPos(cells, vec2(1, 3))).toEqual(vec2(1, 0))
    })

    it("returns a new object", () => {
        const v = vec2(1, 1)
        expect(loopPos(cells, v)).not.toBe(v)
    })
})

describe("setDots / hasDots", () => {
    it("fills empty cells except the player's, leaving walls alone", () => {
        const cells = cellsFrom(map)
        setDots(cells, vec2(1, 1))
        expect(cells).toEqual([
            [1, 2, 1],
            [2, 0, 2],
            [1, 2, 1],
        ])
        expect(hasDots(cells)).toBe(true)
    })

    it("reports whether any dot is left", () => {
        const cells = cellsFrom(map)
        expect(hasDots(cells)).toBe(false)
        cells[0][1] = Cell.dot
        expect(hasDots(cells)).toBe(true)
    })
})
