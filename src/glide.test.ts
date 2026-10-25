import { describe, expect, it } from "vite-plus/test"
import { CharacterId, TICK_MS } from "./constants"
import { createCharacter, type Character } from "./character"
import { glidePos, glideT, moveStep, wrapCopies } from "./glide"
import { vec2 } from "./vec2"

// A character that moved from `from` to `to`, `progress` of the way to its
// next move, at `speed` cells/s.
function mover(
    from: [number, number],
    to: [number, number],
    progress: number,
    speed = 4
): Character {
    const c = createCharacter(CharacterId.player, vec2(...to), undefined, speed)
    c.lastPos = vec2(...from)
    c.moveProgress = progress
    return c
}

// The alpha that covers `cells` of a cell at `speed` cells/s.
const alphaFor = (cells: number, speed = 4) =>
    cells / ((speed * TICK_MS) / 1000)

describe("glideT", () => {
    it("is 1 for a resting character, whatever alpha", () => {
        expect(glideT(mover([1, 1], [2, 1], 1), 0)).toBe(1)
        expect(glideT(mover([1, 1], [2, 1], 1), 0.9)).toBe(1)
    })

    it("follows moveProgress at alpha 0", () => {
        expect(glideT(mover([1, 1], [2, 1], 0), 0)).toBe(0)
        expect(glideT(mover([1, 1], [2, 1], 0.4), 0)).toBeCloseTo(0.4)
    })

    it("adds the part of the next tick alpha covers", () => {
        // At 4 cells/s one tick covers 4/60 of a cell.
        const t = glideT(mover([1, 1], [2, 1], 0.5), 0.5)
        expect(t).toBeCloseTo(0.5 + 0.5 * (4 / 60))
    })

    it("never passes the target cell", () => {
        expect(glideT(mover([1, 1], [2, 1], 0.99), 0.99)).toBe(1)
    })
})

describe("glidePos", () => {
    it("draws a resting character on its cell", () => {
        expect(glidePos(mover([1, 1], [2, 1], 1), 0.5, 9, 9)).toEqual(
            vec2(2, 1)
        )
    })

    it("draws a character that just moved on the cell it came from", () => {
        expect(glidePos(mover([1, 1], [2, 1], 0), 0, 9, 9)).toEqual(vec2(1, 1))
    })

    it("interpolates mid-glide in every direction", () => {
        expect(glidePos(mover([1, 1], [2, 1], 0.5), 0, 9, 9)).toEqual(
            vec2(1.5, 1)
        )
        expect(glidePos(mover([3, 1], [2, 1], 0.25), 0, 9, 9)).toEqual(
            vec2(2.75, 1)
        )
        expect(glidePos(mover([3, 3], [3, 2], 0.5), 0, 9, 9)).toEqual(
            vec2(3, 2.5)
        )
        expect(glidePos(mover([3, 3], [3, 4], 0.25), 0, 9, 9)).toEqual(
            vec2(3, 3.25)
        )
    })

    it("moves on with alpha between ticks", () => {
        const pos = glidePos(mover([1, 1], [2, 1], 0.5), alphaFor(0.1), 9, 9)
        expect(pos.x).toBeCloseTo(1.6)
        expect(pos.y).toBe(1)
    })

    it("draws a character that hasn't moved yet on its spawn cell", () => {
        const c = createCharacter(CharacterId.enemy1, vec2(4, 4))
        expect(glidePos(c, 0.5, 9, 9)).toEqual(vec2(4, 4))
    })

    it("slides off the edge through a wrap-around tunnel", () => {
        // Moved right from the last column to the first: drawn left of x = 0.
        expect(glidePos(mover([8, 4], [0, 4], 0.25), 0, 9, 9)).toEqual(
            vec2(-0.75, 4)
        )
        // Moved left from the first column to the last: drawn right of x = 8.
        expect(glidePos(mover([0, 4], [8, 4], 0.25), 0, 9, 9)).toEqual(
            vec2(8.75, 4)
        )
        // And vertically.
        expect(glidePos(mover([4, 0], [4, 8], 0.5), 0, 9, 9)).toEqual(
            vec2(4, 8.5)
        )
        expect(glidePos(mover([4, 8], [4, 0], 0.5), 0, 9, 9)).toEqual(
            vec2(4, -0.5)
        )
    })
})

describe("moveStep", () => {
    it("is the plain difference for a normal move", () => {
        expect(moveStep(vec2(1, 1), vec2(2, 1), 9, 9)).toEqual(vec2(1, 0))
        expect(moveStep(vec2(2, 2), vec2(2, 2), 9, 9)).toEqual(vec2(0, 0))
    })

    it("is one cell off the edge for a wrap-around move", () => {
        expect(moveStep(vec2(8, 4), vec2(0, 4), 9, 9)).toEqual(vec2(1, 0))
        expect(moveStep(vec2(0, 4), vec2(8, 4), 9, 9)).toEqual(vec2(-1, 0))
        expect(moveStep(vec2(4, 0), vec2(4, 6), 9, 7)).toEqual(vec2(0, -1))
    })
})

describe("wrapCopies", () => {
    it("draws a position on the map once", () => {
        expect(wrapCopies(vec2(3.5, 8), 9, 9)).toEqual([vec2(3.5, 8)])
        expect(wrapCopies(vec2(0, 0), 9, 9)).toEqual([vec2(0, 0)])
    })

    it("adds the copy on the opposite edge for a position over an edge", () => {
        expect(wrapCopies(vec2(-0.75, 4), 9, 9)).toEqual([
            vec2(-0.75, 4),
            vec2(8.25, 4),
        ])
        expect(wrapCopies(vec2(8.75, 4), 9, 9)).toEqual([
            vec2(8.75, 4),
            vec2(-0.25, 4),
        ])
        expect(wrapCopies(vec2(4, -0.5), 9, 7)).toEqual([
            vec2(4, -0.5),
            vec2(4, 6.5),
        ])
    })
})
