import { createBoss, type Boss } from "../boss"
import type { BreathDef } from "../breath"
import { BREATHS } from "../breaths"
import { AiType, Cell, CharacterId, ENEMY_IDS, TICK_RATE } from "../constants"
import { DEFAULT_ANIMAL } from "../roster"
import { createCharacter, type Character } from "../character"
import {
    drawnPos,
    IDLE,
    newPlayer,
    step,
    type GameState,
    type Mode,
    type MoveInput,
} from "../game"
import type { IceMap } from "../ice"
import { parseLevel, type Cells, type Level, type LevelData } from "../level"
import { vec2, type Vec2 } from "../vec2"

export type MapLiteral = readonly (readonly Cell[])[]

// The map that was hard-coded before levels became data (KDA-195). Level 1
// kept its walls until Stage 1 replaced it.
export const OLD_MAP = [
    [1, 1, 1, 1, 0, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 0, 0, 0, 1, 0, 0, 0, 0],
    [1, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1],
] as const satisfies MapLiteral

// The old map as level data: level 1 until Stage 1 replaced it (KDA-203).
// Kept as a small, well-known fixture for tests that rely on its layout.
export const OLD_LEVEL_DATA: LevelData = {
    name: "Level 1",
    parTime: 60,
    map: [
        "####.####",
        "#...P...#",
        "#.#.#.#.#",
        "#.#.#.#.#",
        ".E..#..E.",
        "#.#...#.#",
        "#.#####.#",
        "#.......#",
        "####.####",
    ],
    enemies: [{ ai: "random" }, { ai: "chase" }],
}

export const OLD_LEVEL: Level = parseLevel(OLD_LEVEL_DATA)

// A 29x21 maze, the size of the large mazes to come (KDA-266): too big to
// fit whole on a phone, so the view follows the player. Pillars on a grid,
// a tunnel through the middle row, player 1 bottom left, player 2 bottom
// right and enemies top right and in the middle. Not a stage.
export const BIG_LEVEL_DATA: LevelData = {
    name: "Big",
    parTime: 120,
    map: [
        "#############################",
        "#..........................E#",
        "#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
        "#...........................#",
        "#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
        "#...........................#",
        "#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
        "#...........................#",
        "#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
        "#.............E.............#",
        ".............................",
        "#...........................#",
        "#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
        "#...........................#",
        "#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
        "#...........................#",
        "#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
        "#...........................#",
        "#.#.#.#.#.#.#.#.#.#.#.#.#.#.#",
        "#P.........................Q#",
        "#############################",
    ],
    enemies: [{ ai: "random" }, { ai: "chase" }],
}

export const BIG_LEVEL: Level = parseLevel(BIG_LEVEL_DATA)

// Copy a literal map into a fresh, mutable Cells grid.
export function cellsFrom(map: MapLiteral): Cells {
    return map.map((row) => [...row])
}

export function makeEnemy(
    x: number,
    y: number,
    ai: AiType = AiType.random,
    last: { x: number; y: number } = { x, y },
    id: CharacterId = ENEMY_IDS[0]
): Character {
    const enemy = createCharacter(id, vec2(x, y), ai)
    enemy.lastPos = vec2(last.x, last.y)
    return enemy
}

// A patroller at (x, y) walking `route` ([x, y] waypoints, looped).
export function makePatroller(
    x: number,
    y: number,
    route: readonly (readonly [number, number])[],
    last: { x: number; y: number } = { x, y }
): Character {
    const enemy = createCharacter(
        ENEMY_IDS[0],
        vec2(x, y),
        AiType.patroller,
        undefined,
        route.map(([rx, ry]) => vec2(rx, ry))
    )
    enemy.lastPos = vec2(last.x, last.y)
    return enemy
}

type Cell2 = { x: number; y: number }

// Like createGameState, the players' start cells never hold a dot, and the
// spawns are where the characters start. `player` is player 1's start, or
// every player's (player 1 first) for a 2-player game. The players have
// 1 health unless `health` says otherwise, so any hit knocks one out (in
// solo, ending the game). There is no ice unless `ice` says where (see textMap). Every player
// has the default character's breath unless `breath` says otherwise (one
// breath for all, or one per player), with an empty meter. There is no boss
// unless `boss` gives one (see makeBoss). The game plays by `mode`'s rules
// (solo unless given; see knockOut), with the players passing through
// each other unless `playersBump` says otherwise.
export function makeState(
    map: MapLiteral,
    player: Cell2 | readonly Cell2[],
    enemies: Character[] = [],
    {
        health = 1,
        ice,
        breath = BREATHS[DEFAULT_ANIMAL],
        boss = null,
        mode = "solo",
        playersBump = false,
    }: {
        health?: number
        ice?: IceMap
        breath?: BreathDef | readonly BreathDef[]
        boss?: Boss | null
        mode?: Mode
        playersBump?: boolean
    } = {}
): GameState {
    const starts = "x" in player ? [player] : player
    const cells = cellsFrom(map)
    for (const { x, y } of starts) {
        if (cells[y][x] === Cell.dot) cells[y][x] = Cell.none
    }
    const floorIce = ice ?? cells.map((row) => row.map(() => false))
    const breathOf = (i: number) =>
        "fire" in breath ? breath : (breath[i] ?? breath[0])
    return {
        mode,
        cells,
        ice: floorIce,
        floorIce,
        tiles: [],
        players: starts.map(({ x, y }, i) => ({
            ...newPlayer(
                createCharacter(CharacterId.player, vec2(x, y)),
                breathOf(i)
            ),
            health,
        })),
        playersBump,
        enemies,
        boss,
        ticks: 0,
        spawns: {
            players: starts.map(({ x, y }) => vec2(x, y)),
            enemies: enemies.map((e) => vec2(e.pos.x, e.pos.y)),
        },
        events: [],
        regrow: null,
    }
}

// A boss with its footprint's top-left cell at (x, y), at rest there and
// ready to move (unlike createBoss, which starts it with the grace period),
// at `speed` cells/s (the default if left out).
export function makeBoss(x: number, y: number, speed?: number): Boss {
    const boss = createBoss(vec2(x, y), speed)
    boss.moveProgress = 1
    return boss
}

// A map and its ice from rows of level map characters ("#" wall, "." dot,
// space empty, "~" ice, ":" ice with a dot), for makeState. Unlike
// parseLevel nothing is checked, so a test can build any situation.
export function textMap(rows: readonly string[]): {
    map: MapLiteral
    ice: IceMap
} {
    const chars = rows.map((row) => Array.from(row))
    return {
        map: chars.map((row) =>
            row.map((ch) =>
                ch === "#"
                    ? Cell.wall
                    : ch === "." || ch === ":"
                      ? Cell.dot
                      : Cell.none
            )
        ),
        ice: chars.map((row) => row.map((ch) => ch === "~" || ch === ":")),
    }
}

// A breath for testing the breath machinery (see breath.ts), not one of the
// characters' (those are in src/breaths/): a 3-cell line costing 10 with a
// 1 s cooldown that does nothing unless `overrides` gives it a `fire` hook.
export function testBreath(overrides: Partial<BreathDef> = {}): BreathDef {
    return {
        animal: DEFAULT_ANIMAL,
        shape: { kind: "line", range: 3 },
        cost: 10,
        cooldown: 1,
        duration: 1,
        maxEnergy: 100,
        speedScale: 1,
        fire() {},
        ...overrides,
    }
}

// A deep copy of `state`, for comparing before and after. The breath
// definitions hold functions, which structuredClone can't copy; they are
// fixed data, so the copy shares them.
export function cloneState(state: GameState): GameState {
    const breaths = state.players.map((p) => p.breather.breath)
    const players = state.players.map((p) => {
        const { breath: _, ...breather } = p.breather
        return { ...p, breather }
    })
    const copy = structuredClone({ ...state, players })
    return {
        ...copy,
        players: copy.players.map((p, i) => ({
            ...p,
            breather: { ...p.breather, breath: breaths[i] },
        })),
    }
}

// Player 2's input for one tick of a 2-player step, with player 1 idle.
export function p2Move(move: MoveInput): MoveInput[] {
    return [IDLE, move]
}

// A random source that always returns the same value.
export const fixedRandom = (value: number) => () => value

// Step one tick at a time with player 1 holding `held` (nothing by
// default; enemies use fixedRandom(0)) until a player is hurt or knocked
// out (so the game may be lost, or in a 2-player mode a player taken out),
// and return how many ticks that took. Fails after `max` ticks, or if the
// game ends another way.
export function ticksUntilCaught(
    state: GameState,
    held: Vec2 = vec2(0, 0),
    max = TICK_RATE * 2
): number {
    const move = {
        held: held.x === 0 && held.y === 0 ? [] : [held],
        pressed: vec2(0, 0),
    }
    for (let i = 1; i <= max; i++) {
        const outcome = step(state, 1 / TICK_RATE, move, fixedRandom(0))
        const hit = state.events.some(
            (e) => e.type === "hurt" || e.type === "playerCaught"
        )
        if (outcome === "dead" || hit) return i
        if (outcome) throw new Error(`Ended without a catch: ${outcome}`)
    }
    throw new Error(`Not caught within ${max} ticks`)
}

// Where `who` is drawn now, for collisions (drawnPos in game.ts).
export function drawn(state: GameState, who: Character): Vec2 {
    return drawnPos(who, state.cells[0].length, state.cells.length)
}

// The character under the cursor on character select, for DOM tests of main.
export const pick = () =>
    document.querySelector<HTMLElement>("#overlay li.selected")?.dataset.animal
