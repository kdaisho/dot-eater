import { describe, expect, it, vi } from "vite-plus/test"
import { candidateMoves, enemyMove, stacksOn, type ChaseDistances } from "./ai"
import type { BlockMap } from "./breath"
import { AiType, Cell, ENEMY_IDS, PLAYER_SPEED, TICK_RATE } from "./constants"
import type { Character } from "./character"
import { step } from "./game"
import { slideDistances, stepFrom, type IceMap } from "./ice"
import {
    approachSides,
    FLANK_SLACK,
    INTERCEPT_AHEAD,
    INTERCEPT_CLOSE,
    interceptAim,
    NONE,
    PLAYER_SIDE,
    predictRoute,
    searchFrom,
    SNEAK_ALPHA,
    SNEAK_FAR,
    SNEAK_NEAR,
    sneakAlpha,
} from "./intercept"
import type { Cells } from "./level"
import { stages } from "./levels"
import { openNeighbours } from "./path"
import {
    cellsFrom,
    fixedRandom,
    makeEnemy,
    makeState,
    textMap,
} from "./test/helpers"
import { allDirections, samePos, vec2, type Vec2 } from "./vec2"

// slideDistances is spied on (still doing its real work) so a test can
// tell whether the interceptor's pathing was slide-aware.
vi.mock("./ice", async (importOriginal) => {
    const ice = await importOriginal<typeof import("./ice")>()
    return { ...ice, slideDistances: vi.fn(ice.slideDistances) }
})

const cellsOf = (rows: readonly string[]): Cells => cellsFrom(textMap(rows).map)

// Nobody else about: every cell is as far from the other enemies.
const nobody = (cells: Cells) => searchFrom(cells, []).dist

// A ring corridor round a block of wall, 24 cells long: the top row (y 1)
// and bottom row (y 5) from x 1 to 9, joined down the sides (x 1 and x 9).
const RING = [
    "###########",
    "#.........#",
    "#.#######.#",
    "#.#######.#",
    "#.#######.#",
    "#.........#",
    "###########",
]

// The way round the ring clockwise from `p`.
function clockwise({ x, y }: Vec2): Vec2 {
    if (y === 1 && x < 9) return vec2(1, 0)
    if (x === 9 && y < 5) return vec2(0, 1)
    if (y === 5 && x > 1) return vec2(-1, 0)
    return vec2(0, -1)
}

const interceptor = (x: number, y: number, last = { x, y }, slot = 0) =>
    makeEnemy(x, y, AiType.interceptor, last, ENEMY_IDS[slot])

// One move of `enemy` towards the player at `player`, who came from
// `last`, with `crowd` about; returns where it went.
function moveOnce(
    cells: Cells,
    enemy: Character,
    player: Vec2,
    last: Vec2 = player,
    crowd: readonly Character[] = [enemy],
    options: { speed?: number; blocked?: BlockMap } = {}
): Vec2 {
    enemyMove(
        cells,
        enemy,
        player,
        fixedRandom(0),
        last,
        undefined,
        options.blocked ?? null,
        undefined,
        new Map(),
        crowd,
        options.speed ?? PLAYER_SPEED
    )
    return enemy.pos
}

describe("predictRoute", () => {
    it("follows a straight corridor ahead, as far as it asks", () => {
        const cells = cellsOf([
            "#############",
            "#...........#",
            "#############",
        ])
        const route = predictRoute(cells, vec2(1, 1), vec2(0, 1), nobody(cells))
        expect(route).toHaveLength(INTERCEPT_AHEAD)
        expect(route).toEqual(
            Array.from({ length: INTERCEPT_AHEAD }, (_, i) => vec2(i + 2, 1))
        )
        expect(
            predictRoute(cells, vec2(1, 1), vec2(0, 1), nobody(cells), 3)
        ).toEqual([vec2(2, 1), vec2(3, 1), vec2(4, 1)])
    })

    it("stops at a dead end", () => {
        const cells = cellsOf(["#######", "#.....#", "#######"])
        expect(
            predictRoute(cells, vec2(3, 1), vec2(2, 1), nobody(cells))
        ).toEqual([vec2(4, 1), vec2(5, 1)])
    })

    it("goes round corners", () => {
        const cells = cellsOf(["#####", "#...#", "###.#", "###.#", "#####"])
        expect(
            predictRoute(cells, vec2(2, 1), vec2(1, 1), nobody(cells))
        ).toEqual([vec2(3, 1), vec2(3, 2), vec2(3, 3)])
    })

    it("is empty while the player has no heading", () => {
        const cells = cellsOf(RING)
        expect(
            predictRoute(cells, vec2(5, 1), vec2(5, 1), nobody(cells))
        ).toEqual([])
    })

    it("stops before going round a loop a second time", () => {
        const cells = cellsOf(["#####", "#...#", "#.#.#", "#...#", "#####"])
        const route = predictRoute(cells, vec2(2, 1), vec2(1, 1), nobody(cells))
        expect(route).toHaveLength(7)
        expect(route.at(-1)).toEqual(vec2(1, 1))
    })

    it("goes through a wrap tunnel", () => {
        const cells = cellsOf(["#######", ".......", "#######"])
        expect(
            predictRoute(cells, vec2(5, 1), vec2(4, 1), nobody(cells), 4)
        ).toEqual([vec2(6, 1), vec2(0, 1), vec2(1, 1), vec2(2, 1)])
    })

    describe("at a junction", () => {
        // A crossroads at (3, 2), the player coming in from the left.
        const cells = cellsOf([
            "#######",
            "###.###",
            "#.....#",
            "###.###",
            "#######",
        ])
        const at = (enemies: Vec2[]) =>
            predictRoute(
                cells,
                vec2(3, 2),
                vec2(2, 2),
                searchFrom(cells, enemies).dist,
                1
            )

        it("goes straight on when no way leads farther from the enemies", () => {
            expect(at([])).toEqual([vec2(4, 2)])
            // Up and down are as far from an enemy at the left end.
            expect(at([vec2(1, 2)])).toEqual([vec2(4, 2)])
        })

        it("takes the way leading away from the other enemies", () => {
            // An enemy round the right end: up and down are farther.
            expect(at([vec2(5, 2)])).toEqual([vec2(3, 1)])
            // One up as well: down is the farthest.
            expect(at([vec2(5, 2), vec2(3, 1)])).toEqual([vec2(3, 3)])
        })
    })
})

describe("interceptAim", () => {
    const route = [vec2(1, 0), vec2(2, 0), vec2(3, 0), vec2(4, 0)]
    // Reach along a row: the cell at x is `steps[x]` moves away.
    const reachOf = (steps: number[]) => (v: Vec2) => steps[v.x]

    it("picks the first cell it can reach no later than the player", () => {
        // At half the player's speed it makes the 2nd cell in time from 1
        // move away (1 move at 2 cells/s against 2 at 4: the same time),
        // but not the 1st from 1 away.
        expect(interceptAim(route, reachOf([9, 1, 1, 9, 9]), 2, 4)).toEqual(
            vec2(2, 0)
        )
        // As fast as the player: the 1st, from 1 away.
        expect(interceptAim(route, reachOf([9, 1, 1, 9, 9]), 4, 4)).toEqual(
            vec2(1, 0)
        )
    })

    it("heads for the farthest cell it can reach when it can make none in time", () => {
        expect(interceptAim(route, reachOf([0, 9, 9, 9, 9]), 2, 4)).toEqual(
            vec2(4, 0)
        )
        expect(
            interceptAim(route, reachOf([0, 9, 9, 9, Infinity]), 2, 4)
        ).toEqual(vec2(3, 0))
    })

    it("has nothing to aim at with no route or none of it reachable", () => {
        expect(interceptAim([], reachOf([0]), 2, 4)).toBeNull()
        expect(
            interceptAim(
                route,
                reachOf([0, Infinity, Infinity, Infinity, Infinity]),
                2,
                4
            )
        ).toBeNull()
    })
})

describe("approachSides", () => {
    it("tells which of the player's neighbours a cell's shortest way comes in by", () => {
        const cells = cellsOf(RING)
        const sides = approachSides(cells, vec2(5, 1))
        expect(sides(vec2(5, 1))).toBe(PLAYER_SIDE)
        // openNeighbours order: left (4, 1) is 0, right (6, 1) is 1.
        expect(sides(vec2(2, 1))).toBe(0)
        expect(sides(vec2(2, 5))).toBe(0)
        expect(sides(vec2(8, 5))).toBe(1)
        expect(sides(vec2(0, 0))).toBe(NONE)
    })
})

describe("the interceptor", () => {
    it("gets ahead of a player fleeing round a loop, where a chaser only trails", () => {
        // The player starts 4 cells ahead of the enemy round the ring and
        // runs clockwise at twice its speed. Following, a chaser can't
        // catch it until the player comes round behind it (10 s); the
        // interceptor reads where it is going and meets it head on.
        const caughtAfter = (ai: AiType) => {
            const enemy = makeEnemy(1, 1, ai, undefined, ENEMY_IDS[0])
            const state = makeState(RING_MAP, { x: 5, y: 1 }, [enemy], {
                health: 100,
            })
            state.players[0].character.lastPos = vec2(4, 1)
            // 5 s: the player eats the ring's last dot at about 6.
            for (let t = 1; t <= TICK_RATE * 5; t++) {
                const at = state.players[0].character.pos
                const move = { held: [clockwise(at)], pressed: vec2(0, 0) }
                if (step(state, 1 / TICK_RATE, move, fixedRandom(0))) break
                if (state.events.some((e) => e.type === "hurt")) {
                    return t / TICK_RATE
                }
            }
            return Infinity
        }
        expect(caughtAfter(AiType.chase)).toBe(Infinity)
        // Head on, the gap of 20 cells closes at 6 cells/s.
        expect(caughtAfter(AiType.interceptor)).toBeLessThan(4)
    })

    it("times its cut-off by the player's speed and its own", () => {
        // The ring again, the player 4 cells ahead and heading away. A fast
        // player can't be caught up with, so it goes round the other way to
        // meet it; a slow one it can head off by following, and so can a
        // fast interceptor (a difficulty scales its speed, KDA-290).
        const firstMove = (speed: number, enemySpeed = 2) => {
            const enemy = interceptor(1, 1)
            const state = makeState(RING_MAP, { x: 5, y: 1 }, [enemy])
            const player = state.players[0].character
            player.lastPos = vec2(4, 1)
            player.speed = speed
            enemy.speed = enemySpeed
            enemy.moveProgress = 1
            step(
                state,
                1 / TICK_RATE,
                { held: [], pressed: vec2(0, 0) },
                fixedRandom(0)
            )
            return enemy.pos
        }
        expect(firstMove(PLAYER_SPEED)).toEqual(vec2(1, 2))
        expect(firstMove(1)).toEqual(vec2(2, 1))
        expect(firstMove(PLAYER_SPEED, 8)).toEqual(vec2(2, 1))
    })

    it("heads for where the player is going, not where it is", () => {
        // A long ring: the player runs right along the top from (5, 1).
        // From (7, 3) below, the player is nearer round the left, so a
        // chaser goes left; it can't head the player off anywhere, so the
        // interceptor goes for the farthest cell of the route it can reach,
        // round the right, to meet the player coming the other way.
        const cells = cellsOf([
            "###############",
            "#.............#",
            "#.###########.#",
            "#.............#",
            "###############",
        ])
        const chaser = makeEnemy(7, 3, AiType.chase)
        expect(moveOnce(cells, chaser, vec2(5, 1), vec2(4, 1))).toEqual(
            vec2(6, 3)
        )
        const enemy = interceptor(7, 3)
        expect(moveOnce(cells, enemy, vec2(5, 1), vec2(4, 1))).toEqual(
            vec2(8, 3)
        )
    })

    it("goes for the player within INTERCEPT_CLOSE moves of it", () => {
        // 3 moves behind the player on the ring: it follows, though the
        // farthest cell of the route is nearer round the other way.
        const enemy = interceptor(2, 1)
        expect(moveOnce(cellsOf(RING), enemy, vec2(5, 1), vec2(4, 1))).toEqual(
            vec2(3, 1)
        )
    })

    describe("flanks", () => {
        // The player stands at (5, 1) on the ring (no heading, so it goes
        // straight for it). Its left side is the way in by (4, 1), its
        // right side the way in by (6, 1).
        const cells = cellsOf(RING)
        const player = vec2(5, 1)

        it("comes in from the side no chaser is on, when the ways tie", () => {
            // From (5, 5), right below, both ways round are 12 moves.
            const alone = interceptor(5, 5)
            expect(moveOnce(cells, alone, player)).toEqual(vec2(4, 5))
            // A chaser behind the player on the left: it goes round the
            // right instead of trailing it.
            const left = makeEnemy(3, 1, AiType.chase, undefined, ENEMY_IDS[1])
            const enemy = interceptor(5, 5)
            expect(
                moveOnce(cells, enemy, player, player, [enemy, left])
            ).toEqual(vec2(6, 5))
        })

        it("goes up to FLANK_SLACK moves longer for it", () => {
            // From (6, 5) the right way is 10 moves and the left 12.
            const alone = interceptor(6, 5)
            expect(moveOnce(cells, alone, player)).toEqual(vec2(7, 5))
            const right = makeEnemy(8, 1, AiType.chase, undefined, ENEMY_IDS[1])
            const enemy = interceptor(6, 5)
            expect(
                moveOnce(cells, enemy, player, player, [enemy, right])
            ).toEqual(vec2(5, 5))
            // From (7, 5) the left way is 14 moves against 8: too far.
            const far = interceptor(7, 5)
            expect(moveOnce(cells, far, player, player, [far, right])).toEqual(
                vec2(8, 5)
            )
        })

        it("doesn't count wanderers and patrollers as covering a side", () => {
            const left = makeEnemy(3, 1, AiType.random, undefined, ENEMY_IDS[1])
            const enemy = interceptor(5, 5)
            expect(
                moveOnce(cells, enemy, player, player, [enemy, left])
            ).toEqual(vec2(4, 5))
        })
    })

    describe("keeps the usual rules", () => {
        const cells = cellsOf(RING)
        const player = vec2(5, 1)

        it("never turns back, unless a punch just knocked it", () => {
            // Heading left along the bottom from (6, 5), the player is 11
            // moves back the way it came and 13 on: it goes on.
            const on = interceptor(6, 5, { x: 7, y: 5 })
            expect(moveOnce(cells, on, player)).toEqual(vec2(5, 5))
            const knocked = interceptor(6, 5, { x: 7, y: 5 })
            knocked.turnsBack = true
            expect(moveOnce(cells, knocked, player)).toEqual(vec2(7, 5))
            expect(knocked.turnsBack).toBe(false)
        })

        it("keeps from stacking on another interceptor", () => {
            // One ahead at (4, 5), come from (5, 5): the one at (5, 5) would
            // follow it onto (4, 5), so it takes the other way round (as
            // short) instead.
            const ahead = interceptor(4, 5, { x: 5, y: 5 }, 1)
            const enemy = interceptor(5, 5, undefined, 0)
            expect(stacksOn([ahead], enemy, vec2(4, 5))).toBe(true)
            expect(
                moveOnce(cells, enemy, player, player, [enemy, ahead])
            ).toEqual(vec2(6, 5))
        })

        it("goes round another way rather than stack once its hold runs out", () => {
            // A twin ahead at (8, 5), come from (7, 5): the other way round
            // is 6 moves longer, too far to spread to, so it holds.
            const ahead = interceptor(8, 5, { x: 7, y: 5 }, 1)
            const enemy = interceptor(7, 5, undefined, 0)
            const crowd = [enemy, ahead]
            expect(moveOnce(cells, enemy, player, player, crowd)).toEqual(
                vec2(7, 5)
            )
            // A whole move's hold later it goes the long way round.
            enemy.heldFor = 1 / enemy.speed
            expect(moveOnce(cells, enemy, player, player, crowd)).toEqual(
                vec2(6, 5)
            )
        })

        it("reads the player's route through blocked cells, which players walk into", () => {
            // A stink cloud at (7, 1), ahead of the player heading right
            // from (5, 1). The player can go on through it and down the
            // right side, where the interceptor, below, heads it off;
            // read on the cells as enemies see them, the route would end
            // at the cloud and it would go round the left for (6, 1).
            const blocked: BlockMap = cells.map((row, y) =>
                row.map((_, x) => x === 7 && y === 1)
            )
            const enemy = interceptor(5, 5)
            expect(
                moveOnce(cells, enemy, player, vec2(4, 1), [enemy], {
                    blocked,
                })
            ).toEqual(vec2(6, 5))
        })

        it("keeps out of blocked cells", () => {
            const blocked: BlockMap = cells.map((row, y) =>
                row.map((_, x) => x === 3 && y === 5)
            )
            // Both ways round tie, and it would go left, but for the
            // blocked cell on that way.
            const enemy = interceptor(5, 5)
            expect(
                moveOnce(cells, enemy, player, player, [enemy], { blocked })
            ).toEqual(vec2(6, 5))
            const walled = interceptor(4, 5, { x: 5, y: 5 })
            // Boxed in between the blocked cell and where it came from, it
            // turns back, the dead-end rule.
            expect(
                moveOnce(cells, walled, player, player, [walled], { blocked })
            ).toEqual(vec2(5, 5))
        })

        it("scores its ways slide-aware on a map with ice", () => {
            const { map, ice } = textMap(
                RING.map((r, y) => (y === 3 ? "#~#######.#" : r))
            )
            const iceCells = cellsFrom(map)
            vi.mocked(slideDistances).mockClear()
            const enemy = interceptor(5, 5)
            enemyMove(iceCells, enemy, player, fixedRandom(0), player, ice)
            expect(slideDistances).toHaveBeenCalled()
            vi.mocked(slideDistances).mockClear()
            moveOnce(cells, interceptor(5, 5), player)
            expect(slideDistances).not.toHaveBeenCalled()
        })
    })
})

// What interceptStep would choose scoring every way by a search of its own
// with the enemy's cell blocked, as chaseStep's shared distances are
// checked against in ai.test.ts. The aim is worked out as interceptStep
// does; only the scoring differs.
function blockedChoice(
    cells: Cells,
    ice: IceMap,
    enemy: Character,
    target: Vec2,
    targetLast: Vec2,
    crowd: readonly Character[]
): Vec2 {
    const pos = candidateMoves(cells, enemy)
    const others = crowd.filter((o) => o !== enemy)
    const reach = searchFrom(cells, pos, 1, enemy.pos).dist
    let aim = target
    if (samePos(target, enemy.pos)) {
        aim = targetLast
    } else if (reach(target) > INTERCEPT_CLOSE) {
        const away = searchFrom(
            cells,
            others.map((o) => o.pos)
        ).dist
        const route = predictRoute(cells, target, targetLast, away)
        const cut = interceptAim(route, reach, enemy.speed, PLAYER_SPEED)
        if (cut && !samePos(cut, enemy.pos)) aim = cut
    }
    const dist = slideDistances(cells, ice, aim, enemy.pos)
    const d = pos.map((v) => {
        const state = allDirections
            .map((_, h) => stepFrom(cells, ice, enemy.pos, h))
            .find((s) => s !== null && samePos(s.pos, v))
        return state ? dist(state) : Infinity
    })
    const best = Math.min(...d)
    const sides = approachSides(cells, target)
    const hunters = others.map((o) => sides(o.pos))
    const crowding = (v: Vec2) =>
        sides(v) < 0 ? 0 : hunters.filter((s) => s === sides(v)).length
    const ranked = pos
        .map((v, i) => ({
            v,
            i,
            d: d[i],
            n: d[i] <= best + FLANK_SLACK ? crowding(v) : Infinity,
        }))
        .sort((a, b) => a.n - b.n || a.d - b.d || a.i - b.i)
    return ranked[0].v
}

describe("the interceptor on shared distances", { timeout: 30_000 }, () => {
    // Every few open cells of `cells`.
    const sample = (cells: Cells, every: number) =>
        cells
            .flatMap((row, y) =>
                row.flatMap((c, x) => (c === Cell.wall ? [] : [vec2(x, y)]))
            )
            .filter((_, i) => i % every === 0)

    it("chooses as searches with its own cell blocked would", () => {
        let compared = 0
        for (const stage of stages) {
            for (const level of [stage.medium, stage.superHard]) {
                const cells = cellsFrom(level.cells)
                const { ice } = level
                const open = sample(cells, 1)
                // A chaser to flank, somewhere in the maze.
                const chaser = makeEnemy(
                    open[Math.floor(open.length / 2)].x,
                    open[Math.floor(open.length / 2)].y,
                    AiType.chase,
                    undefined,
                    ENEMY_IDS[1]
                )
                for (const target of sample(cells, 97)) {
                    const targetLast = openNeighbours(cells, target)[0]
                    const shared: ChaseDistances = new Map()
                    for (const at of sample(cells, 13)) {
                        for (const last of [...openNeighbours(cells, at), at]) {
                            const enemy = interceptor(at.x, at.y, last)
                            const crowd = [enemy, chaser]
                            const expected = blockedChoice(
                                cells,
                                ice,
                                enemy,
                                target,
                                targetLast,
                                crowd
                            )
                            enemyMove(
                                cells,
                                enemy,
                                target,
                                fixedRandom(0),
                                targetLast,
                                ice,
                                null,
                                cells,
                                shared,
                                crowd
                            )
                            expect(enemy.pos).toEqual(expected)
                            compared++
                        }
                    }
                }
            }
        }
        expect(compared).toBeGreaterThan(3000)
    })
})

describe("sneakAlpha", () => {
    it("is faint far from the player and fully seen close in", () => {
        expect(sneakAlpha(SNEAK_FAR)).toBe(SNEAK_ALPHA)
        expect(sneakAlpha(20)).toBe(SNEAK_ALPHA)
        expect(sneakAlpha(Infinity)).toBe(SNEAK_ALPHA)
        expect(sneakAlpha(SNEAK_NEAR)).toBe(1)
        expect(sneakAlpha(0)).toBe(1)
        expect(SNEAK_ALPHA).toBeCloseTo(0.35)
    })

    it("fades in steadily as it closes in", () => {
        const mid = (SNEAK_FAR + SNEAK_NEAR) / 2
        expect(sneakAlpha(mid)).toBeCloseTo((1 + SNEAK_ALPHA) / 2)
        let last = 0
        for (let d = 6; d >= 0; d -= 0.25) {
            expect(sneakAlpha(d)).toBeGreaterThanOrEqual(last)
            last = sneakAlpha(d)
        }
    })
})

const RING_MAP = textMap(RING).map
