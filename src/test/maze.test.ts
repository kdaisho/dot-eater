import { describe, expect, it } from "vite-plus/test"
import type { Cells } from "../level"
import { textMap } from "./helpers"
import { chokepoints, deadEnds } from "./maze"

const cells = (rows: readonly string[]): Cells =>
    textMap(rows).map.map((row) => [...row])

describe("deadEnds", () => {
    it("finds open cells with one way out, and none in a loop", () => {
        expect(deadEnds(cells(["#####", "#...#", "#.###", "#####"]))).toEqual([
            "(3, 1)",
            "(1, 2)",
        ])
        expect(
            deadEnds(cells(["#####", "#...#", "#.#.#", "#...#", "#####"]))
        ).toEqual([])
    })
})

describe("chokepoints", () => {
    // Two loops joined only by (2, 2): an enemy there cuts one off, though
    // no cell is a dead end and every step lies on a loop.
    it("finds a cell that is the only link between two loops", () => {
        const twoLoops = cells(["#####", "#..##", "#...#", "##..#", "#####"])
        expect(deadEnds(twoLoops)).toEqual([])
        expect(chokepoints(twoLoops)).toEqual(["(2, 2)"])
    })

    it("finds the cells of a corridor between two rooms", () => {
        const rooms = cells([
            "#########",
            "#..###..#",
            "#.......#",
            "#..###..#",
            "#########",
        ])
        expect(chokepoints(rooms)).toEqual([
            "(2, 2)",
            "(3, 2)",
            "(4, 2)",
            "(5, 2)",
            "(6, 2)",
        ])
    })

    it("finds none where there is always another way round", () => {
        expect(
            chokepoints(cells(["#####", "#...#", "#.#.#", "#...#", "#####"]))
        ).toEqual([])
    })

    // A corridor whose ends are joined by a wrap tunnel is a loop.
    it("counts wrap tunnels", () => {
        expect(chokepoints(cells(["#####", ".....", "#####"]))).toEqual([])
        expect(chokepoints(cells(["#####", "#...#", "#####"]))).toEqual([
            "(2, 1)",
        ])
    })
})
