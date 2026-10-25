import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell } from "./constants"
import {
    hasDots,
    LevelError,
    loopPos,
    parseLevel,
    type LevelData,
} from "./level"
import { levels } from "./levels"
import { level1 } from "./levels/level1"
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

    it("wraps using width for x and height for y on a non-square grid", () => {
        // 4 wide, 3 tall
        const wide = cellsFrom([
            [1, 0, 1, 1],
            [0, 0, 0, 0],
            [1, 0, 1, 1],
        ])
        expect(loopPos(wide, vec2(-1, 1))).toEqual(vec2(3, 1))
        expect(loopPos(wide, vec2(4, 1))).toEqual(vec2(0, 1))
        expect(loopPos(wide, vec2(1, -1))).toEqual(vec2(1, 2))
        expect(loopPos(wide, vec2(1, 3))).toEqual(vec2(1, 0))
    })
})

describe("hasDots", () => {
    it("reports whether any dot is left", () => {
        const cells = cellsFrom(map)
        expect(hasDots(cells)).toBe(false)
        cells[0][1] = Cell.dot
        expect(hasDots(cells)).toBe(true)
    })
})

// A valid level to derive broken ones from.
const valid: LevelData = {
    name: "test",
    map: [
        "#####", //
        "#P.E#",
        "#. .#",
        "#####",
    ],
    enemies: [{ ai: "random" }],
}

// The problems parseLevel reports for `data`, or [] if it parses.
function problemsOf(data: LevelData): readonly string[] {
    try {
        parseLevel(data)
        return []
    } catch (e) {
        if (e instanceof LevelError) return e.problems
        throw e
    }
}

describe("parseLevel", () => {
    it("parses cells, spawns and metadata", () => {
        const level = parseLevel({
            ...valid,
            playerSpeed: 4,
            enemies: [{ ai: "chase", speed: 2.5 }],
        })
        expect(level).toEqual({
            name: "test",
            width: 5,
            height: 4,
            cells: [
                [1, 1, 1, 1, 1],
                [1, 0, 2, 2, 1],
                [1, 2, 0, 2, 1],
                [1, 1, 1, 1, 1],
            ],
            playerSpawns: [vec2(1, 1)],
            playerSpeed: 4,
            enemies: [{ pos: vec2(3, 1), ai: AiType.chase, speed: 2.5 }],
            rules: {},
        })
    })

    it("leaves omitted speeds out", () => {
        const level = parseLevel(valid)
        expect(level).not.toHaveProperty("playerSpeed")
        expect(level.enemies[0]).not.toHaveProperty("speed")
    })

    it("matches enemies to E spawns in reading order", () => {
        const level = parseLevel({
            name: "order",
            map: ["#####", "#.E.#", "#EP.#", "#####"],
            enemies: [{ ai: "random" }, { ai: "chase" }],
        })
        expect(level.enemies.map((e) => [e.pos, e.ai])).toEqual([
            [vec2(2, 1), AiType.random],
            [vec2(1, 2), AiType.chase],
        ])
    })

    it("accepts any map size", () => {
        const level = parseLevel({
            name: "wide",
            map: ["#############", "#P.........E#", "#############"],
            enemies: [{ ai: "random" }],
        })
        expect(level.width).toBe(13)
        expect(level.height).toBe(3)
        expect(level.cells[1]).toHaveLength(13)
    })

    it("follows wrap-around tunnels when checking reachability", () => {
        // The right part is only reachable through the edge tunnel.
        const level = parseLevel({
            name: "tunnel",
            map: ["#####", ".P#..", "#####"],
            enemies: [],
        })
        expect(level.cells[1]).toEqual([2, 0, 1, 2, 2])
    })

    it("allows open corners whose opposite cells are open", () => {
        expect(
            problemsOf({
                name: "corners",
                map: [". .", " P ", ". ."],
                enemies: [],
            })
        ).toEqual([])
    })

    it("returns cells that are not shared with other parses", () => {
        const a = parseLevel(valid)
        const b = parseLevel(valid)
        expect(a.cells).not.toBe(b.cells)
        expect(a.cells[0]).not.toBe(b.cells[0])
    })

    describe("rejects", () => {
        it("an empty name", () => {
            expect(problemsOf({ ...valid, name: "  " })).toEqual([
                "name must not be empty",
            ])
        })

        it("an unknown AI", () => {
            const data = {
                ...valid,
                enemies: [{ ai: "smart" }],
            } as unknown as LevelData
            expect(problemsOf(data)).toEqual([
                'enemies[0].ai must be one of random, chase, got "smart"',
            ])
        })

        it("non-positive or non-finite speeds", () => {
            expect(
                problemsOf({
                    ...valid,
                    playerSpeed: 0,
                    enemies: [{ ai: "random", speed: Infinity }],
                })
            ).toEqual([
                "playerSpeed must be a positive number, got 0",
                "enemies[0].speed must be a positive number, got Infinity",
            ])
        })

        it("an empty map", () => {
            expect(problemsOf({ ...valid, map: [] })).toEqual([
                "map must have at least one non-empty row",
            ])
            expect(problemsOf({ ...valid, map: [""] })).toEqual([
                "map must have at least one non-empty row",
            ])
        })

        it("an empty row 0 without misleading width errors", () => {
            expect(problemsOf({ ...valid, map: ["", "###", "#P#"] })).toEqual([
                "map row 0 is empty",
            ])
        })

        it("an emoji as one unknown character with its true width", () => {
            const rows = ["#####", "#P.E#", "#.\u{1F600}.#", "#####"]
            expect(problemsOf({ ...valid, map: rows })).toEqual([
                'unknown map character "\u{1F600}" at (2, 2)',
            ])
        })

        it("a map without dots", () => {
            const rows = ["#####", "#P  #", "#####"]
            expect(problemsOf({ ...valid, map: rows, enemies: [] })).toEqual([
                'map must have at least one dot ("." or an "E" spawn)',
            ])
        })

        it("rows of different widths", () => {
            const rows = ["#####", "#P.E#", "#. #", "#####"]
            expect(problemsOf({ ...valid, map: rows })).toEqual([
                "map row 2 is 4 wide, expected 5 (the width of row 0)",
            ])
        })

        it("unknown characters", () => {
            const rows = ["#####", "#P.E#", "#.x.#", "#####"]
            expect(problemsOf({ ...valid, map: rows })).toEqual([
                'unknown map character "x" at (2, 2)',
            ])
        })

        it("a missing player spawn", () => {
            const rows = ["#####", "#..E#", "#. .#", "#####"]
            expect(problemsOf({ ...valid, map: rows })).toEqual([
                'map must have exactly one "P" (player 1 spawn), found 0',
            ])
        })

        it("more than one player spawn", () => {
            const rows = ["#####", "#P.E#", "#.P.#", "#####"]
            expect(problemsOf({ ...valid, map: rows })).toEqual([
                'map must have exactly one "P" (player 1 spawn), found 2',
            ])
        })

        it("more E spawns than listed enemies", () => {
            const rows = ["#####", "#P.E#", "#.E.#", "#####"]
            expect(problemsOf({ ...valid, map: rows })).toEqual([
                'map has 2 "E" spawns but enemies lists 1',
            ])
        })

        it("fewer E spawns than listed enemies", () => {
            const enemies = [{ ai: "random" }, { ai: "chase" }] as const
            expect(problemsOf({ ...valid, enemies })).toEqual([
                'map has 1 "E" spawns but enemies lists 2',
            ])
        })

        it("more enemies than there are enemy ids", () => {
            expect(
                problemsOf({
                    ...valid,
                    map: ["#####", "#PEE#", "#.E.#", "#####"],
                    enemies: [
                        { ai: "random" },
                        { ai: "random" },
                        { ai: "random" },
                    ],
                })
            ).toEqual(["at most 2 enemies are supported, got 3"])
        })

        it("a tunnel that wraps into a wall", () => {
            const sideways = ["#####", "PE..#", "#. .#", "#####"]
            expect(problemsOf({ ...valid, map: sideways })).toEqual([
                "open edge cell (0, 1) wraps around into a wall at (4, 1)",
            ])
            const upwards = ["##.##", "#P.E#", "#. .#", "#####"]
            expect(problemsOf({ ...valid, map: upwards })).toEqual([
                "open edge cell (2, 0) wraps around into a wall at (2, 3)",
            ])
        })

        it("dots the player can't reach", () => {
            const rows = ["#####", "#P#E#", "#.#.#", "#####"]
            expect(problemsOf({ ...valid, map: rows })).toEqual([
                "dot at (3, 1) can't be reached from the player spawn",
                "dot at (3, 2) can't be reached from the player spawn",
            ])
        })

        it("with every problem of a stage in one error", () => {
            expect(() =>
                parseLevel({ name: "", map: ["#x", "#"], enemies: [] })
            ).toThrow(
                'Invalid level "":\n' +
                    "- name must not be empty\n" +
                    '- unknown map character "x" at (1, 0)\n' +
                    "- map row 1 is 1 wide, expected 2 (the width of row 0)"
            )
        })
    })
})

describe("level 1", () => {
    it("is the first level", () => {
        expect(levels[0]).toEqual(parseLevel(level1))
    })

    it("has the old hard-coded map's walls", () => {
        const old = [
            [1, 1, 1, 1, 0, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 0, 1, 0, 1, 0, 1],
            [1, 0, 1, 0, 1, 0, 1, 0, 1],
            [0, 0, 0, 0, 1, 0, 0, 0, 0],
            [1, 0, 1, 0, 0, 0, 1, 0, 1],
            [1, 0, 1, 1, 1, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 0, 1, 1, 1, 1],
        ]
        expect(
            levels[0].cells.map((row) =>
                row.map((c) => (c === Cell.wall ? 1 : 0))
            )
        ).toEqual(old)
    })
})
