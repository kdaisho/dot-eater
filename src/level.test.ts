import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell, MAX_ENEMIES, MAX_HEALTH, TICK_RATE } from "./constants"
import {
    DIFFICULTIES,
    ENEMY_COUNT,
    MAP_SIZE,
    type Difficulty,
} from "./difficulty"
import { createGameState } from "./game"
import {
    hasDots,
    LevelError,
    levelFor,
    loopPos,
    MAX_BOSS_HEALTH,
    parseLevel,
    parseMaps,
    parseStage,
    sameForBoth,
    SPAWN_GAP,
    type CellRef,
    type LevelData,
    type LevelVariant,
} from "./level"
import {
    cellsFrom,
    OLD_LEVEL,
    OLD_MAP,
    parseFlat,
    type FlatLevelData,
} from "./test/helpers"
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
const valid: FlatLevelData = {
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
function problemsOf(data: FlatLevelData): readonly string[] {
    try {
        parseFlat(data)
        return []
    } catch (e) {
        if (e instanceof LevelError) return e.problems
        throw e
    }
}

// `valid` with its enemy made a patroller walking `route`.
function patrol(route: readonly CellRef[]): FlatLevelData {
    return { ...valid, enemies: [{ ai: "patroller", route }] }
}

// `valid` with `count` enemies (MAX_ENEMIES + 1 at most), all of AI `ai`.
function crowded(count: number, ai: "random" | "splitter" = "random") {
    const spawns = "E".repeat(count).padEnd(MAX_ENEMIES + 1, ".")
    return {
        ...valid,
        map: [
            "#######",
            `#P${spawns.slice(0, 4)}#`,
            `#${spawns.slice(4)}#`,
            "#######",
        ],
        enemies: Array.from({ length: count }, () => ({ ai })),
    }
}

describe("parseLevel", () => {
    it("parses cells, spawns and metadata", () => {
        const level = parseFlat({
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

    // The dot is for 1-player games; createGameState clears it when there
    // is a player 2.
    it("starts player 2 on Q, which holds a dot", () => {
        const level = parseFlat({
            ...valid,
            map: ["#####", "#PQE#", "#. .#", "#####"],
        })
        expect(level.playerSpawns).toEqual([vec2(1, 1), vec2(2, 1)])
        expect(level.cells[1][2]).toBe(Cell.dot)
    })

    it("starts player 2 on player 1's spawn when there is no Q", () => {
        expect(parseFlat(valid).playerSpawns).toEqual([vec2(1, 1), vec2(1, 1)])
    })

    it("parses splitters, up to 4 enemy slots with each splitter as 2", () => {
        const level = parseFlat({
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
        const level = parseFlat({
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
        const level = parseFlat({
            ...valid,
            map: ["#####", "#P:~#", "#####"],
            enemies: [],
        })
        expect(level.cells[1][2]).toBe(Cell.dot)
    })

    it("leaves omitted speeds out", () => {
        const level = parseFlat(valid)
        expect(level).not.toHaveProperty("playerSpeed")
        expect(level.enemies[0]).not.toHaveProperty("speed")
    })

    it("matches enemies to E spawns in reading order", () => {
        const level = parseFlat({
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
        const level = parseFlat({
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
        const level = parseFlat({
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
        const level = parseFlat({
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
        const level = parseFlat({
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
        expect(parseFlat(valid).enemies[0]).not.toHaveProperty("route")
    })

    it("carries the par time into the level", () => {
        expect(parseFlat(valid).parTime).toBe(60)
        expect(parseFlat({ ...valid, parTime: 0.5 }).parTime).toBe(0.5)
        expect(parseFlat({ ...valid, parTime: 16.4 }).parTime).toBe(16.4)
    })

    it("takes up to MAX_ENEMIES enemies, a Splitter counting as one", () => {
        expect(problemsOf(crowded(MAX_ENEMIES))).toEqual([])
        expect(problemsOf(crowded(MAX_ENEMIES, "splitter"))).toEqual([])
        expect(
            parseFlat(crowded(MAX_ENEMIES, "splitter")).enemies
        ).toHaveLength(8)
    })

    it("returns cells that are not shared with other parses", () => {
        const a = parseFlat(valid)
        const b = parseFlat(valid)
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
            expect(problemsOf(missing as FlatLevelData)).toEqual([
                "parTime must be a positive number of seconds in whole tenths, got undefined",
            ])
            const text = { ...valid, parTime: "60" } as unknown as FlatLevelData
            expect(problemsOf(text)).toEqual([
                "parTime must be a positive number of seconds in whole tenths, got 60",
            ])
        })

        it("an unknown AI", () => {
            const data = {
                ...valid,
                enemies: [{ ai: "smart" }],
            } as unknown as FlatLevelData
            expect(problemsOf(data)).toEqual([
                'enemies[0].ai must be one of random, chase, ambusher, patroller, phantom, splitter, breather, interceptor, got "smart"',
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
                // Q's own dot, which player 1 can't reach either.
                "dot at (4, 1) can't be reached from the player spawn",
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

        it("more than MAX_ENEMIES enemies", () => {
            expect(problemsOf(crowded(MAX_ENEMIES + 1))).toEqual([
                "at most 8 enemies are supported, got 9",
            ])
            expect(problemsOf(crowded(MAX_ENEMIES + 1, "splitter"))).toEqual([
                "at most 8 enemies are supported, got 9",
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
            // (4, 2) is a pocket with a dot, walled off from the rest.
            expect(
                problemsOf({
                    name: "pocket",
                    parTime: 60,
                    map: ["######", "#P.E##", "####.#", "######"],
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
                "dot at (4, 2) can't be reached from the player spawn",
                "enemies[0].route[1] (4, 2) can't be reached from the enemy's spawn",
            ])
        })

        // KDA-245: a Boar could break into one and be sealed inside.
        it("open areas sealed off from every spawn and dot", () => {
            expect(
                problemsOf({
                    ...valid,
                    map: [
                        "########",
                        "#P.E#  #",
                        "#. .## #",
                        "#####  #",
                        "#  #####",
                        "########",
                    ],
                })
            ).toEqual([
                "open area at (5, 1) (5 cells) is sealed off: no spawn or dot reaches it",
                "open area at (1, 4) (2 cells) is sealed off: no spawn or dot reaches it",
            ])
        })

        // Plain steps join the pocket at (3, 3) to the rest through the ice
        // column at x = 5, but a slider can only cross that column, never
        // turn into it. A Boar that breaks in through (2, 3) would slide
        // between (3, 3) and (6, 3) for good once the wall regrows.
        it("open areas a sliding player can't get back out of", () => {
            const pocket = [
                "###########",
                "#.........#",
                "#.###~###.#",
                "#P# ~~~##.#",
                "#.###~###.#",
                "#.........#",
                "###########",
            ]
            expect(problemsOf({ ...valid, map: pocket, enemies: [] })).toEqual([
                "open area at (3, 3) (3 cells) traps a sliding player: no way back to a player spawn",
            ])
            // Without the ice it is open floor, and fine.
            const floor = pocket.map((row) => row.replaceAll("~", " "))
            expect(problemsOf({ ...valid, map: floor, enemies: [] })).toEqual(
                []
            )
        })

        it("no open area that a tunnel joins to the rest", () => {
            // The empty cell at (5, 1) is reached only through the tunnel
            // from (0, 1).
            expect(
                problemsOf({
                    ...valid,
                    map: ["######", " P.E# ", "#. .##", "######"],
                })
            ).toEqual([])
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
                parseFlat({
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
    const withRules = (rules: unknown): FlatLevelData =>
        ({ ...valid, rules }) as FlatLevelData

    it("gives a level without rules empty rules", () => {
        expect(parseFlat(valid).rules).toEqual({})
        expect(parseFlat(withRules({})).rules).toEqual({})
    })

    it("carries a fog rule through, copied", () => {
        const data = withRules({ fog: { radius: 3.5 } })
        const level = parseFlat(data)
        expect(level.rules).toEqual({ fog: { radius: 3.5 } })
        expect(level.rules.fog).not.toBe(data.rules?.fog)
    })

    it("keeps the rules JSON-serializable", () => {
        const data = withRules({ fog: { radius: 4 } })
        expect(JSON.parse(JSON.stringify(data))).toEqual(data)
        expect(parseFlat(JSON.parse(JSON.stringify(data))).rules).toEqual({
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
            'unknown rule "fogg" (known rules: fog, regrowDots, splitterDrops)',
        ])
        expect(problemsOf(withRules({ fog: { radius: 3, soft: 1 } }))).toEqual([
            'unknown rules.fog setting "soft"',
        ])
    })

    describe("regrowDots", () => {
        it("keeps a valid rule, as a copy", () => {
            const data = withRules({ regrowDots: { seconds: 10 } })
            const level = parseFlat(data)
            expect(level.rules).toEqual({ regrowDots: { seconds: 10 } })
            expect(level.rules.regrowDots).not.toBe(
                (data.rules as { regrowDots: unknown }).regrowDots
            )
            expect(
                parseFlat(withRules({ regrowDots: { seconds: 0.5 } })).rules
            ).toEqual({ regrowDots: { seconds: 0.5 } })
        })

        it("keeps it alongside fog", () => {
            const rules = { fog: { radius: 3 }, regrowDots: { seconds: 2.5 } }
            expect(parseFlat(withRules(rules)).rules).toEqual(rules)
        })

        it("rejects seconds that aren't positive whole tenths", () => {
            for (const seconds of [0, -1, 0.05, 10.25, NaN, Infinity, "10"]) {
                expect(
                    problemsOf(withRules({ regrowDots: { seconds } })),
                    String(seconds)
                ).toEqual([
                    `rules.regrowDots.seconds must be a positive number of seconds in whole tenths, got ${String(seconds)}`,
                ])
            }
            expect(problemsOf(withRules({ regrowDots: {} }))).toEqual([
                "rules.regrowDots.seconds must be a positive number of seconds in whole tenths, got undefined",
            ])
        })

        it("rejects unknown settings, and a rule that isn't an object", () => {
            expect(
                problemsOf(withRules({ regrowDots: { seconds: 10, delay: 1 } }))
            ).toEqual(['unknown rules.regrowDots setting "delay"'])
            expect(problemsOf(withRules({ regrowDots: 10 }))).toEqual([
                "rules.regrowDots must be an object, got 10",
            ])
        })
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
    const lair: FlatLevelData = {
        name: "lair",
        parTime: 60,
        map: ["#######", "#P....#", "#..B .#", "#.....#", "#E....#", "#######"],
        enemies: [{ ai: "chase" }],
        rules: { regrowDots: { seconds: 10 } },
    }

    describe("rules.splitterDrops", () => {
        const withDrops = (data: FlatLevelData, splitterDrops: unknown) =>
            ({
                ...data,
                rules: { ...data.rules, splitterDrops },
            }) as FlatLevelData
        const regrowDots = { seconds: 10 }

        it("keeps true or false on a level with a boss", () => {
            expect(parseFlat(withDrops(lair, true)).rules).toEqual({
                regrowDots,
                splitterDrops: true,
            })
            expect(parseFlat(withDrops(lair, false)).rules).toEqual({
                regrowDots,
                splitterDrops: false,
            })
        })

        it("rejects drops on a level without a boss, where dots decide the clear", () => {
            const plain = {
                ...lair,
                map: lair.map.map((r) => r.replace("B", ".")),
            }
            expect(problemsOf(withDrops(plain, true))).toEqual([
                'rules.splitterDrops needs a boss ("B"): elsewhere dots decide the clear',
            ])
            expect(parseFlat(withDrops(plain, false)).rules).toEqual({
                regrowDots,
                splitterDrops: false,
            })
        })

        it("rejects anything but true or false", () => {
            for (const value of [1, "yes", null, {}]) {
                expect(problemsOf(withDrops(lair, value))).toEqual([
                    `rules.splitterDrops must be true or false, got ${JSON.stringify(value)}`,
                ])
            }
        })
    })
    // `lair` with its map rows replaced by `map`.
    const withMap = (map: readonly string[]): FlatLevelData => ({
        ...lair,
        map,
    })

    // Regression: with the energy refill gone (KDA-267), a boss level
    // without dots coming back could run out of them with the boss alive.
    it("needs rules.regrowDots, so it can always be won", () => {
        const needs =
            "a boss level needs rules.regrowDots, so the dots (its ammunition) come back"
        const { rules: _, ...bare } = lair
        expect(problemsOf(bare)).toEqual([needs])
        expect(problemsOf({ ...lair, rules: { fog: { radius: 3 } } })).toEqual([
            needs,
        ])
        // A level without a boss doesn't need it.
        expect(problemsOf(valid)).toEqual([])
    })
    // Boss settings come from JSON-like data, so tests pass shapes the type
    // forbids.
    const withBoss = (boss: unknown): FlatLevelData =>
        ({ ...lair, boss }) as FlatLevelData

    it("parses the boss's spawn, on a dot, with no enemy slot", () => {
        const level = parseFlat(lair)
        expect(level.boss).toEqual({ pos: vec2(3, 2) })
        expect(level.cells[2][3]).toBe(Cell.dot)
        expect(level.cells[2][4]).toBe(Cell.none)
        expect(level.enemies).toHaveLength(1)
    })

    it("has no boss without a B", () => {
        expect(parseFlat(valid).boss).toBeNull()
    })

    it("takes the boss's speed from its settings", () => {
        expect(parseFlat(withBoss({ speed: 2.5 })).boss).toEqual({
            pos: vec2(3, 2),
            speed: 2.5,
        })
        expect(parseFlat(withBoss({})).boss).toEqual({ pos: vec2(3, 2) })
    })

    it("rejects bad boss settings", () => {
        expect(problemsOf(withBoss({ speed: 0 }))).toEqual([
            "boss.speed must be a positive number, got 0",
        ])
        expect(problemsOf(withBoss({ speed: TICK_RATE + 1 }))).toEqual([
            `boss.speed must be at most ${TICK_RATE} (one cell per tick), got ${TICK_RATE + 1}`,
        ])
        expect(problemsOf(withBoss({ armour: 3 }))).toEqual([
            'unknown boss setting "armour"',
        ])
        expect(problemsOf(withBoss(2))).toEqual([
            "boss must be an object, got 2",
        ])
    })

    it("takes the boss's health from its settings", () => {
        expect(parseFlat(withBoss({ health: 18 })).boss).toEqual({
            pos: vec2(3, 2),
            health: 18,
        })
        for (const health of [1, MAX_BOSS_HEALTH]) {
            expect(problemsOf(withBoss({ health }))).toEqual([])
        }
    })

    it("rejects a bad boss health", () => {
        const problem = (got: string) =>
            `boss.health must be a whole number from 1 to ${MAX_BOSS_HEALTH}, got ${got}`
        expect(problemsOf(withBoss({ health: 0 }))).toEqual([problem("0")])
        expect(problemsOf(withBoss({ health: 12.5 }))).toEqual([
            problem("12.5"),
        ])
        expect(problemsOf(withBoss({ health: MAX_BOSS_HEALTH + 1 }))).toEqual([
            problem(`${MAX_BOSS_HEALTH + 1}`),
        ])
        expect(problemsOf(withBoss({ health: "12" }))).toEqual([
            problem('"12"'),
        ])
        expect(problemsOf(withBoss({ health: null }))).toEqual([
            problem("null"),
        ])
    })

    it("takes the boss's breath tuning from its settings", () => {
        const breath = { every: 2.5, windUp: 0.5, range: 8, damage: 45 }
        const level = parseFlat(withBoss({ speed: 2, breath }))
        expect(level.boss).toEqual({ pos: vec2(3, 2), speed: 2, breath })
        // A copy, not the level data's own object.
        expect(level.boss!.breath).not.toBe(breath)
        // Any part may be left out (the defaults apply).
        expect(parseFlat(withBoss({ breath: {} })).boss).toEqual({
            pos: vec2(3, 2),
            breath: {},
        })
        expect(parseFlat(withBoss({ breath: { range: 1 } })).boss).toEqual({
            pos: vec2(3, 2),
            breath: { range: 1 },
        })
    })

    it("accepts breath settings at the ends of their ranges", () => {
        for (const breath of [
            { every: 1, windUp: 0.25, range: 1, damage: 1 },
            { every: 60, windUp: 5, range: 30, damage: MAX_HEALTH },
        ]) {
            expect(problemsOf(withBoss({ breath }))).toEqual([])
        }
    })

    it("rejects bad breath settings", () => {
        const problems = (breath: unknown) => problemsOf(withBoss({ breath }))
        expect(problems(3)).toEqual(["boss.breath must be an object, got 3"])
        expect(problems([])).toEqual(["boss.breath must be an object, got []"])
        expect(problems({ cooldown: 2 })).toEqual([
            'unknown boss.breath setting "cooldown"',
        ])
        expect(problems({ every: 0 })).toEqual([
            "boss.breath.every must be a number of seconds from 1 to 60, got 0",
        ])
        expect(problems({ every: 61 })).toEqual([
            "boss.breath.every must be a number of seconds from 1 to 60, got 61",
        ])
        expect(problems({ every: "4" })).toEqual([
            'boss.breath.every must be a number of seconds from 1 to 60, got "4"',
        ])
        expect(problems({ windUp: 0.1 })).toEqual([
            "boss.breath.windUp must be a number of seconds from 0.25 to 5, got 0.1",
        ])
        expect(problems({ windUp: -1 })).toEqual([
            "boss.breath.windUp must be a number of seconds from 0.25 to 5, got -1",
        ])
        expect(problems({ range: 2.5 })).toEqual([
            "boss.breath.range must be a whole number of cells from 1 to 30, got 2.5",
        ])
        expect(problems({ range: 0 })).toEqual([
            "boss.breath.range must be a whole number of cells from 1 to 30, got 0",
        ])
        expect(problems({ damage: MAX_HEALTH + 1 })).toEqual([
            `boss.breath.damage must be a whole number of health from 1 to ${MAX_HEALTH}, got ${MAX_HEALTH + 1}`,
        ])
        expect(problems({ damage: Number.NaN })).toEqual([
            "boss.breath.damage must be a whole number of health from 1 to 100, got null",
        ])
        // Every problem is listed.
        expect(problems({ every: 0, damage: 0 })).toHaveLength(2)
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

// A level with two maps of its own: a medium one listing 4 enemies and a
// large one listing 8, all far enough from the player spawns for a stage.
const MEDIUM: LevelVariant = {
    parTime: 60,
    map: [
        "#########",
        "#E.E.E.E#",
        "#.......#",
        "#.......#",
        "#...PQ..#",
        "#########",
    ],
    enemies: [
        { ai: "chase" },
        { ai: "random" },
        { ai: "ambusher" },
        { ai: "phantom" },
    ],
}
const LARGE: LevelVariant = {
    parTime: 90,
    map: [
        "###########",
        "#E.E.E.E.E#",
        "#.........#",
        "#E.E.E....#",
        "#.........#",
        "#.........#",
        "#....PQ...#",
        "###########",
    ],
    enemies: [
        { ai: "chase" },
        { ai: "random" },
        { ai: "ambusher" },
        { ai: "phantom" },
        { ai: "splitter" },
        { ai: "random" },
        { ai: "chase" },
        {
            ai: "patroller",
            route: [
                [1, 5],
                [9, 5],
            ],
        },
    ],
}
const twoMaps: LevelData = { name: "two maps", medium: MEDIUM, large: LARGE }

// The problems `parse` reports for `data`, or [] if it parses.
function problemsWith(
    data: LevelData,
    parse: (data: LevelData) => unknown = parseLevel
): readonly string[] {
    try {
        parse(data)
        return []
    } catch (e) {
        if (e instanceof LevelError) return e.problems
        throw e
    }
}

describe("parseLevel per difficulty", () => {
    it("plays Easy and Medium on the medium map, Hard and Super Hard on the large one", () => {
        for (const difficulty of DIFFICULTIES) {
            const level = parseLevel(twoMaps, difficulty)
            const map = MAP_SIZE[difficulty] === "medium" ? MEDIUM : LARGE
            expect(level.width).toBe(map.map[0].length)
            expect(level.height).toBe(map.map.length)
            expect(level.parTime).toBe(map.parTime)
        }
        expect(parseLevel(twoMaps)).toEqual(parseLevel(twoMaps, "medium"))
    })

    it("brings out the first ENEMY_COUNT enemies, each on its own spawn", () => {
        const ais = (difficulty: Difficulty) =>
            parseLevel(twoMaps, difficulty).enemies.map((e) => e.ai)
        expect(ais("easy")).toEqual([
            AiType.chase,
            AiType.random,
            AiType.ambusher,
        ])
        expect(ais("medium")).toEqual([
            AiType.chase,
            AiType.random,
            AiType.ambusher,
            AiType.phantom,
        ])
        expect(ais("hard")).toEqual([
            AiType.chase,
            AiType.random,
            AiType.ambusher,
            AiType.phantom,
            AiType.splitter,
            AiType.random,
        ])
        const superHard = parseLevel(twoMaps, "superHard").enemies
        expect(superHard).toHaveLength(8)
        expect(superHard.map((e) => e.pos)).toEqual([
            vec2(1, 1),
            vec2(3, 1),
            vec2(5, 1),
            vec2(7, 1),
            vec2(9, 1),
            vec2(1, 3),
            vec2(3, 3),
            vec2(5, 3),
        ])
        expect(superHard[7].route).toEqual([vec2(1, 5), vec2(9, 5)])
        for (const difficulty of DIFFICULTIES) {
            const all = parseMaps(twoMaps)[MAP_SIZE[difficulty]].enemies
            expect(parseLevel(twoMaps, difficulty).enemies).toEqual(
                all.slice(0, ENEMY_COUNT[difficulty])
            )
        }
    })

    it("leaves the spawns beyond the count empty, keeping their dots", () => {
        const level = parseLevel(twoMaps, "easy")
        expect(level.enemies.map((e) => e.pos)).not.toContainEqual(vec2(7, 1))
        expect(level.cells[1][7]).toBe(Cell.dot)
        const game = createGameState(level)
        expect(game.enemies).toHaveLength(3)
        expect(game.spawns.enemies).toEqual([
            vec2(1, 1),
            vec2(3, 1),
            vec2(5, 1),
        ])
        expect(game.cells[1][7]).toBe(Cell.dot)
        // The same dots as with an enemy on every spawn.
        expect(level.cells).toEqual(parseLevel(twoMaps, "medium").cells)
    })

    it("brings out every enemy a map lists when it lists fewer than the count", () => {
        const few: LevelData = {
            ...twoMaps,
            large: {
                ...LARGE,
                map: LARGE.map.map((row, y) =>
                    y === 1 ? "#E.E......#" : y === 3 ? "#.........#" : row
                ),
                enemies: LARGE.enemies.slice(0, 2),
            },
        }
        for (const difficulty of ["hard", "superHard"] as const) {
            expect(
                parseLevel(few, difficulty).enemies.map((e) => e.ai)
            ).toEqual([AiType.chase, AiType.random])
        }
    })

    it("gives back a level with no more enemies than the count as it is", () => {
        const level = parseMaps(twoMaps).medium
        expect(levelFor(level, "medium")).toBe(level)
        expect(levelFor(level, "superHard")).toBe(level)
        expect(levelFor(level, "easy").enemies).toHaveLength(3)
    })

    it("checks both maps whatever the difficulty, marking whose problem it is", () => {
        const data: LevelData = {
            ...twoMaps,
            medium: { ...MEDIUM, parTime: 0 },
            large: { ...LARGE, map: ["#P?#"] },
        }
        for (const difficulty of DIFFICULTIES) {
            expect(
                problemsWith(data, (d) => parseLevel(d, difficulty))
            ).toEqual([
                "medium: parTime must be a positive number of seconds in whole tenths, got 0",
                'large: unknown map character "?" at (2, 0)',
            ])
        }
    })

    // Super Hard is the only difficulty that brings out the large map's
    // last enemy, but every difficulty rejects its bad route.
    it("rejects a bad patrol route that only some difficulty brings out", () => {
        expect(ENEMY_COUNT.hard).toBeLessThan(LARGE.enemies.length)
        const data: LevelData = {
            ...twoMaps,
            large: {
                ...LARGE,
                enemies: [
                    ...LARGE.enemies.slice(0, 7),
                    {
                        ai: "patroller",
                        route: [
                            [1, 5],
                            [0, 0],
                        ],
                    },
                ],
            },
        }
        for (const difficulty of DIFFICULTIES) {
            expect(
                problemsWith(data, (d) => parseLevel(d, difficulty))
            ).toEqual(["large: enemies[7].route[1] (0, 0) is a wall"])
        }
    })

    it("checks each map's spawn count and enemy cap", () => {
        const nine: LevelData = {
            ...twoMaps,
            large: {
                ...LARGE,
                map: LARGE.map.map((row, y) => (y === 3 ? "#E.E.E.E..#" : row)),
                enemies: [...LARGE.enemies, { ai: "random" }],
            },
        }
        expect(problemsWith(nine)).toEqual([
            `large: at most ${MAX_ENEMIES} enemies are supported, got 9`,
        ])
        const short: LevelData = {
            ...twoMaps,
            medium: { ...MEDIUM, enemies: MEDIUM.enemies.slice(0, 3) },
        }
        expect(problemsWith(short)).toEqual([
            'medium: map has 4 "E" spawns but enemies lists 3',
        ])
    })

    it("needs a boss on both maps or neither", () => {
        const data: LevelData = {
            ...twoMaps,
            medium: {
                ...MEDIUM,
                map: MEDIUM.map.map((row, y) => (y === 2 ? "#..B....#" : row)),
            },
        }
        expect(problemsWith(data)).toEqual([
            'both maps must have a boss ("B") or neither',
        ])
    })

    it("checks one map once, unmarked, when both are the same object", () => {
        const data: LevelData = {
            name: "one map",
            ...sameForBoth({ ...MEDIUM, parTime: 0 }),
        }
        expect(problemsWith(data)).toEqual([
            "parTime must be a positive number of seconds in whole tenths, got 0",
        ])
        const fine = { name: "one map", ...sameForBoth(MEDIUM) }
        expect(parseLevel(fine, "superHard")).toEqual(
            parseLevel(fine, "medium")
        )
    })

    it("rejects a map that is missing", () => {
        const data = { ...twoMaps, large: undefined } as unknown as LevelData
        expect(problemsWith(data)).toEqual([
            "large must be an object, got undefined",
        ])
    })
})

describe("parseStage", () => {
    it("parses the level at every difficulty", () => {
        const stage = parseStage(twoMaps)
        for (const difficulty of DIFFICULTIES) {
            expect(stage[difficulty]).toEqual(parseLevel(twoMaps, difficulty))
        }
    })

    // See SPAWN_GAP. parseLevel lets test levels put them anywhere.
    it("rejects an enemy spawn near a player spawn, on either map", () => {
        const data: LevelData = {
            ...twoMaps,
            medium: {
                ...MEDIUM,
                map: MEDIUM.map.map((row, y) => (y === 2 ? "#...E...#" : row)),
                enemies: [...MEDIUM.enemies, { ai: "random" }],
            },
        }
        expect(problemsWith(data, parseStage)).toEqual([
            `medium: enemies[4]'s spawn at (4, 2) is too near the "P" at (4, 4): 2.00 cells, less than ${SPAWN_GAP}`,
            `medium: enemies[4]'s spawn at (4, 2) is too near the "Q" at (5, 4): 2.24 cells, less than ${SPAWN_GAP}`,
        ])
        expect(problemsWith(data)).toEqual([])
    })

    it("rejects a boss whose footprint is near a player spawn", () => {
        const lair: LevelData = {
            name: "lair",
            ...sameForBoth({
                parTime: 60,
                map: [
                    "#######",
                    "#.....#",
                    "#.B...#",
                    "#.....#",
                    "#..P..#",
                    "#######",
                ],
                enemies: [],
            }),
            rules: { regrowDots: { seconds: 10 } },
        }
        expect(problemsWith(lair, parseStage)).toEqual([
            `the boss at (2, 2) is too near the "P" at (3, 4): 1.00 cells, less than ${SPAWN_GAP}`,
        ])
    })

    it("measures the gap through wrap tunnels", () => {
        const data: LevelData = {
            name: "tunnel",
            ...sameForBoth({
                parTime: 60,
                map: ["#######", "P....E.", "#.....#", "#######"],
                enemies: [{ ai: "random" }],
            }),
        }
        expect(problemsWith(data, parseStage)).toEqual([
            `enemies[0]'s spawn at (5, 1) is too near the "P" at (0, 1): 2.00 cells, less than ${SPAWN_GAP}`,
        ])
    })
})
