import { describe, expect, it, vi } from "vite-plus/test"
import { AiType, TICK_RATE } from "./constants"
import { createGameState, step, type GameState, type MoveInput } from "./game"
import type { Level } from "./level"
import { stages } from "./levels"
import { parseFlat, seededRandom } from "./test/helpers"
import { samePos, vec2 } from "./vec2"

// Same-kind enemies kept from stacking (KDA-284, see spreadChoice in
// ai.ts), played out in whole games.

// Every move of a chaser, ambusher or Splitter is also worked out without
// the crowd, as it was before the spread rule, on a copy of the enemy; the
// moves that came out differently are counted.
const spread = vi.hoisted(() => ({ moves: 0, changed: 0 }))
vi.mock("./ai", async (importOriginal) => {
    const ai = await importOriginal<typeof import("./ai")>()
    const spreads = new Set<AiType>([
        AiType.chase,
        AiType.ambusher,
        AiType.splitter,
    ])
    return {
        ...ai,
        enemyMove: (...args: Parameters<typeof ai.enemyMove>) => {
            const [cells, enemy, ...rest] = args
            if (!spreads.has(enemy.ai)) return ai.enemyMove(...args)
            const alone = {
                ...enemy,
                pos: vec2(enemy.pos.x, enemy.pos.y),
                lastPos: vec2(enemy.lastPos.x, enemy.lastPos.y),
            }
            const [target, random, last, ice, blocked, view, shared] = rest
            ai.enemyMove(
                cells,
                alone,
                target,
                random,
                last,
                ice,
                blocked,
                view,
                shared,
                []
            )
            ai.enemyMove(...args)
            spread.moves++
            if (!samePos(alone.pos, enemy.pos)) spread.changed++
        },
    }
})

// The maps the stacking showed up on, as they were when it was found, so
// the tests keep playing the same mazes whatever later becomes of the
// stages. Stage 1's large map: chasers 5 and 8 start as mirror images
// round the ring's single bottom exit and left it as one on every seed.
const classicLarge = parseFlat({
    name: "Classic (large)",
    parTime: 140,
    map: [
        "#############################",
        "#.............#.............#",
        "#.###.#####.#.#.#.#####.###.#",
        "#...........................#",
        "#.###.#.#####.#.#####.#.###.#",
        "#.....#.....#...#.....#.....#",
        "#####.#####.#####.#####.#####",
        "#...#...................#...#",
        "#.#.#.########.########.#.#.#",
        "#.#.#.###.E.E...E.E.###.#.#.#",
        "......###.#########.###......",
        "#.#.#.###.E.E...E.E.###.#.#.#",
        "#.#.#.########.########.#.#.#",
        "#...#...................#...#",
        "#####.#####.#####.#####.#####",
        "#.....#.....#...#.....#.....#",
        "#.###.#.#####.#.#####.#.###.#",
        "#...........................#",
        "#.###.#####.#.#.#.#####.###.#",
        "#.............PQ............#",
        "#############################",
    ],
    enemies: [
        { ai: "random" },
        { ai: "chase" },
        { ai: "random" },
        { ai: "ambusher" },
        { ai: "chase" },
        { ai: "random" },
        { ai: "ambusher" },
        { ai: "chase" },
    ],
})

// Stage 2's medium map: ambushers 1 and 4 went as one on most seeds.
const wrapMazeMedium = parseFlat({
    name: "Wrap maze (medium)",
    parTime: 95,
    map: [
        "###.##.#######.##.###",
        "#...................#",
        "#.##.##.#####.##.##.#",
        "..........#..........",
        "#.##.##.#.#.#.##.##.#",
        "#...................#",
        "#.##.##.#.#.#.##.##.#",
        "#.##.##.#E.E#.##.##.#",
        "........#.#.#........",
        "#.##.##.#E.E#.##.##.#",
        "#.##.##.#####.##.##.#",
        "#...................#",
        "#.##.##.#.#.#.##.##.#",
        "..........#..........",
        "#.##.##.#####.##.##.#",
        "#.........PQ........#",
        "###.##.#######.##.###",
    ],
    enemies: [
        { ai: "ambusher" },
        { ai: "chase" },
        { ai: "random" },
        { ai: "ambusher" },
    ],
})

const WAYS = [vec2(1, 0), vec2(0, 1), vec2(-1, 0), vec2(0, -1)]

// Play `level` for `ticks` ticks with player 1 (who can't be knocked out)
// holding a direction picked at random every 25 ticks, calling `each`
// after every tick. Seeded, so a run is the same every time.
function play(
    level: Level,
    seed: number,
    ticks: number,
    each: (state: GameState) => void
) {
    const state = createGameState(level)
    state.players[0].health = Infinity
    const random = seededRandom(seed)
    const turns = seededRandom(seed * 31)
    let way = 0
    for (let t = 0; t < ticks; t++) {
        if (t % 25 === 0) way = Math.floor(turns() * WAYS.length)
        const move: MoveInput = { held: [WAYS[way]], pressed: vec2(0, 0) }
        if (step(state, 1 / TICK_RATE, move, random)) return
        each(state)
    }
}

// The longest run of ticks, over every pair of chasers, ambushers or
// Splitters of one kind, that the two stood on one cell having come from
// one cell, playing `level` for `ticks`.
function longestStack(level: Level, seed: number, ticks: number): number {
    const together = new Map<string, number>()
    let longest = 0
    play(level, seed, ticks, ({ enemies }) => {
        enemies.forEach((a, i) => {
            enemies.slice(i + 1).forEach((b, j) => {
                const key = `${i},${i + 1 + j}`
                const stacked =
                    a.ai === b.ai &&
                    a.ai !== AiType.random &&
                    a.respawnIn <= 0 &&
                    b.respawnIn <= 0 &&
                    samePos(a.pos, b.pos) &&
                    samePos(a.lastPos, b.lastPos)
                const run = stacked ? (together.get(key) ?? 0) + 1 : 0
                together.set(key, run)
                longest = Math.max(longest, run)
            })
        })
    })
    return longest
}

const SEEDS = [1, 2, 3, 4, 5]

describe("same-kind enemies in a whole game", () => {
    // Before the spread rule each of these went as one for most of the
    // run (about 97 s of 100) on most seeds.
    it.each([
        ["stage 1's large map's chasers and ambushers", classicLarge],
        ["stage 2's medium map's ambushers", wrapMazeMedium],
    ] satisfies [string, Level][])(
        "keeps %s from going as one",
        (_, level) => {
            for (const seed of SEEDS) {
                expect(longestStack(level, seed, 6000)).toBeLessThan(
                    TICK_RATE / 4
                )
            }
        },
        30_000
    )

    // Where no two of a kind ever stack, every enemy goes exactly the way
    // it did before the rule.
    const calm: [string, Level][] = [
        ...stages.map((stage, i): [string, Level] => [
            `stage ${i + 1} at Easy`,
            stage.easy,
        ]),
        ["stage 1 at Medium", stages[0].medium],
        ["stage 1 at Hard", stages[0].hard],
    ]
    it.each(calm)(
        "leaves every move as it was on %s",
        (_, level) => {
            spread.moves = 0
            spread.changed = 0
            for (const seed of SEEDS) play(level, seed, 3000, () => {})
            expect(spread.moves).toBeGreaterThan(100)
            expect(spread.changed).toBe(0)
        },
        30_000
    )

    it("changes moves where two of a kind would stack", () => {
        spread.changed = 0
        play(classicLarge, 1, 3000, () => {})
        expect(spread.changed).toBeGreaterThan(0)
    })
})
