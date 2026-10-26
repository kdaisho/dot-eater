import { createBreather, type BreathDef } from "../breath"
import { BREATHS } from "../breaths"
import { AiType, Cell, CharacterId, TICK_RATE } from "../constants"
import { DEFAULT_ANIMAL } from "../roster"
import { createCharacter, type Character } from "../character"
import { drawnPos, step, type GameState } from "../game"
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

// Copy a literal map into a fresh, mutable Cells grid.
export function cellsFrom(map: MapLiteral): Cells {
    return map.map((row) => [...row])
}

export function makeEnemy(
    x: number,
    y: number,
    ai: AiType = AiType.random,
    last: { x: number; y: number } = { x, y },
    id: CharacterId = CharacterId.enemy1
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
        CharacterId.enemy1,
        vec2(x, y),
        AiType.patroller,
        undefined,
        route.map(([rx, ry]) => vec2(rx, ry))
    )
    enemy.lastPos = vec2(last.x, last.y)
    return enemy
}

// Like createGameState, the player's start cell never holds a dot, and the
// spawns are where the characters start. The player is on their last life
// unless `lives` says otherwise, so any collision ends the game. There is no
// ice unless `ice` says where (see textMap). The player has the default
// character's breath unless `breath` says otherwise, with an empty meter.
export function makeState(
    map: MapLiteral,
    player: { x: number; y: number },
    enemies: Character[] = [],
    {
        lives = 1,
        ice,
        breath = BREATHS[DEFAULT_ANIMAL],
    }: { lives?: number; ice?: IceMap; breath?: BreathDef } = {}
): GameState {
    const cells = cellsFrom(map)
    if (cells[player.y][player.x] === Cell.dot) {
        cells[player.y][player.x] = Cell.none
    }
    const floorIce = ice ?? cells.map((row) => row.map(() => false))
    return {
        cells,
        ice: floorIce,
        floorIce,
        tiles: [],
        player: createCharacter(CharacterId.player, vec2(player.x, player.y)),
        breather: createBreather(breath),
        enemies,
        bufferedStep: vec2(0, 0),
        score: 0,
        ticks: 0,
        lives,
        eatenAt: null,
        spawns: {
            player: vec2(player.x, player.y),
            enemies: enemies.map((e) => vec2(e.pos.x, e.pos.y)),
        },
    }
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
// definition holds functions, which structuredClone can't copy; it is fixed
// data, so the copy shares it.
export function cloneState(state: GameState): GameState {
    const { breath, ...breather } = state.breather
    const copy = structuredClone({ ...state, breather })
    return { ...copy, breather: { ...copy.breather, breath } }
}

// A random source that always returns the same value.
export const fixedRandom = (value: number) => () => value

// Step one tick at a time holding `held` (nothing by default; enemies use
// fixedRandom(0)) until the player is caught, i.e. the game is lost or a
// life is lost, and return how many ticks that took. Fails after `max`
// ticks, or if the game ends another way.
export function ticksUntilCaught(
    state: GameState,
    held: Vec2 = vec2(0, 0),
    max = TICK_RATE * 2
): number {
    const lives = state.lives
    const move = {
        held: held.x === 0 && held.y === 0 ? [] : [held],
        pressed: vec2(0, 0),
    }
    for (let i = 1; i <= max; i++) {
        const outcome = step(state, 1 / TICK_RATE, move, fixedRandom(0))
        if (outcome === "dead" || state.lives < lives) return i
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
