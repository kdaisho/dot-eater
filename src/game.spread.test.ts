import { describe, expect, it, vi } from "vite-plus/test"
import { addStatus } from "./breath"
import type { Character } from "./character"
import { AiType, ENEMY_IDS, TICK_RATE } from "./constants"
import {
    createGameState,
    IDLE,
    step,
    type GameState,
    type MoveInput,
} from "./game"
import type { Level } from "./level"
import { stages } from "./levels"
import {
    makeEnemy,
    makeState,
    parseFlat,
    seededRandom,
    textMap,
} from "./test/helpers"
import { samePos, vec2 } from "./vec2"

// Same-kind enemies kept from stacking (KDA-284, see spreadChoice in
// ai.ts), played out in whole games.

// Every move of a chaser, ambusher or Splitter is also worked out without
// the crowd, as it was before the spread rule, on a copy of the enemy; the
// moves that came out differently are counted.
const spread = vi.hoisted(() => ({ moves: 0, changed: 0 }))
vi.mock("./ai", async (importOriginal) => {
    const ai = await importOriginal<typeof import("./ai")>()
    // Imported here: the mock is set up before the file's imports.
    const { AiType: Ai } = await import("./constants")
    const spreads = new Set<AiType>([Ai.chase, Ai.ambusher, Ai.splitter])
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
            const held = ai.enemyMove(...args)
            spread.moves++
            if (!samePos(alone.pos, enemy.pos)) spread.changed++
            return held
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
// holding a direction picked at random (seeded by `turnSeed`) every 25
// ticks, calling `each` after every tick. Seeded, so a run is the same
// every time.
function play(
    level: Level,
    seed: number,
    ticks: number,
    each: (state: GameState) => void,
    turnSeed = seed * 31
) {
    const state = createGameState(level)
    state.players[0].health = Infinity
    const random = seededRandom(seed)
    const turns = seededRandom(turnSeed)
    let way = 0
    for (let t = 0; t < ticks; t++) {
        if (t % 25 === 0) way = Math.floor(turns() * WAYS.length)
        const move: MoveInput = { held: [WAYS[way]], pressed: vec2(0, 0) }
        if (step(state, 1 / TICK_RATE, move, random)) return
        each(state)
    }
}

// Whether `a` and `b`, chasers, ambushers or Splitters of one kind, stand
// on one cell having come from one cell.
function stacked(a: Character, b: Character): boolean {
    return (
        a.ai === b.ai &&
        SPREADING.has(a.ai) &&
        a.respawnIn <= 0 &&
        b.respawnIn <= 0 &&
        samePos(a.pos, b.pos) &&
        samePos(a.lastPos, b.lastPos)
    )
}
const SPREADING = new Set<AiType>([
    AiType.chase,
    AiType.ambusher,
    AiType.splitter,
])

// The longest run of ticks, over every pair of enemies, that the two were
// stacked, playing `level` for `ticks` (see play).
function longestStack(
    level: Level,
    seed: number,
    ticks: number,
    turnSeed?: number
): number {
    const together = new Map<string, number>()
    let longest = 0
    const each = ({ enemies }: GameState) => {
        enemies.forEach((a, i) => {
            enemies.slice(i + 1).forEach((b, j) => {
                const key = `${i},${i + 1 + j}`
                const run = stacked(a, b) ? (together.get(key) ?? 0) + 1 : 0
                together.set(key, run)
                longest = Math.max(longest, run)
            })
        })
    }
    play(level, seed, ticks, each, turnSeed)
    return longest
}

const SEEDS = [1, 2, 3, 4, 5]

describe("same-kind enemies in a whole game", () => {
    // Before the spread rule each of these went as one for most of the
    // run (about 97 s of 100) on most seeds. Stages 3 and 8 have ice; at
    // Hard and Super Hard their chasers went as one for 30 s or more on
    // most seeds too. Stage 5's two Splitters (and their halves) did at
    // every difficulty, Easy included.
    it.each([
        ["stage 1's large map's chasers and ambushers", classicLarge],
        ["stage 2's medium map's ambushers", wrapMazeMedium],
        ["stage 3 at Hard", stages[2].hard],
        ["stage 3 at Super Hard", stages[2].superHard],
        ["stage 8 at Hard", stages[7].hard],
        ["stage 8 at Super Hard", stages[7].superHard],
        ["stage 5 at Easy", stages[4].easy],
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
    // it did before the rule: every stage at Easy but stage 5 (see above).
    const calm: [string, Level][] = [
        ...stages.flatMap((stage, i): [string, Level][] =>
            i === 4 ? [] : [[`stage ${i + 1} at Easy`, stage.easy]]
        ),
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

    // An ice slide is no choice, but it still keeps from stacking: on this
    // run two chasers that met slid up an ice column as one for 6 s.
    it("keeps chasers from sliding as one up stage 3's ice", () => {
        expect(
            longestStack(stages[2].superHard, 7, 6000, 7 * 31 + 7)
        ).toBeLessThan(TICK_RATE / 4)
    })

    it("changes moves where two of a kind would stack", () => {
        spread.changed = 0
        play(classicLarge, 1, 3000, () => {})
        expect(spread.changed).toBeGreaterThan(0)
    })
})

describe("same-kind enemies holding a move", () => {
    // Enemies of `ai`, ready to move, each at its [x, y] having come from
    // [x, y].
    function ready(
        ai: AiType,
        at: readonly (readonly [number, number, number, number])[]
    ): Character[] {
        return at.map(([x, y, lx, ly], i) => {
            const enemy = makeEnemy(x, y, ai, { x: lx, y: ly }, ENEMY_IDS[i])
            enemy.moveProgress = 1
            return enemy
        })
    }

    // How many moves `enemies` make over `ticks` ticks with the player idle.
    function movesOver(
        state: GameState,
        enemies: readonly Character[],
        ticks: number
    ): number {
        let moves = 0
        for (let t = 0; t < ticks; t++) {
            const before = enemies.map((e) => vec2(e.pos.x, e.pos.y))
            step(state, 1 / TICK_RATE, IDLE, seededRandom(1))
            moves += enemies.filter((e, i) => !samePos(e.pos, before[i])).length
        }
        return moves
    }

    // Four of a kind going round a 2x2 room: each one's way on is where the
    // next one is, having come from its cell, so each would hold for the
    // next, which holds for the next, round the loop. A hold lasts a move's
    // time at most, so they go on round, if more slowly.
    it.each([
        ["chasers", AiType.chase],
        ["ambushers", AiType.ambusher],
    ] as const)("keeps four %s going round a loop of cells", (_, ai) => {
        const { map } = textMap([
            "#######",
            "#.#...#",
            "#.#.#.#",
            "#...#.#",
            "####..#",
            "#...#.#",
            "#..#..#",
            "#.....#",
            "#######",
        ])
        const enemies = ready(ai, [
            [4, 7, 4, 6],
            [5, 7, 4, 7],
            [5, 6, 5, 7],
            [4, 6, 5, 6],
        ])
        const state = makeState(map, { x: 4, y: 6 }, enemies, {
            health: Infinity,
        })
        expect(movesOver(state, enemies, TICK_RATE * 10)).toBeGreaterThan(20)
    })

    // Ambushers going round the 2x2 room they aim into, the player standing
    // in the corridor off it, its latest move leftwards.
    it("keeps four ambushers going round the cells they aim at", () => {
        const { map } = textMap([
            "#########",
            "#.......#",
            "#..######",
            "#########",
        ])
        const enemies = ready(AiType.ambusher, [
            [1, 1, 1, 2],
            [2, 1, 1, 1],
            [2, 2, 2, 1],
            [1, 2, 2, 2],
        ])
        const state = makeState(map, { x: 5, y: 1 }, enemies, {
            health: Infinity,
        })
        state.players[0].character.lastPos = vec2(6, 1)
        expect(movesOver(state, enemies, TICK_RATE * 10)).toBeGreaterThan(20)
    })

    // An ice slide carries a chaser towards a twin that came up the same
    // ice and is holding behind a frozen one: it holds too, a cell behind.
    it("doesn't slide onto a twin", () => {
        const { map, ice } = textMap([
            "#######",
            "#....##",
            "#~#####",
            "#.#####",
            "#.....#",
            "#######",
        ])
        // The twin at (1, 1) came up from (1, 2); the frozen one at (2, 1)
        // came from (1, 1); the slider at (1, 2), on ice, came up from
        // (1, 3), so it slides on up.
        const [twin, frozen, slider] = ready(AiType.chase, [
            [1, 1, 1, 2],
            [2, 1, 1, 1],
            [1, 2, 1, 3],
        ])
        addStatus(frozen, { name: "test.hold", holds: true }, 3)
        const state = makeState(map, { x: 5, y: 1 }, [twin, frozen, slider], {
            health: Infinity,
            ice,
        })
        let together = 0
        for (let t = 0; t < TICK_RATE * 3; t++) {
            step(state, 1 / TICK_RATE, IDLE, seededRandom(1))
            if (stacked(twin, slider)) together++
        }
        expect(together).toBeLessThan(TICK_RATE / 4)
    })
})
