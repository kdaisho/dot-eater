import { describe, expect, it } from "vite-plus/test"
import {
    AiType,
    Cell,
    CharacterId,
    ENEMY_SPEED,
    PLAYER_SPEED,
    TICK_RATE,
} from "./constants"
import type { Random } from "./ai"
import {
    checkEnd,
    createGameState,
    movePlayer,
    step,
    type GameState,
    type Outcome,
} from "./game"
import { parseLevel } from "./level"
import { fixedRandom, makeEnemy, makeState, OLD_MAP } from "./test/helpers"
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

    it("ignores moves while locked", () => {
        const state = makeState(map, { x: 1, y: 1 })
        state.locked = true
        expect(movePlayer(state, vec2(1, 0))).toBe(false)
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.cells[1][2]).toBe(Cell.dot)
    })
})

describe("checkEnd", () => {
    it("returns null while dots remain and no enemy touches the player", () => {
        const state = makeState(map, { x: 1, y: 0 }, [makeEnemy(0, 1)])
        expect(checkEnd(state)).toBeNull()
        expect(state.locked).toBe(false)
    })

    it("wins when all dots are eaten", () => {
        const state = makeState(map, { x: 0, y: 1 })
        movePlayer(state, vec2(1, 0)) // eats the dot at (1, 1)
        expect(checkEnd(state)).toBeNull()
        movePlayer(state, vec2(1, 0)) // eats the last dot at (2, 1)
        expect(checkEnd(state)).toBe("won")
        expect(state.locked).toBe(true)
    })

    it("loses when an enemy shares the player's cell", () => {
        const state = makeState(map, { x: 1, y: 1 }, [makeEnemy(1, 1)])
        expect(checkEnd(state)).toBe("dead")
        expect(state.locked).toBe(true)
    })

    it("returns null once locked", () => {
        const state = makeState(map, { x: 1, y: 1 }, [makeEnemy(1, 1)])
        state.locked = true
        expect(checkEnd(state)).toBeNull()
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

describe("step: once the game has ended", () => {
    it("moves every character in the tick that ends the game, then nothing", () => {
        const state = makeState(corridor, { x: 2, y: 1 }, [
            // Walks into the player.
            makeEnemy(1, 1, AiType.random, { x: 0, y: 1 }),
            makeEnemy(6, 1, AiType.random, { x: 7, y: 1 }, CharacterId.enemy2),
        ])
        ready(state)
        expect(run(state, 1)).toBe("dead")
        expect(state.enemies[1].pos).toEqual(vec2(5, 1))
        const cells = state.cells.map((row) => [...row])

        expect(run(state, TICK_RATE * 5, east)).toBeNull()
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
        expect(state.enemies[1].pos).toEqual(vec2(5, 1))
        expect(state.cells).toEqual(cells)
    })

    it("changes nothing while locked", () => {
        const state = makeState(corridor, { x: 0, y: 1 }, [
            makeEnemy(4, 1, AiType.random, { x: 5, y: 1 }),
        ])
        state.locked = true
        expect(run(state, TICK_RATE * 5, east)).toBeNull()
        expect(state.player.pos).toEqual(vec2(0, 1))
        expect(state.player.moveProgress).toBe(0)
        expect(state.enemies[0].pos).toEqual(vec2(4, 1))
        expect(state.enemies[0].moveProgress).toBe(0)
        expect(state.cells[1][1]).toBe(Cell.dot)
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

const OLD_PLAYER_START = vec2(4, 1)

describe("createGameState", () => {
    it("starts from the first level like the old hard-coded map", () => {
        const state = createGameState()
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
        expect(state.locked).toBe(false)
    })

    it("puts dots everywhere except walls and the player start", () => {
        const { cells } = createGameState()
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
        const a = createGameState()
        a.cells[0][0] = Cell.none
        a.cells[1][1] = Cell.none
        a.player.pos.x = 99
        a.enemies[0].pos.x = 99
        a.locked = true
        const b = createGameState()
        expect(b.cells[0][0]).toBe(Cell.wall)
        expect(b.cells[1][1]).toBe(Cell.dot)
        // Literals, so a shared (aliased) level spawn would be caught.
        expect(b.player.pos).toEqual(vec2(4, 1))
        expect(b.enemies[0].pos).toEqual(vec2(1, 4))
        expect(b.locked).toBe(false)
    })
})
