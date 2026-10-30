import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell, PLAYER_RESPAWN_DELAY, TICK_RATE } from "../constants"
import { footprint } from "../boss"
import {
    DEFAULT_DIFFICULTY,
    DIFFICULTIES,
    ENEMY_COUNT,
    MAP_SIZE,
} from "../difficulty"
import { wrapDelta } from "../glide"
import { DEFAULT_ANIMAL } from "../roster"
import { createGameState, IDLE, step, takeOut } from "../game"
import { parseLevel, SPAWN_GAP, type Cells, type Level } from "../level"
import { slideReach } from "../ice"
import { distanceMap, openNeighbours } from "../path"
import { vec2, type Vec2 } from "../vec2"
import { EACH_MAP } from "../test/helpers"
import { levels, stages } from "./index"
import { stage1 } from "./stage1"
import { stage2 } from "./stage2"
import { stage3 } from "./stage3"
import { stage4 } from "./stage4"
import { stage5 } from "./stage5"
import { stage6 } from "./stage6"
import { stage7 } from "./stage7"

// Each stage's level data, in stage order.
const STAGE_DATA = [stage1, stage2, stage3, stage4, stage5, stage6, stage7]

// Every stage (numbered from 1) at every difficulty: both of its maps, each
// with every enemy count a difficulty brings out.
const everyLevel = stages.flatMap((stage, i) =>
    DIFFICULTIES.map(
        (difficulty) => [i + 1, difficulty, stage[difficulty]] as const
    )
)

describe("levels", () => {
    it("ships at least one level", () => {
        expect(levels.length).toBeGreaterThan(0)
    })

    it("has each stage at every difficulty, and at the default as levels", () => {
        expect(stages).toHaveLength(STAGE_DATA.length)
        stages.forEach((stage, i) => {
            expect(levels[i]).toBe(stage[DEFAULT_DIFFICULTY])
            for (const difficulty of DIFFICULTIES) {
                expect(stage[difficulty]).toEqual(
                    parseLevel(STAGE_DATA[i], difficulty)
                )
            }
        })
    })

    // Until a stage is remade with a medium and a large map, its one map
    // stands in for both (sameForBoth), so every difficulty plays today's
    // game: it lists no more enemies than the fewest any difficulty brings
    // out. Each remade stage's own tests check it has two maps.
    it.each(
        STAGE_DATA.map((data, i) => [i + 1, data] as const).filter(
            ([, data]) => data.large === data.medium
        )
    )(
        "stage %i, not yet remade, has every enemy at every difficulty",
        (_n, data) => {
            const fewest = Math.min(...DIFFICULTIES.map((d) => ENEMY_COUNT[d]))
            expect(data.medium.enemies.length).toBeLessThanOrEqual(fewest)
        }
    )

    it.each(
        STAGE_DATA.map((data, i) => [i + 1, data] as const).filter(
            ([, data]) => data.large !== data.medium
        )
    )("stage %i, remade, has a large map bigger than its medium one", (n) => {
        const medium = stages[n - 1].medium
        const large = stages[n - 1].hard
        expect(large.width).toBeGreaterThan(medium.width)
        expect(large.height).toBeGreaterThan(medium.height)
    })

    it.each(everyLevel)(
        "stage %i (%s) shares its name and rules with the default difficulty",
        (n, difficulty, level) => {
            const base = levels[n - 1]
            expect(level.name).toBe(base.name)
            expect(level.rules).toEqual(base.rules)
            expect(level.enemies.length).toBeLessThanOrEqual(
                ENEMY_COUNT[difficulty]
            )
        }
    )

    it.each(everyLevel)(
        "stage %i (%s) has a name and a valid map",
        (_n, _difficulty, level) => {
            expect(level.name.trim()).not.toBe("")
            expect(level.width).toBeGreaterThan(0)
            expect(level.height).toBeGreaterThan(0)
        }
    )

    // 2-player games start player 2 on the "Q" each stage has beside the
    // "P", on normal floor (spawns never are ice).
    it.each(everyLevel)(
        "stage %i (%s) has a player 2 spawn of its own, next to player 1's",
        (_n, _difficulty, level) => {
            const [p1, p2] = level.playerSpawns
            expect(level.playerSpawns).toHaveLength(2)
            expect(p2).not.toEqual(p1)
            expect(Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y)).toBe(1)
            expect(level.ice[p2.y][p2.x]).toBe(false)
        }
    )

    // parseStage checks this (see SPAWN_GAP); this is the same rule worked
    // out on the parsed levels.
    it.each(everyLevel)(
        "stage %i (%s) has no enemy or boss spawn near a player spawn",
        (_n, _difficulty, level) => {
            const gap = (a: Vec2, b: Vec2) =>
                Math.hypot(
                    wrapDelta(a.x - b.x, level.width),
                    wrapDelta(a.y - b.y, level.height)
                )
            const others = [
                ...level.enemies.map((e) => e.pos),
                ...(level.boss ? footprint(level.boss.pos) : []),
            ]
            for (const player of level.playerSpawns) {
                for (const other of others) {
                    expect(gap(player, other)).toBeGreaterThanOrEqual(SPAWN_GAP)
                }
            }
        }
    )

    // With both players out, player 1 coming back (as in versus) and
    // player 2 for good, the game goes on: player 1 is back within a
    // couple of seconds of its wait.
    it.each(everyLevel)(
        "stage %i (%s) brings a versus player back while nobody is in play",
        (_n, _difficulty, level) => {
            const state = createGameState(
                level,
                [DEFAULT_ANIMAL, DEFAULT_ANIMAL],
                "versus"
            )
            const [p1, p2] = state.players
            takeOut(p1, PLAYER_RESPAWN_DELAY)
            takeOut(p2, null)
            const max = (PLAYER_RESPAWN_DELAY + 2) * TICK_RATE
            for (let i = 0; i < max && p1.out; i++) {
                const outcome = step(
                    state,
                    1 / TICK_RATE,
                    [IDLE, IDLE],
                    () => 0
                )
                expect(outcome).toBeNull()
            }
            expect(p1.out).toBe(false)
        }
    )

    // Player 2's spawn holds a dot in 1-player games, so they have every
    // dot the map has (counted from its text: every dot character, ice
    // dots, enemy and boss spawns and the "Q" included); with a player 2
    // it starts empty, as player 1's does.
    const dots = (cells: readonly (readonly Cell[])[]) =>
        cells.flat().filter((c) => c === Cell.dot).length
    it.each(everyLevel)(
        "stage %i (%s) keeps every dot in 1-player, the spawn's too",
        (n, difficulty, level) => {
            const { map } = STAGE_DATA[n - 1][MAP_SIZE[difficulty]]
            const mapDots = map.join("").match(/[.:EBQ]/g)?.length ?? 0
            const [p1, p2] = level.playerSpawns
            const solo = createGameState(level, DEFAULT_ANIMAL)
            expect(dots(solo.cells)).toBe(mapDots)
            expect(solo.cells[p2.y][p2.x]).toBe(Cell.dot)
            const duo = createGameState(level, [DEFAULT_ANIMAL, DEFAULT_ANIMAL])
            expect(dots(duo.cells)).toBe(mapDots - 1)
            expect(duo.cells[p2.y][p2.x]).toBe(Cell.none)
            expect(duo.cells[p1.y][p1.x]).toBe(Cell.none)
        }
    )

    // Fairness for player 2, sliding included, as parseLevel checks for
    // every spawn: every dot can be eaten from its spawn, and no slide
    // strands it with no way back there.
    it.each(everyLevel)(
        "stage %i (%s) lets player 2 eat every dot from its spawn",
        (_n, _difficulty, level) => {
            const reach = slideReach(
                level.cells.map((row) => [...row]),
                level.ice,
                level.playerSpawns[1]
            )
            level.cells.forEach((row, y) =>
                row.forEach((cell, x) => {
                    if (cell === Cell.dot)
                        expect(reach.visited[y][x]).toBe(true)
                })
            )
            expect(reach.stuck).toEqual([])
        }
    )
})

describe.each(EACH_MAP)("stage 1 (%s)", (difficulty) => {
    const level = parseLevel(stage1, difficulty)
    const cells: Cells = level.cells.map((row) => [...row])

    it("is the first level", () => {
        expect(stages[0][difficulty]).toEqual(level)
        expect(level.name).toBe("Classic")
    })

    // Wanderers and a chaser first, so Easy's three are the gentlest mix;
    // the ambusher only from the fourth enemy on.
    it("brings out wanderers and a chaser first, ambushers later, at the default speed", () => {
        const ais = level.enemies.map((e) => e.ai)
        expect(ais.slice(0, 3)).toEqual([
            AiType.random,
            AiType.chase,
            AiType.random,
        ])
        expect(ais[3]).toBe(AiType.ambusher)
        for (const ai of ais) {
            expect([AiType.random, AiType.chase, AiType.ambusher]).toContain(ai)
        }
        for (const enemy of level.enemies) {
            expect(enemy.speed).toBeUndefined()
        }
        expect(level.playerSpeed).toBeUndefined()
    })

    it("has the size of its map", () => {
        expect([level.width, level.height]).toEqual(
            MAP_SIZE[difficulty] === "medium" ? [21, 17] : [29, 21]
        )
    })

    it("has walls mirrored left to right", () => {
        const walls = level.cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
    })

    it("has a wrap tunnel", () => {
        const tunnels = level.cells.filter(
            (row) => row[0] !== Cell.wall && row[level.width - 1] !== Cell.wall
        )
        expect(tunnels.length).toBeGreaterThan(0)
    })

    // A tutorial shouldn't corner the player: every open cell has at least
    // two ways out.
    it("has no dead ends", () => {
        const deadEnds: string[] = []
        cells.forEach((row, y) =>
            row.forEach((cell, x) => {
                if (
                    cell !== Cell.wall &&
                    openNeighbours(cells, vec2(x, y)).length < 2
                ) {
                    deadEnds.push(`(${x}, ${y})`)
                }
            })
        )
        expect(deadEnds).toEqual([])
    })

    it("starts the enemies well away from the player", () => {
        const dist = distanceMap(cells, level.playerSpawns[0])
        for (const { pos } of level.enemies) {
            expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(15)
        }
    })
})

describe.each(EACH_MAP)("stage 2 (%s)", (difficulty) => {
    const level = parseLevel(stage2, difficulty)
    const cells: Cells = level.cells.map((row) => [...row])

    it("is the second level", () => {
        expect(stages[1][difficulty]).toEqual(level)
        expect(level.name).toBe("Wrap maze")
    })

    // Easy's three are the ambusher with a chaser and a wanderer; the
    // fourth is a second ambusher, and there is one at every difficulty
    // above that.
    it("introduces the ambusher, with a chaser and a random enemy", () => {
        const ais = level.enemies.map((e) => e.ai)
        expect(ais.slice(0, 4)).toEqual([
            AiType.ambusher,
            AiType.chase,
            AiType.random,
            AiType.ambusher,
        ])
        for (const ai of ais) {
            expect([AiType.random, AiType.chase, AiType.ambusher]).toContain(ai)
        }
        for (const enemy of level.enemies) {
            expect(enemy.speed).toBeUndefined()
        }
        expect(level.playerSpeed).toBeUndefined()
    })

    it("has the size of its map", () => {
        expect([level.width, level.height]).toEqual(
            MAP_SIZE[difficulty] === "medium" ? [21, 17] : [29, 21]
        )
    })

    it("has walls mirrored left to right", () => {
        const walls = level.cells.map((row) => row.map((c) => c === Cell.wall))
        expect(walls).toEqual(walls.map((row) => [...row].reverse()))
    })

    // The stage is built around tunnels, so both directions of wrapping
    // matter. parseLevel already checks that each tunnel's far end is open,
    // so an open cell on one edge is enough to count a tunnel.
    const tunnels = (cells: Level["cells"]) => ({
        rows: cells.filter((row) => row[0] !== Cell.wall).length,
        columns: cells[0].filter((cell) => cell !== Cell.wall).length,
    })
    it("has several left-right and top-bottom tunnels", () => {
        const { rows, columns } = tunnels(level.cells)
        expect(rows).toBeGreaterThanOrEqual(3)
        expect(columns).toBeGreaterThanOrEqual(3)
    })

    // The bigger map needs more ways off its edges to stay a wrap maze.
    it("has more tunnels on the large map than on the medium one", () => {
        const medium = tunnels(parseLevel(stage2, "medium").cells)
        const large = tunnels(parseLevel(stage2, "hard").cells)
        expect(large.rows).toBeGreaterThan(medium.rows)
        expect(large.columns).toBeGreaterThan(medium.columns)
    })

    it("has no dead ends", () => {
        const deadEnds: string[] = []
        cells.forEach((row, y) =>
            row.forEach((cell, x) => {
                if (
                    cell !== Cell.wall &&
                    openNeighbours(cells, vec2(x, y)).length < 2
                ) {
                    deadEnds.push(`(${x}, ${y})`)
                }
            })
        )
        expect(deadEnds).toEqual([])
    })

    // Distances include the tunnels (which save several steps here), so no
    // map edit can open a short wrap to an enemy unnoticed.
    it("starts the enemies well away from the player", () => {
        const dist = distanceMap(cells, level.playerSpawns[0])
        for (const { pos } of level.enemies) {
            expect(dist[pos.y][pos.x]).toBeGreaterThanOrEqual(15)
        }
    })
})
