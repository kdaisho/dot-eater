import { describe, expect, it } from "vite-plus/test"
import { distanceMap, openNeighbours } from "./path"
import { cellsFrom } from "./test/helpers"
import { vec2 } from "./vec2"

const I = Infinity

describe("openNeighbours", () => {
    it("returns open cells in direction order, skipping walls", () => {
        const cells = cellsFrom([
            [1, 0, 1],
            [0, 0, 1],
            [1, 0, 1],
        ])
        // Up, left, down; right is a wall.
        expect(openNeighbours(cells, vec2(1, 1))).toEqual([
            vec2(1, 0),
            vec2(0, 1),
            vec2(1, 2),
        ])
    })

    it("wraps around the map edges", () => {
        const cells = cellsFrom([
            [1, 0, 1],
            [0, 0, 0],
            [1, 0, 1],
        ])
        expect(openNeighbours(cells, vec2(0, 1))).toEqual([
            vec2(2, 1),
            vec2(1, 1),
        ])
        expect(openNeighbours(cells, vec2(1, 0))).toEqual([
            vec2(1, 2),
            vec2(1, 1),
        ])
    })
})

describe("distanceMap", () => {
    it("counts steps around walls", () => {
        const cells = cellsFrom([
            [1, 1, 1, 1, 1],
            [1, 0, 0, 0, 1],
            [1, 1, 1, 0, 1],
            [1, 0, 0, 0, 1],
            [1, 1, 1, 1, 1],
        ])
        expect(distanceMap(cells, vec2(1, 1))).toEqual([
            [I, I, I, I, I],
            [I, 0, 1, 2, I],
            [I, I, I, 3, I],
            [I, 6, 5, 4, I],
            [I, I, I, I, I],
        ])
    })

    it("follows paths across the left and right edges", () => {
        const cells = cellsFrom([
            [1, 1, 1, 1, 1, 1],
            [0, 0, 0, 0, 0, 0],
            [1, 1, 1, 1, 1, 1],
        ])
        expect(distanceMap(cells, vec2(0, 1))[1]).toEqual([0, 1, 2, 3, 2, 1])
    })

    it("follows paths across the top and bottom edges", () => {
        const cells = cellsFrom([
            [1, 0, 1],
            [1, 0, 1],
            [1, 0, 1],
            [1, 0, 1],
        ])
        const dist = distanceMap(cells, vec2(1, 0))
        expect(dist.map((row) => row[1])).toEqual([0, 1, 2, 1])
    })

    it("leaves unreachable cells at Infinity", () => {
        const cells = cellsFrom([
            [1, 1, 1, 1, 1],
            [1, 0, 1, 0, 1],
            [1, 1, 1, 1, 1],
        ])
        const dist = distanceMap(cells, vec2(1, 1))
        expect(dist[1][1]).toBe(0)
        expect(dist[1][3]).toBe(Infinity)
    })

    it("is 0 at the source and Infinity elsewhere when boxed in", () => {
        const cells = cellsFrom([
            [1, 1, 1],
            [1, 0, 1],
            [1, 1, 1],
        ])
        expect(distanceMap(cells, vec2(1, 1))).toEqual([
            [I, I, I],
            [I, 0, I],
            [I, I, I],
        ])
    })
})
