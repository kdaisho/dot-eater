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
            ice: Array.from({ length: 4 }, () => Array(5).fill(false)),
            playerSpawns: [vec2(1, 1), vec2(1, 1)],
            playerSpeed: 4,
            enemies: [{ pos: vec2(3, 1), ai: AiType.chase, speed: 2.5 }],
            boss: null,
            rules: {},
        })
    })

    it("starts player 2 on Q, an empty cell", () => {
        const level = parseLevel({
            ...valid,
            map: ["#####", "#PQE#", "#. .#", "#####"],
        })
        expect(level.playerSpawns).toEqual([vec2(1, 1), vec2(2, 1)])
        expect(level.cells[1][2]).toBe(Cell.none)
    })

    it("starts player 2 on player 1's spawn when there is no Q", () => {
        expect(parseLevel(valid).playerSpawns).toEqual([vec2(1, 1), vec2(1, 1)])
    })

    it("parses splitters, up to 4 enemy slots with each splitter as 2", () => {
        const level = parseLevel({
            ...valid,
            enemies: [{ ai: "splitter", speed: 1.5 }],
        })
        expect(level.enemies).toEqual([
            { pos: vec2(3, 1), ai: AiType.splitter, speed: 1.5 },
        ])
        expect(
            problemsOf({
                ...valid,
                map: ["#######", "#PEEE.#", "#.....#", "#######"],
                enemies: [
                    { ai: "splitter" },
                    { ai: "chase" },
                    { ai: "random" },
                ],
            })
        ).toEqual([])
        expect(
            problemsOf({
                ...valid,
                map: ["#######", "#PEE..#", "#.....#", "#######"],
                enemies: [{ ai: "splitter" }, { ai: "splitter" }],
            })
        ).toEqual([])
    })

    it("parses ice: ~ is empty ice and : is ice with a dot", () => {
        const level = parseLevel({
            ...valid,
            map: ["#####", "#P:E#", "#~ .#", "#####"],
        })
        expect(level.cells).toEqual([
            [1, 1, 1, 1, 1],
            [1, 0, 2, 2, 1],
            [1, 0, 0, 2, 1],
            [1, 1, 1, 1, 1],
        ])
        expect(level.ice).toEqual([
            [false, false, false, false, false],
            [false, false, true, false, false],
            [false, true, false, false, false],
            [false, false, false, false, false],
        ])
    })

    it("counts a dot on ice as the level's dot", () => {
        const level = parseLevel({
            ...valid,
            map: ["#####", "#P:~#", "#####"],
            enemies: [],
        })
        expect(level.cells[1][2]).toBe(Cell.dot)
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

    // Waypoint 0 at (3, 1) is mid-lane on ice with walls above and below:
    // the patroller can only slide over it, never stop there.
    it("accepts a patrol route that only works by sliding over a waypoint", () => {
        const level = parseLevel({
            name: "slide-by",
            parTime: 60,
            map: [
                "#########",
                "#.~~~~~.#",
                "#.##.####",
                "#.##.####",
                "#E..P####",
                "#########",
            ],
            enemies: [
                {
                    ai: "patroller",
                    route: [
                        [3, 1],
                        [4, 3],
                    ],
                },
            ],
        })
        expect(level.enemies[0].route).toEqual([vec2(3, 1), vec2(4, 3)])
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
                'enemies[0].ai must be one of random, chase, ambusher, patroller, phantom, splitter, got "smart"',
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
                'map must have at least one dot (".", ":" or an "E" spawn)',
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

        it("more than one player 2 spawn", () => {
            const rows = ["#####", "#PQE#", "#.Q.#", "#####"]
            expect(problemsOf({ ...valid, map: rows })).toEqual([
                'map may have at most one "Q" (player 2 spawn), found 2',
            ])
        })

        it("dots player 2 can't reach from its spawn", () => {
            const rows = ["######", "#P.#Q#", "#.E# #", "######"]
            expect(problemsOf({ ...valid, map: rows })).toEqual([
                "dot at (2, 1) can't be reached from player 2's spawn",
                "dot at (1, 2) can't be reached from player 2's spawn",
                "dot at (2, 2) can't be reached from player 2's spawn",
            ])
        })

        // As for player 1 (below): stepping down from Q stops on the ice
        // at (4, 2), and once player 2 slides off sideways it can't get
        // back up.
        it("a slide that strands player 2", () => {
            const rows = ["#########", "#P.##Q###", "#.~~~~:~#", "#########"]
            expect(problemsOf({ ...valid, map: rows, enemies: [] })).toEqual(
                expect.arrayContaining([
                    "sliding can strand the player at (4, 2), with no way back to player 2's spawn",
                ])
            )
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
            ).toEqual([
                "at most 4 enemies are supported (a splitter counts as 2), got 5",
            ])
        })

        it("more enemies than there are enemy ids, a splitter counting as 2", () => {
            const map = ["#######", "#PEEE.#", "#.E...#", "#######"]
            expect(
                problemsOf({
                    ...valid,
                    map,
                    enemies: [
                        { ai: "random" },
                        { ai: "splitter" },
                        { ai: "random" },
                        { ai: "random" },
                    ],
                })
            ).toEqual([
                "at most 4 enemies are supported (a splitter counts as 2), got 5",
            ])
            expect(
                problemsOf({
                    ...valid,
                    map: ["#######", "#PEEE.#", "#.....#", "#######"],
                    enemies: [
                        { ai: "splitter" },
                        { ai: "random" },
                        { ai: "splitter" },
                    ],
                })
            ).toEqual([
                "at most 4 enemies are supported (a splitter counts as 2), got 5",
            ])
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

        // Free movement reaches (3, 2), but every way past (3, 1) is a
        // slide: right from P to the far wall, or left back to P.
        it("dots only reachable by stopping mid-slide", () => {
            const rows = ["#######", "#P~~~~#", "###.###", "#######"]
            expect(problemsOf({ ...valid, map: rows, enemies: [] })).toEqual([
                "dot at (3, 2) can't be reached from the player spawn",
            ])
        })

        // Stepping down from P stops on the ice at (2, 2) (a wall below),
        // but once the player slides off sideways it only ever slides
        // between the two end walls, past (2, 2), and can't get back up.
        it("a slide that strands the player", () => {
            const rows = ["######", "##P###", "#~~:~#", "######"]
            expect(problemsOf({ ...valid, map: rows, enemies: [] })).toEqual([
                "sliding can strand the player at (1, 2), with no way back to the spawn",
                "sliding can strand the player at (2, 2), with no way back to the spawn",
                "sliding can strand the player at (3, 2), with no way back to the spawn",
                "sliding can strand the player at (4, 2), with no way back to the spawn",
            ])
        })

        // Down from (3, 2) the patroller stops on the ice at (3, 3), then
        // reaches waypoint 1 sliding west over (2, 3) along a lane that runs
        // through a tunnel with no wall, so it never stops again and can't
        // get back to waypoint 0. (The player could be stranded there too.)
        it("a patrol route leg that sliding makes impossible", () => {
            const rows = ["#####", "#P.E#", "#.#.#", "~~~~~", "#####"]
            const problems = problemsOf({
                ...valid,
                map: rows,
                enemies: [
                    {
                        ai: "patroller",
                        route: [
                            [3, 1],
                            [2, 3],
                        ],
                    },
                ],
            })
            expect(problems).toContain(
                "enemies[0].route[0] (3, 1) can't be reached from route[1] (2, 3): sliding carries the patroller away"
            )
            expect(
                problems.filter((p) => !p.startsWith("sliding can strand"))
            ).toHaveLength(1)
        })

        // A row of ice with a tunnel at both ends and no wall: a slide along
        // it never ends.
        it("an endless slide through a tunnel", () => {
            const rows = ["#####", "#P.##", "~~~~~", "#####"]
            const problems = problemsOf({ ...valid, map: rows, enemies: [] })
            expect(problems).toHaveLength(5)
            for (const p of problems) expect(p).toMatch(/^sliding can strand/)
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

describe("parseLevel with a boss", () => {
    // A room with the boss's footprint at (3, 2) to (4, 3).
    const lair: LevelData = {
        name: "lair",
        parTime: 60,
        map: ["#######", "#P....#", "#..B .#", "#.....#", "#E....#", "#######"],
        enemies: [{ ai: "chase" }],
    }
    // `lair` with its map rows replaced by `map`.
    const withMap = (map: readonly string[]): LevelData => ({ ...lair, map })
    // Boss settings come from JSON-like data, so tests pass shapes the type
    // forbids.
    const withBoss = (boss: unknown): LevelData =>
        ({ ...lair, boss }) as LevelData

    it("parses the boss's spawn, on a dot, with no enemy slot", () => {
        const level = parseLevel(lair)
        expect(level.boss).toEqual({ pos: vec2(3, 2) })
        expect(level.cells[2][3]).toBe(Cell.dot)
        expect(level.cells[2][4]).toBe(Cell.none)
        expect(level.enemies).toHaveLength(1)
    })

    it("has no boss without a B", () => {
        expect(parseLevel(valid).boss).toBeNull()
    })

    it("takes the boss's speed from its settings", () => {
        expect(parseLevel(withBoss({ speed: 2.5 })).boss).toEqual({
            pos: vec2(3, 2),
            speed: 2.5,
        })
        expect(parseLevel(withBoss({})).boss).toEqual({ pos: vec2(3, 2) })
    })

    it("rejects bad boss settings", () => {
        expect(problemsOf(withBoss({ speed: 0 }))).toEqual([
            "boss.speed must be a positive number, got 0",
        ])
        expect(problemsOf(withBoss({ speed: TICK_RATE + 1 }))).toEqual([
            `boss.speed must be at most ${TICK_RATE} (one cell per tick), got ${TICK_RATE + 1}`,
        ])
        expect(problemsOf(withBoss({ health: 3 }))).toEqual([
            'unknown boss setting "health"',
        ])
        expect(problemsOf(withBoss(2))).toEqual([
            "boss must be an object, got 2",
        ])
    })

    it("rejects boss settings without a boss", () => {
        expect(problemsOf({ ...valid, boss: {} })).toEqual([
            'boss settings are given but the map has no "B"',
        ])
    })

    it("allows at most one boss", () => {
        expect(
            problemsOf(
                withMap([
                    "#######",
                    "#P....#",
                    "#B.B .#",
                    "#.....#",
                    "#E....#",
                    "#######",
                ])
            )
        ).toEqual(['map must have at most one "B", found 2'])
    })

    it("needs the boss's whole footprint on the map", () => {
        expect(
            problemsOf(
                withMap([
                    "#######",
                    "#P....#",
                    "#.....#",
                    "#.....#",
                    "#E...B#",
                    "#######",
                ])
            )
        ).toEqual([
            'the boss at (5, 4) needs open floor ("." or space) at (6, 4), got "#"',
            'the boss at (5, 4) needs open floor ("." or space) at (5, 5), got "#"',
            'the boss at (5, 4) needs open floor ("." or space) at (6, 5), got "#"',
        ])
        // In the corner of the map itself.
        const corner = problemsOf(
            withMap([
                "#######",
                "#P....#",
                "#.....#",
                "#.....#",
                "#E....#",
                "######B",
            ])
        )
        expect(corner).toContain(
            "the boss at (6, 5) doesn't fit: its 2x2 footprint goes off the map"
        )
    })

    it("needs open floor under the rest of its footprint", () => {
        expect(
            problemsOf(
                withMap([
                    "#######",
                    "#P....#",
                    "#..B#.#",
                    "#..E..#",
                    "#.....#",
                    "#######",
                ])
            )
        ).toEqual([
            'the boss at (3, 2) needs open floor ("." or space) at (4, 2), got "#"',
            'the boss at (3, 2) needs open floor ("." or space) at (3, 3), got "E"',
        ])
        expect(
            problemsOf(
                withMap([
                    "#######",
                    "#..B..#",
                    "#..P..#",
                    "#.....#",
                    "#E....#",
                    "#######",
                ])
            )
        ).toEqual([
            'the boss at (3, 1) needs open floor ("." or space) at (3, 2), got "P"',
        ])
    })

    it("rejects tunnels and ice on a boss level", () => {
        expect(
            problemsOf(
                withMap([
                    "#######",
                    "#P....#",
                    "...B ..",
                    "#.....#",
                    "#E....#",
                    "#######",
                ])
            )
        ).toEqual([
            "a level with a boss can't have wrap tunnels, but the edge is open at (0, 2), (6, 2)",
        ])
        expect(
            problemsOf(
                withMap([
                    "#######",
                    "#P..~.#",
                    "#..B .#",
                    "#.....#",
                    "#E....#",
                    "#######",
                ])
            )
        ).toEqual(["a level with a boss can't have ice"])
    })
})
