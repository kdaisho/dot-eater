import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell, TICK_RATE } from "./constants"
import {
    hasDots,
    LevelError,
    loopPos,
    parseLevel,
    type CellRef,
    type LevelData,
} from "./level"
import { cellsFrom, OLD_LEVEL, OLD_MAP } from "./test/helpers"
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
    parTime: 60,
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

// `valid` with its enemy made a patroller walking `route`.
function patrol(route: readonly CellRef[]): LevelData {
    return { ...valid, enemies: [{ ai: "patroller", route }] }
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
            parTime: 60,
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
            parTime: 60,
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
            parTime: 60,
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
            parTime: 60,
            map: ["#####", ".P#..", "#####"],
            enemies: [],
        })
        expect(level.cells[1]).toEqual([2, 0, 1, 2, 2])
    })

    it("allows open corners whose opposite cells are open", () => {
        expect(
            problemsOf({
                name: "corners",
                parTime: 60,
                map: [". .", " P ", ". ."],
                enemies: [],
            })
        ).toEqual([])
    })

    it("accepts up to 4 enemies with every AI type", () => {
        const level = parseLevel({
            name: "four",
            parTime: 60,
            map: ["######", "#PEE.#", "#.EE.#", "######"],
            enemies: [
                { ai: "ambusher" },
                {
                    ai: "patroller",
                    route: [
                        [1, 2],
                        [4, 1],
                    ],
                },
                { ai: "phantom", speed: 1 },
                { ai: "chase" },
            ],
        })
        expect(level.enemies).toEqual([
            { pos: vec2(2, 1), ai: AiType.ambusher },
            {
                pos: vec2(3, 1),
                ai: AiType.patroller,
                route: [vec2(1, 2), vec2(4, 1)],
            },
            { pos: vec2(2, 2), ai: AiType.phantom, speed: 1 },
            { pos: vec2(3, 2), ai: AiType.chase },
        ])
    })

    it("leaves the route out for enemies without one", () => {
        expect(parseLevel(valid).enemies[0]).not.toHaveProperty("route")
    })

    it("carries the par time into the level", () => {
        expect(parseLevel(valid).parTime).toBe(60)
        expect(parseLevel({ ...valid, parTime: 0.5 }).parTime).toBe(0.5)
        expect(parseLevel({ ...valid, parTime: 16.4 }).parTime).toBe(16.4)
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

        it.each([0, -5, NaN, Infinity, 45.54])("a parTime of %s", (parTime) => {
            expect(problemsOf({ ...valid, parTime })).toEqual([
                `parTime must be a positive number of seconds in whole tenths, got ${parTime}`,
            ])
        })

        it("a missing or non-number parTime", () => {
            const { parTime: _, ...missing } = valid
            expect(problemsOf(missing as LevelData)).toEqual([
                "parTime must be a positive number of seconds in whole tenths, got undefined",
            ])
            const text = { ...valid, parTime: "60" } as unknown as LevelData
            expect(problemsOf(text)).toEqual([
                "parTime must be a positive number of seconds in whole tenths, got 60",
            ])
        })

        it("an unknown AI", () => {
            const data = {
                ...valid,
                enemies: [{ ai: "smart" }],
            } as unknown as LevelData
            expect(problemsOf(data)).toEqual([
                'enemies[0].ai must be one of random, chase, ambusher, patroller, phantom, got "smart"',
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

        it("speeds above one cell per tick", () => {
            expect(
                problemsOf({
                    ...valid,
                    playerSpeed: TICK_RATE + 1,
                    enemies: [{ ai: "random", speed: TICK_RATE }],
                })
            ).toEqual([
                `playerSpeed must be at most ${TICK_RATE} (one cell per tick), got ${TICK_RATE + 1}`,
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
                    map: ["#######", "#PEEE.#", "#.EE..#", "#######"],
                    enemies: [
                        { ai: "random" },
                        { ai: "random" },
                        { ai: "random" },
                        { ai: "random" },
                        { ai: "random" },
                    ],
                })
            ).toEqual(["at most 4 enemies are supported, got 5"])
        })

        it("a patroller without a route", () => {
            expect(
                problemsOf({ ...valid, enemies: [{ ai: "patroller" }] })
            ).toEqual(["enemies[0].route is required for patrollers"])
        })

        it("a route on an enemy that isn't a patroller", () => {
            expect(
                problemsOf({
                    ...valid,
                    enemies: [
                        {
                            ai: "chase",
                            route: [
                                [1, 1],
                                [3, 2],
                            ],
                        },
                    ],
                })
            ).toEqual([
                'enemies[0].route is only allowed for patrollers, got ai "chase"',
            ])
        })

        it("a route with fewer than 2 waypoints", () => {
            for (const route of [[], [[1, 1]]] as const) {
                expect(problemsOf(patrol(route))).toEqual([
                    "enemies[0].route must list at least 2 waypoints",
                ])
            }
        })

        it("waypoints that aren't whole-number [x, y] pairs", () => {
            const route = [[1, 1], [1.5, 2], [-1, 1], [1]] as unknown as [
                number,
                number,
            ][]
            expect(problemsOf(patrol(route))).toEqual([
                "enemies[0].route[1] must be [x, y] with whole numbers from 0, got [1.5,2]",
                "enemies[0].route[2] must be [x, y] with whole numbers from 0, got [-1,1]",
                "enemies[0].route[3] must be [x, y] with whole numbers from 0, got [1]",
            ])
        })

        it("a waypoint the same as the one before it, looping round", () => {
            expect(
                problemsOf(
                    patrol([
                        [1, 2],
                        [3, 2],
                        [3, 2],
                        [1, 2],
                    ])
                )
            ).toEqual([
                "enemies[0].route[0] (1, 2) is the same as the waypoint before it",
                "enemies[0].route[2] (3, 2) is the same as the waypoint before it",
            ])
        })

        it("waypoints off the map or on a wall", () => {
            expect(
                problemsOf(
                    patrol([
                        [1, 2],
                        [5, 1],
                        [1, 4],
                        [0, 0],
                    ])
                )
            ).toEqual([
                "enemies[0].route[1] (5, 1) is off the map",
                "enemies[0].route[2] (1, 4) is off the map",
                "enemies[0].route[3] (0, 0) is a wall",
            ])
        })

        it("waypoints the patroller can't reach from its spawn", () => {
            // (4, 2) is an empty pocket, sealed off from the rest.
            expect(
                problemsOf({
                    name: "pocket",
                    parTime: 60,
                    map: ["######", "#P.E##", "#### #", "######"],
                    enemies: [
                        {
                            ai: "patroller",
                            route: [
                                [1, 1],
                                [4, 2],
                            ],
                        },
                    ],
                })
            ).toEqual([
                "enemies[0].route[1] (4, 2) can't be reached from the enemy's spawn",
            ])
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
                parseLevel({
                    name: "",
                    parTime: 0,
                    map: ["#x", "#"],
                    enemies: [],
                })
            ).toThrow(
                'Invalid level "":\n' +
                    "- name must not be empty\n" +
                    "- parTime must be a positive number of seconds in whole tenths, got 0\n" +
                    '- unknown map character "x" at (1, 0)\n' +
                    "- map row 1 is 1 wide, expected 2 (the width of row 0)"
            )
        })
    })
})

describe("the old level fixture", () => {
    it("has the old hard-coded map's walls", () => {
        expect(
            OLD_LEVEL.cells.map((row) =>
                row.map((c) => (c === Cell.wall ? 1 : 0))
            )
        ).toEqual(OLD_MAP)
    })
})

describe("parseLevel rules", () => {
    // Rules come from JSON-like data, so tests pass shapes the type forbids.
    const withRules = (rules: unknown): LevelData =>
        ({ ...valid, rules }) as LevelData

    it("gives a level without rules empty rules", () => {
        expect(parseLevel(valid).rules).toEqual({})
        expect(parseLevel(withRules({})).rules).toEqual({})
    })

    it("carries a fog rule through, copied", () => {
        const data = withRules({ fog: { radius: 3.5 } })
        const level = parseLevel(data)
        expect(level.rules).toEqual({ fog: { radius: 3.5 } })
        expect(level.rules.fog).not.toBe(data.rules?.fog)
    })

    it("keeps the rules JSON-serializable", () => {
        const data = withRules({ fog: { radius: 4 } })
        expect(JSON.parse(JSON.stringify(data))).toEqual(data)
        expect(parseLevel(JSON.parse(JSON.stringify(data))).rules).toEqual({
            fog: { radius: 4 },
        })
    })

    it.each([
        [0, "0"],
        [-1, "-1"],
        [1.4, "1.4"],
        [Number.NaN, "NaN"],
        [Infinity, "Infinity"],
        ["3", '"3"'],
        [null, "null"],
        [undefined, "undefined"],
    ])("rejects a fog radius of %s", (radius, shown) => {
        expect(problemsOf(withRules({ fog: { radius } }))).toEqual([
            `rules.fog.radius must be a number of at least 1.5, got ${shown}`,
        ])
    })

    it("rejects unknown rules and fog settings", () => {
        expect(problemsOf(withRules({ fogg: { radius: 3 } }))).toEqual([
            'unknown rule "fogg" (known rules: fog)',
        ])
        expect(problemsOf(withRules({ fog: { radius: 3, soft: 1 } }))).toEqual([
            'unknown rules.fog setting "soft"',
        ])
    })

    it("rejects rules or fog that aren't objects", () => {
        expect(problemsOf(withRules([]))).toEqual([
            "rules must be an object, got []",
        ])
        expect(problemsOf(withRules(null))).toEqual([
            "rules must be an object, got null",
        ])
        expect(problemsOf(withRules({ fog: 3 }))).toEqual([
            "rules.fog must be an object, got 3",
        ])
    })
})
