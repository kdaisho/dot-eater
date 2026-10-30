import { describe, expect, it } from "vite-plus/test"
import { parseFlat } from "./helpers"
import { Direction } from "../constants"
import {
    bossArena,
    breathEscapes,
    cellKey,
    escapeMoves,
    safeAround,
} from "./bossArena"
import { vec2 } from "../vec2"

// A 2-wide hall the boss fits, under a corridor joined to it at both ends.
const hall = parseFlat({
    name: "hall",
    parTime: 60,
    map: [
        "########",
        "#P.....#",
        "#.####.#",
        "#B.....#",
        "#......#",
        "########",
    ],
    enemies: [],
    boss: {},
    rules: { regrowDots: { seconds: 10 } },
})

describe("escapeMoves", () => {
    const { cells } = bossArena(hall)
    const keys = (...cells: [number, number][]) =>
        new Set(cells.map(([x, y]) => cellKey(vec2(x, y))))

    it("counts the moves to the nearest cell the breath misses", () => {
        expect(escapeMoves(cells, keys(), keys(), vec2(3, 3))).toBe(0)
        expect(escapeMoves(cells, keys(), keys([3, 3]), vec2(3, 3))).toBe(1)
    })

    // Regression: walking through the boss's body is a harder hit than
    // its breath, so it is no way out.
    it("never goes through the boss's body", () => {
        const body = keys([1, 3], [2, 3], [1, 4], [2, 4])
        const hit = keys([3, 3], [4, 3], [5, 3], [6, 3])
        const lanes = new Set([...hit, ...keys([3, 4], [4, 4], [5, 4], [6, 4])])
        // Up the right-hand end: (4, 3), (5, 3), (6, 3), (6, 2). Back
        // through the body to (1, 2) would be 3.
        expect(escapeMoves(cells, body, lanes, vec2(3, 3))).toBe(4)
        const notThere = new Set([...lanes, ...body])
        expect(escapeMoves(cells, keys(), notThere, vec2(3, 3))).toBe(3)
        // With no way out at all, none.
        const all = new Set(bossArena(hall).open.map(cellKey))
        expect(escapeMoves(cells, body, all, vec2(3, 3))).toBe(Infinity)
    })
})

describe("safeAround", () => {
    it("finds the sides the safe cells go all the way past", () => {
        // Over the hall only, joined round both its ends.
        expect(safeAround(bossArena(hall))).toEqual({
            sides: [Direction.up],
            joined: true,
        })
    })
})

describe("breathEscapes", () => {
    it("finds the worst escape over every breath, never through the body", () => {
        const { worst, struck } = breathEscapes(hall)
        // The boss at its spawn breathing right fills the hall from (3, 3)
        // on: the way out past its body doesn't count.
        expect(worst.get("3,3")).toBe(4)
        // The corridor above is never in line with it.
        expect(struck.has("3,1")).toBe(false)
    })
})
