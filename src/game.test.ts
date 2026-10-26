import { describe, expect, it } from "vite-plus/test"
import {
    AiType,
    Cell,
    CharacterId,
    DOT_POINTS,
    ENEMY_SPEED,
    PHANTOM_SPEED,
    PLAYER_SPEED,
    START_LIVES,
    TICK_RATE,
} from "./constants"
import type { Random } from "./ai"
import {
    checkEnd,
    createGameState,
    movePlayer,
    settle,
    step,
    type GameState,
    type Outcome,
} from "./game"
import { parseLevel } from "./level"
import { levels } from "./levels"
import {
    fixedRandom,
    makeEnemy,
    makePatroller,
    makeState,
    OLD_LEVEL,
    OLD_MAP,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
const west = vec2(-1, 0)
const north = vec2(0, -1)

const map = [
    [1, 0, 1],
    [0, 2, 2],
    [1, 1, 1],
] as const

// A long horizontal corridor full of dots.
const corridor = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
    [2, 2, 2, 2, 2, 2, 2, 2, 2],
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
] as const

// Make every character ready to move on the next tick.
function ready(state: GameState) {
    state.player.moveProgress = 1
    for (const enemy of state.enemies) enemy.moveProgress = 1
}

// Run `n` ticks holding the same direction (and pressing nothing new),
// returning the last outcome seen.
function run(
    state: GameState,
    n: number,
    held: Vec2 = none,
    random: Random = fixedRandom(0)
): Outcome | null {
    let outcome: Outcome | null = null
    for (let i = 0; i < n; i++) {
        outcome =
            step(
                state,
                TICK,
                { held: heldList(held), pressed: none },
                random
            ) ?? outcome
    }
    return outcome
}

// One tick in which `pressed` is tapped (pressed and released within the
// tick) while `held` stays held.
function tap(state: GameState, pressed: Vec2, held: Vec2 = none) {
    return step(state, TICK, { held: heldList(held), pressed }, fixedRandom(0))
}

// A single held direction as MoveInput.held.
function heldList(held: Vec2): Vec2[] {
    return held.x === 0 && held.y === 0 ? [] : [held]
}

describe("movePlayer", () => {
    it("is blocked by walls", () => {
        const state = makeState(map, { x: 1, y: 1 })
        expect(movePlayer(state, vec2(0, 1))).toBe(false)
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.player.lastPos).toEqual(vec2(1, 1))
    })

    it("moves into empty cells and records where it came from", () => {
        const state = makeState(map, { x: 1, y: 1 })
        expect(movePlayer(state, vec2(0, -1))).toBe(true)
        expect(state.player.pos).toEqual(vec2(1, 0))
        expect(state.player.lastPos).toEqual(vec2(1, 1))
    })

    it("does not move on a zero step", () => {
        const state = makeState(map, { x: 1, y: 1 })
        expect(movePlayer(state, none)).toBe(false)
        expect(state.player.pos).toEqual(vec2(1, 1))
    })

    it("eats dots", () => {
        const state = makeState(map, { x: 1, y: 1 })
        movePlayer(state, vec2(1, 0))
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.cells[1][2]).toBe(Cell.none)
    })

    it("wraps around the edges", () => {
        const state = makeState(map, { x: 0, y: 1 })
        movePlayer(state, vec2(-1, 0))
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.cells[1][2]).toBe(Cell.none)

        const vertical = makeState(map, { x: 1, y: 0 })
        vertical.cells[2][1] = Cell.none
        movePlayer(vertical, vec2(0, -1))
        expect(vertical.player.pos).toEqual(vec2(1, 2))
    })
})

describe("checkEnd", () => {
    it("returns null while dots remain and no enemy touches the player", () => {
        const state = makeState(map, { x: 1, y: 0 }, [makeEnemy(0, 1)])
        expect(checkEnd(state)).toBeNull()
    })

    it("wins when all dots are eaten", () => {
        const state = makeState(map, { x: 0, y: 1 })
        movePlayer(state, vec2(1, 0)) // eats the dot at (1, 1)
        expect(checkEnd(state)).toBeNull()
        movePlayer(state, vec2(1, 0)) // eats the last dot at (2, 1)
        expect(checkEnd(state)).toBe("won")
    })

    it("loses when an enemy shares the player's cell", () => {
        const state = makeState(map, { x: 1, y: 1 }, [makeEnemy(1, 1)])
        expect(checkEnd(state)).toBe("dead")
    })
})

describe("step: speeds", () => {
    it("moves the player one cell per 1/speed seconds while a direction is held", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        const ticksPerCell = TICK_RATE / PLAYER_SPEED
        run(state, ticksPerCell - 1, east)
        expect(state.player.pos).toEqual(vec2(0, 1))
        run(state, 1, east)
        expect(state.player.pos).toEqual(vec2(1, 1))
        run(state, ticksPerCell * 2, east)
        expect(state.player.pos).toEqual(vec2(3, 1))
        expect(state.cells[1][3]).toBe(Cell.none)
    })

    it("moves each enemy at its own speed", () => {
        const slow = makeEnemy(3, 1, AiType.random, { x: 2, y: 1 })
        const fast = makeEnemy(
            5,
            1,
            AiType.random,
            { x: 4, y: 1 },
            CharacterId.enemy2
        )
        expect(slow.speed).toBe(ENEMY_SPEED)
        fast.speed = 3
        const state = makeState(corridor, { x: 0, y: 1 }, [slow, fast])
        // One second: 2 cells for the default speed, 3 for the faster one.
        run(state, TICK_RATE)
        expect(slow.pos).toEqual(vec2(5, 1))
        expect(fast.pos).toEqual(vec2(8, 1))
    })

    it("keeps leftover progress, so speeds that don't divide the tick rate average out", () => {
        // 7 cells/s is 8.57 ticks per cell; rounding up to 9 would give 6.67.
        // An empty wrap-around corridor, with a dot sealed off below so the
        // game never ends.
        const state = makeState(
            [
                [1, 1, 1, 1, 1],
                [0, 0, 0, 0, 0],
                [1, 1, 1, 1, 1],
                [1, 1, 2, 1, 1],
                [1, 1, 1, 1, 1],
            ],
            { x: 0, y: 1 }
        )
        state.player.speed = 7
        let moves = 0
        let last = state.player.pos
        for (let i = 0; i < TICK_RATE * 60; i++) {
            run(state, 1, east)
            if (state.player.pos !== last) moves++
            last = state.player.pos
        }
        expect(Math.abs(moves - 7 * 60)).toBeLessThanOrEqual(1)
    })

    it("doesn't bank progress while waiting to move", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        run(state, TICK_RATE) // ready long ago, nothing held
        run(state, 1, east)
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.player.moveProgress).toBe(0)
        // The next move still takes a whole 1/speed seconds.
        run(state, TICK_RATE / PLAYER_SPEED - 1, east)
        expect(state.player.pos).toEqual(vec2(1, 1))
        run(state, 1, east)
        expect(state.player.pos).toEqual(vec2(2, 1))
    })

    it("moves at most one cell per tick, however fast", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        state.player.speed = TICK_RATE * 10
        run(state, 3, east)
        expect(state.player.pos).toEqual(vec2(3, 1))
    })

    it("does not depend on the random source for the player", () => {
        const a = makeState(corridor, { x: 0, y: 1 })
        const b = makeState(corridor, { x: 0, y: 1 })
        run(a, 30, east, fixedRandom(0))
        run(b, 30, east, fixedRandom(0.99))
        expect(a.player.pos).toEqual(b.player.pos)
    })
})

// A corridor along row 1 with one side opening north at x = 2.
const junction = [
    [1, 1, 2, 1, 1, 1],
    [2, 2, 2, 2, 2, 2],
    [1, 1, 1, 1, 1, 1],
] as const

describe("step: tap buffer", () => {
    const ticksPerCell = TICK_RATE / PLAYER_SPEED

    it("uses a direction tapped mid-move at the next move opportunity", () => {
        const state = makeState(junction, { x: 1, y: 1 })
        run(state, ticksPerCell, east)
        expect(state.player.pos).toEqual(vec2(2, 1))
        // Partway to the next move, tap north while still holding east.
        run(state, 5, east)
        tap(state, north, east)
        run(state, ticksPerCell - 7, east)
        expect(state.player.pos).toEqual(vec2(2, 1))
        run(state, 1, east)
        expect(state.player.pos).toEqual(vec2(2, 0))
        expect(state.bufferedStep).toEqual(none)
    })

    it("uses a tap made mid-move with nothing held, once", () => {
        const state = makeState(junction, { x: 1, y: 1 })
        tap(state, east)
        expect(state.player.pos).toEqual(vec2(1, 1))
        run(state, ticksPerCell - 1)
        expect(state.player.pos).toEqual(vec2(2, 1))
        run(state, TICK_RATE)
        expect(state.player.pos).toEqual(vec2(2, 1))
    })

    it("falls back to the held direction when the buffered turn is blocked", () => {
        const state = makeState(junction, { x: 0, y: 1 })
        run(state, 1, east)
        tap(state, north, east) // north of (0, 1) is a wall
        run(state, ticksPerCell - 2, east)
        expect(state.player.pos).toEqual(vec2(1, 1))
    })

    it("clears the buffer after one move opportunity", () => {
        const state = makeState(junction, { x: 0, y: 1 })
        run(state, 1, east)
        tap(state, north, east)
        run(state, ticksPerCell - 2, east)
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.bufferedStep).toEqual(none)
        // The north turn at (2, 1) is open, but the tap is long gone.
        run(state, ticksPerCell * 2, east)
        expect(state.player.pos).toEqual(vec2(3, 1))
    })

    it("clears the buffer even when no move is possible", () => {
        const state = makeState(junction, { x: 1, y: 1 })
        run(state, ticksPerCell) // ready, nothing held
        tap(state, north) // a wall
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.bufferedStep).toEqual(none)
        expect(state.player.moveProgress).toBe(1)
    })
})

describe("step: player movement", () => {
    it("falls back to an older held direction when the newest is blocked", () => {
        // Hold east, then press south early (at (2, 1), a wall below) while
        // still holding east: the player keeps going east until the turn.
        const state = makeState(
            [
                [1, 1, 1, 1, 1, 1, 1],
                [1, 2, 2, 2, 2, 2, 1],
                [1, 1, 1, 1, 2, 1, 1],
                [1, 1, 1, 1, 2, 1, 1],
                [1, 1, 1, 1, 1, 1, 1],
            ],
            { x: 1, y: 1 }
        )
        const south = vec2(0, 1)
        const ticksPerCell = TICK_RATE / PLAYER_SPEED
        ready(state)
        run(state, 1, east)
        expect(state.player.pos).toEqual(vec2(2, 1))
        step(
            state,
            TICK,
            { held: [south, east], pressed: south },
            fixedRandom(0)
        )
        for (let i = 0; i < ticksPerCell * 3; i++) {
            step(
                state,
                TICK,
                { held: [south, east], pressed: none },
                fixedRandom(0)
            )
        }
        // East to (3, 1) and (4, 1), then south down the side passage.
        expect(state.player.pos).toEqual(vec2(4, 2))
    })

    it("stays put with no direction held, then moves on the first tick one is", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        run(state, TICK_RATE)
        expect(state.player.pos).toEqual(vec2(0, 1))
        run(state, 1, east)
        expect(state.player.pos).toEqual(vec2(1, 1))
    })

    it("stops at a wall and turns on the first tick a free direction is held", () => {
        const state = makeState(map, { x: 1, y: 1 })
        run(state, TICK_RATE, vec2(0, 1)) // south is a wall
        expect(state.player.pos).toEqual(vec2(1, 1))
        run(state, 1, north)
        expect(state.player.pos).toEqual(vec2(1, 0))
    })

    it("keeps its pace when the held direction changes mid-move", () => {
        const state = makeState(corridor, { x: 4, y: 1 })
        ready(state)
        run(state, 1, east)
        expect(state.player.pos).toEqual(vec2(5, 1))
        // Reversing straight away still waits for the next whole cell.
        run(state, TICK_RATE / PLAYER_SPEED - 1, west)
        expect(state.player.pos).toEqual(vec2(5, 1))
        run(state, 1, west)
        expect(state.player.pos).toEqual(vec2(4, 1))
    })

    it("wins on the tick the last dot is eaten", () => {
        const state = makeState(map, { x: 0, y: 1 })
        ready(state)
        expect(run(state, 1, east)).toBeNull()
        expect(run(state, TICK_RATE / PLAYER_SPEED, east)).toBe("won")
    })
})

describe("step: simultaneous moves", () => {
    // Each enemy's lastPos is set so it can only move one way: from (2, 1)
    // with lastPos (3, 1) it goes west; from (1, 1) with lastPos (0, 1) east.

    it("is a collision when the player and an enemy swap cells", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            makeEnemy(2, 1, AiType.random, { x: 3, y: 1 }),
        ])
        ready(state)
        expect(run(state, 1, east)).toBe("dead")
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(1, 1))
    })

    it("is a collision when the swapping enemy is not the first one", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            // Moves west to (4, 1), away from the player.
            makeEnemy(5, 1, AiType.random, { x: 6, y: 1 }),
            // Swaps with the player.
            makeEnemy(2, 1, AiType.random, { x: 3, y: 1 }, CharacterId.enemy2),
        ])
        ready(state)
        expect(run(state, 1, east)).toBe("dead")
        expect(state.enemies[0].pos).toEqual(vec2(4, 1))
        expect(state.enemies[1].pos).toEqual(vec2(1, 1))
        expect(state.player.pos).toEqual(vec2(2, 1))
    })

    it("is a collision when both step into the same cell", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            makeEnemy(3, 1, AiType.random, { x: 4, y: 1 }),
        ])
        ready(state)
        expect(run(state, 1, east)).toBe("dead")
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
    })

    it("is not a collision when an enemy steps into the cell the player leaves", () => {
        const state = makeState(corridor, { x: 2, y: 1 }, [
            makeEnemy(1, 1, AiType.random, { x: 0, y: 1 }),
        ])
        ready(state)
        expect(run(state, 1, east)).toBeNull()
        expect(state.player.pos).toEqual(vec2(3, 1))
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
    })

    it("is not a collision when the player steps into the cell an enemy leaves", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            makeEnemy(2, 1, AiType.random, { x: 1, y: 1 }),
        ])
        ready(state)
        expect(run(state, 1, east)).toBeNull()
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(3, 1))
    })

    it("is a collision when an enemy walks into a player who stays put", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            makeEnemy(2, 1, AiType.random, { x: 3, y: 1 }),
        ])
        ready(state)
        expect(run(state, 1)).toBe("dead")
    })

    it("is a collision when the player walks into an enemy that stays put", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            makeEnemy(2, 1, AiType.random, { x: 3, y: 1 }),
        ])
        ready(state)
        state.enemies[0].moveProgress = 0
        expect(run(state, 1, east)).toBe("dead")
    })
})

// Stepping stops once a step returns an outcome; flow.test.ts checks that
// nothing changes after that.
describe("step: the tick that ends the game", () => {
    it("moves every character in that tick", () => {
        const state = makeState(corridor, { x: 2, y: 1 }, [
            // Walks into the player.
            makeEnemy(1, 1, AiType.random, { x: 0, y: 1 }),
            makeEnemy(6, 1, AiType.random, { x: 7, y: 1 }, CharacterId.enemy2),
        ])
        ready(state)
        expect(run(state, 1)).toBe("dead")
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
        expect(state.enemies[1].pos).toEqual(vec2(5, 1))
    })
})

describe("step: enemies", () => {
    it("aim at where the player stood at the start of the tick", () => {
        // The chase enemy at the junction (2, 1) can go west or east. The
        // player starts west of it, at (0, 1), and in the same tick steps
        // west across the edge to (4, 1), east of it.
        const state = makeState(
            [
                [1, 1, 1, 1, 1],
                [2, 2, 2, 2, 2],
                [1, 1, 2, 1, 1],
            ],
            { x: 0, y: 1 },
            [makeEnemy(2, 1, AiType.chase, { x: 2, y: 2 })]
        )
        ready(state)
        run(state, 1, west)
        expect(state.player.pos).toEqual(vec2(4, 1))
        expect(state.enemies[0].pos).toEqual(vec2(1, 1))
    })

    it("stay ready when boxed in, keeping where they came from", () => {
        const state = makeState(
            [
                // A dot out of reach, so the game doesn't end as won.
                [1, 1, 1, 2],
                [0, 1, 0, 1],
                [1, 1, 1, 1],
            ],
            { x: 0, y: 1 },
            [makeEnemy(2, 1, AiType.random, { x: 2, y: 0 })]
        )
        run(state, TICK_RATE)
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].lastPos).toEqual(vec2(2, 0))
        expect(state.enemies[0].moveProgress).toBe(1)
    })
})

describe("step: new enemy types", () => {
    // A ring of dotted corridors around a solid wall block.
    const ring = [
        [1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 2, 2, 2, 2, 2, 2, 2, 1],
        [1, 2, 1, 1, 1, 1, 1, 2, 1],
        [1, 2, 2, 2, 2, 2, 2, 2, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1],
    ] as const

    it("an ambusher aims along the player's heading from the start of the tick", () => {
        // The player at (2, 1) came from (1, 1), so it is heading east and
        // the ambusher at (4, 3) aims at (6, 1), the short way east. In the
        // same tick the player turns back west; that move must not count.
        const state = makeState(ring, { x: 2, y: 1 }, [
            makeEnemy(4, 3, AiType.ambusher),
        ])
        state.player.lastPos = vec2(1, 1)
        ready(state)
        run(state, 1, west)
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.enemies[0].pos).toEqual(vec2(5, 3))
    })

    it("a patroller starts its route again after a respawn", () => {
        // Heading for its second waypoint, (1, 1), it walks into the player.
        const patroller = makePatroller(2, 1, [
            [5, 1],
            [1, 1],
        ])
        patroller.routeIndex = 1
        const state = makeState(corridor, { x: 1, y: 1 }, [patroller], {
            lives: 2,
        })
        ready(state)
        run(state, 1)
        expect(state.lives).toBe(1)
        expect(patroller.pos).toEqual(vec2(2, 1))
        expect(patroller.routeIndex).toBe(0)
    })

    it("a phantom catches the player from inside a wall", () => {
        const state = makeState(
            [
                [1, 1, 1, 1, 1],
                [1, 0, 1, 2, 1],
                [1, 1, 1, 1, 1],
            ],
            { x: 1, y: 1 },
            [makeEnemy(2, 1, AiType.phantom)]
        )
        ready(state)
        expect(run(state, 1)).toBe("dead")
        expect(state.enemies[0].pos).toEqual(vec2(1, 1))
    })
})

const OLD_PLAYER_START = vec2(4, 1)

describe("createGameState", () => {
    it("starts from the first level by default", () => {
        expect(createGameState()).toEqual(createGameState(levels[0]))
    })

    it("builds the old hard-coded map's state from its level", () => {
        const state = createGameState(OLD_LEVEL)
        expect(state.player.id).toBe(CharacterId.player)
        expect(state.player.pos).toEqual(OLD_PLAYER_START)
        expect(state.player.speed).toBe(PLAYER_SPEED)
        expect(state.enemies.map((e) => e.id)).toEqual([
            CharacterId.enemy1,
            CharacterId.enemy2,
        ])
        expect(state.enemies.map((e) => e.pos)).toEqual([
            vec2(1, 4),
            vec2(7, 4),
        ])
        expect(state.enemies.map((e) => e.ai)).toEqual([
            AiType.random,
            AiType.chase,
        ])
        for (const enemy of state.enemies) {
            expect(enemy.lastPos).toEqual(enemy.pos)
            expect(enemy.speed).toBe(ENEMY_SPEED)
        }
    })

    it("puts dots everywhere except walls and the player start", () => {
        const { cells } = createGameState(OLD_LEVEL)
        for (let y = 0; y < OLD_MAP.length; y++) {
            for (let x = 0; x < OLD_MAP[y].length; x++) {
                if (OLD_MAP[y][x] === Cell.wall) {
                    expect(cells[y][x]).toBe(Cell.wall)
                } else if (
                    x === OLD_PLAYER_START.x &&
                    y === OLD_PLAYER_START.y
                ) {
                    expect(cells[y][x]).toBe(Cell.none)
                } else {
                    expect(cells[y][x]).toBe(Cell.dot)
                }
            }
        }
    })

    it("builds the state from a given level", () => {
        const level = parseLevel({
            name: "tiny",
            map: ["#####", "#P.E#", "#####"],
            enemies: [{ ai: "chase" }],
        })
        const state = createGameState(level)
        expect(state.cells).toEqual([
            [1, 1, 1, 1, 1],
            [1, 0, 2, 2, 1],
            [1, 1, 1, 1, 1],
        ])
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.enemies).toHaveLength(1)
        expect(state.enemies[0].id).toBe(CharacterId.enemy1)
        expect(state.enemies[0].pos).toEqual(vec2(3, 1))
        expect(state.enemies[0].ai).toBe(AiType.chase)
    })

    it("starts with no score and full lives", () => {
        const state = createGameState(OLD_LEVEL)
        expect(state.score).toBe(0)
        expect(state.lives).toBe(START_LIVES)
    })

    it("has the player ready to move at once and the enemies wait", () => {
        const state = createGameState(OLD_LEVEL)
        expect(state.player.moveProgress).toBe(1)
        expect(state.enemies.map((e) => e.moveProgress)).toEqual([0, 0])
        const start = state.player.pos
        const enemies = state.enemies.map((e) => e.pos)
        // The old level's player starts with open cells to the west and east.
        step(state, TICK, { held: [east], pressed: east }, fixedRandom(0))
        expect(state.player.pos).toEqual(vec2(start.x + 1, start.y))
        expect(state.enemies.map((e) => e.pos)).toEqual(enemies)
    })

    it("gives the characters the level's speeds", () => {
        const level = parseLevel({
            name: "fast",
            map: ["#######", "#P.E.E#", "#######"],
            playerSpeed: 6,
            enemies: [{ ai: "chase", speed: 3 }, { ai: "random" }],
        })
        const state = createGameState(level)
        expect(state.player.speed).toBe(6)
        expect(state.enemies.map((e) => e.speed)).toEqual([3, ENEMY_SPEED])
    })

    it("gives phantoms their slower default speed unless the level sets one", () => {
        const level = parseLevel({
            name: "phantoms",
            map: ["######", "#P.EE#", "######"],
            enemies: [{ ai: "phantom" }, { ai: "phantom", speed: 3 }],
        })
        const state = createGameState(level)
        expect(state.enemies.map((e) => e.speed)).toEqual([PHANTOM_SPEED, 3])
    })

    it("gives four enemies their own ids and a patroller its route", () => {
        const level = parseLevel({
            name: "four",
            map: ["######", "#PEE.#", "#.EE.#", "######"],
            enemies: [
                { ai: "random" },
                { ai: "chase" },
                { ai: "ambusher" },
                {
                    ai: "patroller",
                    route: [
                        [1, 2],
                        [4, 1],
                    ],
                },
            ],
        })
        const state = createGameState(level)
        expect(state.enemies.map((e) => e.id)).toEqual([
            CharacterId.enemy1,
            CharacterId.enemy2,
            CharacterId.enemy3,
            CharacterId.enemy4,
        ])
        expect(state.enemies[3].route).toEqual([vec2(1, 2), vec2(4, 1)])
        expect(state.enemies[3].route).not.toBe(level.enemies[3].route)
        expect(state.enemies[3].routeIndex).toBe(0)
        expect(state.enemies[0]).not.toHaveProperty("route")
    })

    it("uses the default speeds when the level leaves them out", () => {
        const level = parseLevel({
            name: "default",
            map: ["#####", "#P.E#", "#####"],
            enemies: [{ ai: "chase" }],
        })
        const state = createGameState(level)
        expect(state.player.speed).toBe(PLAYER_SPEED)
        expect(state.enemies[0].speed).toBe(ENEMY_SPEED)
    })

    it("returns a fresh state each time", () => {
        const a = createGameState(OLD_LEVEL)
        a.cells[0][0] = Cell.none
        a.cells[1][1] = Cell.none
        a.player.pos.x = 99
        a.enemies[0].pos.x = 99
        const b = createGameState(OLD_LEVEL)
        expect(b.cells[0][0]).toBe(Cell.wall)
        expect(b.cells[1][1]).toBe(Cell.dot)
        // Literals, so a shared (aliased) level spawn would be caught.
        expect(b.player.pos).toEqual(vec2(4, 1))
        expect(b.enemies[0].pos).toEqual(vec2(1, 4))
    })
})

describe("score", () => {
    it("scores DOT_POINTS per dot eaten", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        expect(state.score).toBe(0)
        movePlayer(state, east)
        expect(state.score).toBe(DOT_POINTS)
        movePlayer(state, east)
        expect(state.score).toBe(2 * DOT_POINTS)
    })

    it("scores nothing for empty cells or walls", () => {
        const state = makeState(map, { x: 1, y: 1 })
        expect(movePlayer(state, vec2(0, 1))).toBe(false) // wall
        expect(movePlayer(state, north)).toBe(true) // empty
        expect(movePlayer(state, vec2(0, 1))).toBe(true) // the empty start
        expect(state.score).toBe(0)
    })

    it("scores the dots eaten while stepping", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        ready(state)
        run(state, 2 * (TICK_RATE / PLAYER_SPEED) + 1, east)
        expect(state.player.pos).toEqual(vec2(3, 1))
        expect(state.score).toBe(3 * DOT_POINTS)
    })
})

describe("step: lives", () => {
    // The player at (1, 1) walks east while the enemy at (2, 1) walks west:
    // they swap cells, and the player eats the dot at (2, 1).
    function swap(lives: number) {
        const state = makeState(
            corridor,
            { x: 1, y: 1 },
            [makeEnemy(2, 1, AiType.random, { x: 3, y: 1 })],
            { lives }
        )
        ready(state)
        return state
    }

    it("costs a life on a swap and respawns everyone, keeping dots and score", () => {
        const state = swap(3)
        expect(run(state, 1, east)).toBeNull()
        expect(state.lives).toBe(2)
        expect(state.cells[1][2]).toBe(Cell.none)
        expect(state.score).toBe(DOT_POINTS)
        // Back at the spawns, as at the start of a game.
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.player.lastPos).toEqual(vec2(1, 1))
        expect(state.player.moveProgress).toBe(1)
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].lastPos).toEqual(vec2(2, 1))
        expect(state.enemies[0].moveProgress).toBe(0)
    })

    it("costs a life when an enemy walks into a player who stays put", () => {
        const state = swap(2)
        expect(run(state, 1)).toBeNull()
        expect(state.lives).toBe(1)
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
    })

    it("clears a tap buffered on the tick a life is lost", () => {
        const state = swap(2)
        // Mid-move: the tap is buffered, but the player can't move yet.
        state.player.moveProgress = 0
        expect(tap(state, west)).toBeNull()
        expect(state.lives).toBe(1)
        expect(state.bufferedStep).toEqual(none)
        // The respawned player is ready but doesn't take the old tap.
        run(state, 1)
        expect(state.player.pos).toEqual(vec2(1, 1))
    })

    it("respawns at the level's spawns", () => {
        const level = parseLevel({
            name: "spawns",
            map: ["#######", "#P...E#", "#######"],
            enemies: [{ ai: "random", speed: PLAYER_SPEED }],
        })
        const state = createGameState(level)
        state.enemies[0].moveProgress = 1
        // The two close in on each other and meet.
        let outcome: Outcome | null = null
        for (let i = 0; i < TICK_RATE && state.lives === START_LIVES; i++) {
            outcome = run(state, 1, east)
        }
        expect(outcome).toBeNull()
        expect(state.lives).toBe(START_LIVES - 1)
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.enemies[0].pos).toEqual(vec2(5, 1))
        // The player ate (2, 1) and (3, 1) on the way; they stay eaten.
        expect(state.score).toBe(2 * DOT_POINTS)
        expect(state.cells[1]).toEqual([1, 0, 0, 0, 2, 2, 1])
    })

    it("plays on after a respawn", () => {
        const state = swap(2)
        run(state, 1, east)
        expect(state.lives).toBe(1)
        // The player is ready at once; the enemy waits out its grace period.
        expect(run(state, 1, west)).toBeNull()
        expect(state.player.pos).toEqual(vec2(0, 1))
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
    })

    it("ends the game on a collision on the last life", () => {
        const state = swap(1)
        expect(run(state, 1, east)).toBe("dead")
        expect(state.lives).toBe(0)
        // No respawn: the final positions stay as they were.
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(1, 1))
    })

    it("ends the game after START_LIVES collisions", () => {
        const state = swap(START_LIVES)
        for (let i = 1; i < START_LIVES; i++) {
            expect(run(state, 1, east)).toBeNull()
            expect(state.lives).toBe(START_LIVES - i)
            ready(state)
        }
        expect(run(state, 1, east)).toBe("dead")
        expect(state.lives).toBe(0)
    })
})

// The rule when the player eats the last dot on the same tick they are
// caught: see checkEnd.
describe("step: caught on the tick the last dot is eaten", () => {
    // Only one dot, at (2, 1). The player at (1, 1) eats it walking east
    // while the enemy at (2, 1) walks west into them: a swap collision.
    const lastDot = [
        [1, 1, 1, 1, 1, 1, 1],
        [0, 0, 2, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1, 1],
    ] as const

    function caughtOnLastDot(lives: number) {
        const state = makeState(
            lastDot,
            { x: 1, y: 1 },
            [makeEnemy(2, 1, AiType.random, { x: 3, y: 1 })],
            { lives }
        )
        ready(state)
        return state
    }

    it("is a win that costs no life, with lives left", () => {
        const state = caughtOnLastDot(2)
        expect(run(state, 1, east)).toBe("won")
        expect(state.lives).toBe(2)
        expect(state.score).toBe(DOT_POINTS)
        expect(state.player.pos).toEqual(vec2(2, 1))
    })

    it("is a win that costs no life, on the last life too", () => {
        const state = caughtOnLastDot(1)
        expect(run(state, 1, east)).toBe("won")
        expect(state.lives).toBe(1)
    })

    it("is a lost life when other dots remain", () => {
        const state = caughtOnLastDot(2)
        state.cells[1][5] = Cell.dot
        expect(run(state, 1, east)).toBeNull()
        expect(state.lives).toBe(1)
        expect(state.player.pos).toEqual(vec2(1, 1))
    })
})

describe("eatenAt", () => {
    it("starts as null", () => {
        expect(createGameState(OLD_LEVEL).eatenAt).toBeNull()
    })

    it("records the dot eaten on the player's latest move", () => {
        const state = makeState(corridor, { x: 1, y: 1 })
        movePlayer(state, east)
        expect(state.eatenAt).toEqual(vec2(2, 1))
        movePlayer(state, east)
        expect(state.eatenAt).toEqual(vec2(3, 1))
    })

    it("is cleared by a move that eats nothing", () => {
        const state = makeState(corridor, { x: 1, y: 1 })
        movePlayer(state, east)
        movePlayer(state, west)
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.eatenAt).toBeNull()
    })

    it("is kept when the player doesn't move", () => {
        const state = makeState(corridor, { x: 1, y: 1 })
        movePlayer(state, east)
        expect(movePlayer(state, north)).toBe(false)
        expect(movePlayer(state, none)).toBe(false)
        expect(state.eatenAt).toEqual(vec2(2, 1))
    })

    it("is set by stepping onto a dot", () => {
        const state = makeState(corridor, { x: 1, y: 1 })
        ready(state)
        run(state, 1, east)
        expect(state.eatenAt).toEqual(vec2(2, 1))
    })

    it("is cleared when a life is lost and everyone respawns", () => {
        // The player eats (2, 1) while swapping cells with the enemy.
        const state = makeState(
            corridor,
            { x: 1, y: 1 },
            [makeEnemy(2, 1, AiType.random, { x: 3, y: 1 })],
            { lives: 2 }
        )
        ready(state)
        expect(run(state, 1, east)).toBeNull()
        expect(state.lives).toBe(1)
        expect(state.score).toBe(DOT_POINTS)
        expect(state.eatenAt).toBeNull()
    })
})

describe("settle", () => {
    // The player has just eaten (2, 1); the enemy is mid-glide too.
    function ended() {
        const state = makeState(
            corridor,
            { x: 1, y: 1 },
            [makeEnemy(6, 1, AiType.random, { x: 7, y: 1 })],
            { lives: 2 }
        )
        movePlayer(state, east)
        state.player.moveProgress = 0
        state.enemies[0].moveProgress = 0.5
        return state
    }

    it("raises everyone's progress by speed * dt", () => {
        const state = ended()
        expect(settle(state, 0.1)).toBe(false)
        expect(state.player.moveProgress).toBeCloseTo(0.1 * PLAYER_SPEED)
        expect(state.enemies[0].moveProgress).toBeCloseTo(
            0.5 + 0.1 * ENEMY_SPEED
        )
    })

    it("caps progress at 1 and says when the player's glide is done", () => {
        const state = ended()
        let ticks = 1
        while (!settle(state, TICK)) ticks++
        // One cell's glide at the player's speed.
        expect(ticks).toBe(TICK_RATE / PLAYER_SPEED)
        expect(state.player.moveProgress).toBe(1)
        for (let i = 0; i < TICK_RATE; i++) settle(state, TICK)
        expect(state.player.moveProgress).toBe(1)
        expect(state.enemies[0].moveProgress).toBe(1)
    })

    it("leaves progress already past 1 alone", () => {
        const state = ended()
        state.enemies[0].moveProgress = 1.5
        settle(state, TICK)
        expect(state.enemies[0].moveProgress).toBe(1.5)
    })

    it("moves nobody and changes nothing else", () => {
        const state = ended()
        const before = structuredClone(state)
        for (let i = 0; i < TICK_RATE; i++) settle(state, TICK)
        expect(state).toEqual({
            ...before,
            player: { ...before.player, moveProgress: 1 },
            enemies: [{ ...before.enemies[0], moveProgress: 1 }],
        })
        expect(state.score).toBe(DOT_POINTS)
        expect(state.eatenAt).toEqual(vec2(2, 1))
    })
})
