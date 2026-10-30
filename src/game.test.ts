import { describe, expect, it } from "vite-plus/test"
import {
    AiType,
    CATCH_DISTANCE,
    Cell,
    CharacterId,
    DOT_POINTS,
    ENEMY_DAMAGE,
    ENEMY_IDS,
    ENEMY_SPEED,
    MAX_HEALTH,
    PHANTOM_SPEED,
    PLAYER_SPEED,
    TICK_RATE,
} from "./constants"
import type { Random } from "./ai"
import {
    checkEnd,
    createGameState,
    HURT_INVULNERABLE_TICKS,
    movePlayer,
    settle,
    step,
    type GameState,
    type Outcome,
} from "./game"
import { parseFlat } from "./test/helpers"
import { levels } from "./levels"
import {
    cloneState,
    drawn,
    fixedRandom,
    makeEnemy,
    makePatroller,
    makeState,
    OLD_LEVEL,
    OLD_MAP,
    textMap,
    ticksUntilCaught,
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
    state.players[0].character.moveProgress = 1
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

// How far apart two drawn positions are, in cells (no wrapping).
function gap(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

// Ticks for a head-on swap in the corridor to be caught at the default
// speeds: the move tick leaves the sprites a cell apart, and then they close
// (PLAYER_SPEED + ENEMY_SPEED) / TICK_RATE = 0.1 cells a tick until they are
// CATCH_DISTANCE (0.6) apart, 4 ticks later.
const SWAP_TICKS = 5
// Ticks for an enemy stepping into a still player's cell to be caught: the
// move tick, then 0.4 cells at ENEMY_SPEED / TICK_RATE (1/30) a tick.
const STEP_IN_TICKS = 13

describe("movePlayer", () => {
    it("is blocked by walls", () => {
        const state = makeState(map, { x: 1, y: 1 })
        expect(movePlayer(state, vec2(0, 1))).toBe(false)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        expect(state.players[0].character.lastPos).toEqual(vec2(1, 1))
    })

    it("moves into empty cells and records where it came from", () => {
        const state = makeState(map, { x: 1, y: 1 })
        expect(movePlayer(state, vec2(0, -1))).toBe(true)
        expect(state.players[0].character.pos).toEqual(vec2(1, 0))
        expect(state.players[0].character.lastPos).toEqual(vec2(1, 1))
    })

    it("does not move on a zero step", () => {
        const state = makeState(map, { x: 1, y: 1 })
        expect(movePlayer(state, none)).toBe(false)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
    })

    it("eats dots", () => {
        const state = makeState(map, { x: 1, y: 1 })
        movePlayer(state, vec2(1, 0))
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(state.cells[1][2]).toBe(Cell.none)
    })

    it("wraps around the edges", () => {
        const state = makeState(map, { x: 0, y: 1 })
        movePlayer(state, vec2(-1, 0))
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(state.cells[1][2]).toBe(Cell.none)

        const vertical = makeState(map, { x: 1, y: 0 })
        vertical.cells[2][1] = Cell.none
        movePlayer(vertical, vec2(0, -1))
        expect(vertical.players[0].character.pos).toEqual(vec2(1, 2))
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

    it("loses when an enemy is drawn within CATCH_DISTANCE of the player", () => {
        // Half way through its move from (2, 1) to (1, 1): drawn at 1.5.
        const enemy = makeEnemy(1, 1, AiType.random, { x: 2, y: 1 })
        enemy.moveProgress = 0.5
        const state = makeState(map, { x: 1, y: 1 }, [enemy])
        expect(checkEnd(state)).toBe("dead")
    })

    it("goes on while an enemy in the player's cell is drawn further away", () => {
        // It has just moved into the player's cell and is still drawn on
        // (2, 1), 0.7 of a cell away.
        const enemy = makeEnemy(1, 1, AiType.random, { x: 2, y: 1 })
        enemy.moveProgress = 0.3
        const state = makeState(map, { x: 1, y: 1 }, [enemy])
        expect(
            gap(drawn(state, enemy), state.players[0].character.pos)
        ).toBeGreaterThan(CATCH_DISTANCE)
        expect(checkEnd(state)).toBeNull()
    })
})

describe("step: speeds", () => {
    it("moves the player one cell per 1/speed seconds while a direction is held", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        const ticksPerCell = TICK_RATE / PLAYER_SPEED
        run(state, ticksPerCell - 1, east)
        expect(state.players[0].character.pos).toEqual(vec2(0, 1))
        run(state, 1, east)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        run(state, ticksPerCell * 2, east)
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        expect(state.cells[1][3]).toBe(Cell.none)
    })

    it("moves each enemy at its own speed", () => {
        const slow = makeEnemy(3, 1, AiType.random, { x: 2, y: 1 })
        const fast = makeEnemy(
            5,
            1,
            AiType.random,
            { x: 4, y: 1 },
            ENEMY_IDS[1]
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
        state.players[0].character.speed = 7
        let moves = 0
        let last = state.players[0].character.pos
        for (let i = 0; i < TICK_RATE * 60; i++) {
            run(state, 1, east)
            if (state.players[0].character.pos !== last) moves++
            last = state.players[0].character.pos
        }
        expect(Math.abs(moves - 7 * 60)).toBeLessThanOrEqual(1)
    })

    it("doesn't bank progress while waiting to move", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        run(state, TICK_RATE) // ready long ago, nothing held
        run(state, 1, east)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        expect(state.players[0].character.moveProgress).toBe(0)
        // The next move still takes a whole 1/speed seconds.
        run(state, TICK_RATE / PLAYER_SPEED - 1, east)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        run(state, 1, east)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
    })

    it("moves at most one cell per tick, however fast", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        state.players[0].character.speed = TICK_RATE * 10
        run(state, 3, east)
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
    })

    it("does not depend on the random source for the player", () => {
        const a = makeState(corridor, { x: 0, y: 1 })
        const b = makeState(corridor, { x: 0, y: 1 })
        run(a, 30, east, fixedRandom(0))
        run(b, 30, east, fixedRandom(0.99))
        expect(a.players[0].character.pos).toEqual(b.players[0].character.pos)
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
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        // Partway to the next move, tap north while still holding east.
        run(state, 5, east)
        tap(state, north, east)
        run(state, ticksPerCell - 7, east)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        run(state, 1, east)
        expect(state.players[0].character.pos).toEqual(vec2(2, 0))
        expect(state.players[0].bufferedStep).toEqual(none)
    })

    it("uses a tap made mid-move with nothing held, once", () => {
        const state = makeState(junction, { x: 1, y: 1 })
        tap(state, east)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        run(state, ticksPerCell - 1)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        run(state, TICK_RATE)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
    })

    it("falls back to the held direction when the buffered turn is blocked", () => {
        const state = makeState(junction, { x: 0, y: 1 })
        run(state, 1, east)
        tap(state, north, east) // north of (0, 1) is a wall
        run(state, ticksPerCell - 2, east)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
    })

    it("clears the buffer after one move opportunity", () => {
        const state = makeState(junction, { x: 0, y: 1 })
        run(state, 1, east)
        tap(state, north, east)
        run(state, ticksPerCell - 2, east)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        expect(state.players[0].bufferedStep).toEqual(none)
        // The north turn at (2, 1) is open, but the tap is long gone.
        run(state, ticksPerCell * 2, east)
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
    })

    it("clears the buffer even when no move is possible", () => {
        const state = makeState(junction, { x: 1, y: 1 })
        run(state, ticksPerCell) // ready, nothing held
        tap(state, north) // a wall
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        expect(state.players[0].bufferedStep).toEqual(none)
        expect(state.players[0].character.moveProgress).toBe(1)
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
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
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
        expect(state.players[0].character.pos).toEqual(vec2(4, 2))
    })

    it("stays put with no direction held, then moves on the first tick one is", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        run(state, TICK_RATE)
        expect(state.players[0].character.pos).toEqual(vec2(0, 1))
        run(state, 1, east)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
    })

    it("stops at a wall and turns on the first tick a free direction is held", () => {
        const state = makeState(map, { x: 1, y: 1 })
        run(state, TICK_RATE, vec2(0, 1)) // south is a wall
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        run(state, 1, north)
        expect(state.players[0].character.pos).toEqual(vec2(1, 0))
    })

    it("keeps its pace when the held direction changes mid-move", () => {
        const state = makeState(corridor, { x: 4, y: 1 })
        ready(state)
        run(state, 1, east)
        expect(state.players[0].character.pos).toEqual(vec2(5, 1))
        // Reversing straight away still waits for the next whole cell.
        run(state, TICK_RATE / PLAYER_SPEED - 1, west)
        expect(state.players[0].character.pos).toEqual(vec2(5, 1))
        run(state, 1, west)
        expect(state.players[0].character.pos).toEqual(vec2(4, 1))
    })

    it("wins on the tick the last dot is eaten", () => {
        const state = makeState(map, { x: 0, y: 1 })
        ready(state)
        expect(run(state, 1, east)).toBeNull()
        expect(run(state, TICK_RATE / PLAYER_SPEED, east)).toBe("won")
    })
})

// Collisions are on drawn positions (see collides in game.ts): a catch is
// when the sprites come within CATCH_DISTANCE, not when a move into the same
// cell starts.
describe("step: simultaneous moves", () => {
    // Each enemy's lastPos is set so it can only move one way: from (2, 1)
    // with lastPos (3, 1) it goes west; from (1, 1) with lastPos (0, 1) east.

    it("catches a player and an enemy swapping cells where they meet", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            makeEnemy(2, 1, AiType.random, { x: 3, y: 1 }),
        ])
        ready(state)
        // The swap happens at once, but the sprites are still a cell apart.
        expect(run(state, 1, east)).toBeNull()
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(1, 1))
        expect(run(state, SWAP_TICKS - 2, east)).toBeNull()
        expect(run(state, 1, east)).toBe("dead")
        // Caught mid-way, with both sprites between the two cells.
        const player = drawn(state, state.players[0].character)
        const enemy = drawn(state, state.enemies[0])
        expect(player.x).toBeGreaterThan(1)
        expect(enemy.x).toBeLessThan(2)
        expect(gap(player, enemy)).toBeCloseTo(CATCH_DISTANCE)
    })

    it("catches a swap with an enemy that is not the first one", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            // Moves west to (4, 1), away from the player.
            makeEnemy(5, 1, AiType.random, { x: 6, y: 1 }),
            // Swaps with the player.
            makeEnemy(2, 1, AiType.random, { x: 3, y: 1 }, ENEMY_IDS[1]),
        ])
        ready(state)
        expect(ticksUntilCaught(state, east)).toBe(SWAP_TICKS)
        expect(state.enemies[0].pos).toEqual(vec2(4, 1))
        expect(state.enemies[1].pos).toEqual(vec2(1, 1))
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
    })

    it("catches both stepping into the same cell once the sprites meet", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            makeEnemy(3, 1, AiType.random, { x: 4, y: 1 }),
        ])
        ready(state)
        // Two cells apart after the move tick, closing 0.1 cells a tick.
        expect(ticksUntilCaught(state, east)).toBe(15)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
    })

    it("is not a collision when an enemy steps into the cell the player leaves", () => {
        const state = makeState(corridor, { x: 2, y: 1 }, [
            makeEnemy(1, 1, AiType.random, { x: 0, y: 1 }),
        ])
        ready(state)
        expect(run(state, 1, east)).toBeNull()
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
        // The faster player keeps its lead.
        expect(run(state, TICK_RATE / 2, east)).toBeNull()
    })

    it("catches a player stepping into the cell an enemy leaves only on catching up", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            makeEnemy(2, 1, AiType.random, { x: 1, y: 1 }),
        ])
        ready(state)
        expect(run(state, 1, east)).toBeNull()
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(3, 1))
        // The player gains (PLAYER_SPEED - ENEMY_SPEED) / TICK_RATE = 1/30 of
        // a cell a tick on the enemy ahead and runs into it 0.4 cells later.
        expect(ticksUntilCaught(state, east)).toBe(12)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
    })

    // Regression: collisions were on logical cells, so this was caught on the
    // first tick with the enemy still drawn a cell away.
    it("catches an enemy walking into a player who stays put once the sprites touch", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            makeEnemy(2, 1, AiType.random, { x: 3, y: 1 }),
        ])
        ready(state)
        expect(run(state, 1)).toBeNull()
        expect(state.enemies[0].pos).toEqual(vec2(1, 1))
        expect(drawn(state, state.enemies[0])).toEqual(vec2(2, 1))
        expect(run(state, STEP_IN_TICKS - 2)).toBeNull()
        expect(run(state, 1)).toBe("dead")
        expect(
            gap(drawn(state, state.enemies[0]), state.players[0].character.pos)
        ).toBeCloseTo(CATCH_DISTANCE)
    })

    it("catches the player walking into an enemy that stays put once the sprites touch", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [makeEnemy(2, 1)])
        state.players[0].character.moveProgress = 1
        // The enemy waits out its grace period (moveProgress 0) on (2, 1).
        expect(run(state, 1, east)).toBeNull()
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        // 0.4 cells at PLAYER_SPEED / TICK_RATE (1/15) a tick.
        expect(ticksUntilCaught(state, east)).toBe(6)
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
    })
})

describe("step: collisions on drawn positions", () => {
    it("lets a player escape an enemy that had started into their cell", () => {
        // The enemy steps from (4, 1) into the player's cell; the player
        // only starts away 4 ticks later, before the sprites touch.
        const state = makeState(corridor, { x: 3, y: 1 }, [
            makeEnemy(4, 1, AiType.random, { x: 5, y: 1 }),
        ])
        ready(state)
        expect(run(state, 4)).toBeNull()
        expect(state.enemies[0].pos).toEqual(vec2(3, 1))
        expect(run(state, TICK_RATE / 2, west)).toBeNull()
        expect(state.players[0].health).toBe(1)
    })

    it("is a near miss when an enemy turns back before it gets close", () => {
        // A patroller walks east to (3, 1), right next to the player on
        // (4, 1), then turns back for (1, 1): never within CATCH_DISTANCE.
        const patroller = makePatroller(1, 1, [
            [3, 1],
            [1, 1],
        ])
        const state = makeState(corridor, { x: 4, y: 1 }, [patroller])
        expect(run(state, 100)).toBeNull()
        expect(patroller.routeIndex).toBe(1)
        expect(patroller.pos.x).toBeLessThan(3)
    })

    it("catches across a wrap tunnel", () => {
        // The corridor's ends are open: the enemy on (8, 1) steps east
        // through the tunnel into the player's cell (0, 1).
        const state = makeState(corridor, { x: 0, y: 1 }, [
            makeEnemy(8, 1, AiType.random, { x: 7, y: 1 }),
        ])
        ready(state)
        expect(run(state, 1)).toBeNull()
        expect(state.enemies[0].pos).toEqual(vec2(0, 1))
        // Drawn a cell off the left edge, i.e. on (8, 1) again.
        expect(drawn(state, state.enemies[0])).toEqual(vec2(-1, 1))
        expect(run(state, STEP_IN_TICKS - 2)).toBeNull()
        expect(run(state, 1)).toBe("dead")
        // Still drawn over the edge from the player when caught.
        expect(drawn(state, state.enemies[0]).x).toBeCloseTo(-CATCH_DISTANCE)
    })

    it("catches across a wrap tunnel when the player is the one crossing", () => {
        const state = makeState(corridor, { x: 0, y: 1 }, [makeEnemy(8, 1)])
        state.players[0].character.moveProgress = 1
        // The player steps west through the tunnel into the enemy's cell.
        expect(ticksUntilCaught(state, west)).toBe(7)
        expect(state.players[0].character.pos).toEqual(vec2(8, 1))
    })

    it("catches fast characters that pass through each other between ticks", () => {
        // Both move a cell every tick, head-on. At every tick boundary their
        // sprites are a whole cell apart (2 and 5, 3 and 4, then 4 and 3):
        // they cross within the third tick.
        const state = makeState(corridor, { x: 2, y: 1 }, [
            makeEnemy(5, 1, AiType.random, { x: 6, y: 1 }),
        ])
        state.players[0].character.speed = TICK_RATE
        state.enemies[0].speed = TICK_RATE
        ready(state)
        expect(run(state, 2, east)).toBeNull()
        expect(drawn(state, state.players[0].character)).toEqual(vec2(3, 1))
        expect(drawn(state, state.enemies[0])).toEqual(vec2(4, 1))
        expect(run(state, 1, east)).toBe("dead")
        expect(drawn(state, state.players[0].character)).toEqual(vec2(4, 1))
        expect(drawn(state, state.enemies[0])).toEqual(vec2(3, 1))
    })

    // Regression (also the next test): motion within a tick was taken as a
    // straight line from where a character was drawn at the start to where
    // at the end, which cuts the corner when it turns within the tick.
    it("catches a fast enemy turning through the player's cell within a tick", () => {
        const { map } = textMap(["#####", "### #", "#.  #", "#####"])
        // It has stepped east into the player's cell (3, 2) and is drawn
        // 0.9 of a cell short of it, at (2.1, 2).
        const enemy = makeEnemy(3, 2, AiType.random, { x: 2, y: 2 })
        enemy.moveProgress = 0.1
        // 1.8 cells a tick: it reaches (3, 2) half way through the tick and
        // turns north, the only way on, ending at (3, 1.1). The straight
        // line between those passes 0.64 of a cell from the player.
        enemy.speed = 1.8 * TICK_RATE
        const state = makeState(map, { x: 3, y: 2 }, [enemy])
        expect(run(state, 1)).toBe("dead")
        expect(enemy.pos).toEqual(vec2(3, 1))
        expect(
            gap(drawn(state, enemy), state.players[0].character.pos)
        ).toBeCloseTo(0.9)
    })

    it("catches a fast enemy turning back in the player's cell within a tick", () => {
        const { map } = textMap(["######", "#.   #", "######"])
        // It has stepped east into the player's cell (4, 1), a dead end,
        // and is drawn 0.7 of a cell short of it, at (3.3, 1).
        const enemy = makeEnemy(4, 1, AiType.random, { x: 3, y: 1 })
        enemy.moveProgress = 0.3
        // 1.4 cells a tick: it reaches (4, 1) half way through the tick and
        // turns back west, ending where it started, so a straight line
        // between the two has it standing still.
        enemy.speed = 1.4 * TICK_RATE
        const state = makeState(map, { x: 4, y: 1 }, [enemy])
        expect(run(state, 1)).toBe("dead")
        expect(enemy.pos).toEqual(vec2(3, 1))
        expect(drawn(state, enemy).x).toBeCloseTo(3.3)
    })

    // Regression: the chaser aimed at the player's cell, which is its own,
    // so every way out scored the same and it took the first, north.
    it("sends a chaser on the player's cell towards the player's sprite gliding in", () => {
        const { map } = textMap(["#######", "###.###", "#.....#", "#######"])
        // The player is 0.3 of the way through a step east from (2, 2) to
        // (3, 2); the chaser came west into (3, 2) and is ready to move on.
        const chaser = makeEnemy(3, 2, AiType.chase, { x: 4, y: 2 })
        chaser.moveProgress = 1
        const state = makeState(map, { x: 3, y: 2 }, [chaser])
        state.players[0].character.lastPos = vec2(2, 2)
        state.players[0].character.moveProgress = 0.3
        expect(run(state, 1)).toBeNull()
        expect(chaser.pos).toEqual(vec2(2, 2))
    })
})

// Stepping stops once a step returns an outcome; flow.test.ts checks that
// nothing changes after that.
describe("step: the tick that ends the game", () => {
    it("moves every character in that tick", () => {
        const state = makeState(corridor, { x: 2, y: 1 }, [
            // Half way from (1, 1) into the player's cell: already touching.
            makeEnemy(2, 1, AiType.random, { x: 1, y: 1 }),
            makeEnemy(6, 1, AiType.random, { x: 7, y: 1 }, ENEMY_IDS[1]),
        ])
        state.players[0].character.moveProgress = 1
        state.enemies[0].moveProgress = 0.5
        state.enemies[1].moveProgress = 1
        expect(run(state, 1, east)).toBe("dead")
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
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
        expect(state.players[0].character.pos).toEqual(vec2(4, 1))
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
        state.players[0].character.lastPos = vec2(1, 1)
        ready(state)
        run(state, 1, west)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        expect(state.enemies[0].pos).toEqual(vec2(5, 3))
    })

    it("a phantom catches the player as it comes out of a wall", () => {
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
        expect(run(state, 1)).toBeNull()
        expect(state.enemies[0].pos).toEqual(vec2(1, 1))
        // 0.4 cells at PHANTOM_SPEED / TICK_RATE (1/40) a tick.
        expect(ticksUntilCaught(state)).toBe(16)
        // Caught with most of its sprite still in the wall at (2, 1).
        expect(drawn(state, state.enemies[0]).x).toBeGreaterThan(1.5)
    })
})

const OLD_PLAYER_START = vec2(4, 1)

describe("createGameState", () => {
    it("starts from the first level by default", () => {
        expect(createGameState()).toEqual(createGameState(levels[0]))
    })

    it("builds the old hard-coded map's state from its level", () => {
        const state = createGameState(OLD_LEVEL)
        expect(state.players[0].character.id).toBe(CharacterId.player)
        expect(state.players[0].character.pos).toEqual(OLD_PLAYER_START)
        expect(state.players[0].character.speed).toBe(PLAYER_SPEED)
        expect(state.enemies.map((e) => e.id)).toEqual([
            ENEMY_IDS[0],
            ENEMY_IDS[1],
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
        const level = parseFlat({
            name: "tiny",
            parTime: 60,
            map: ["#####", "#P.E#", "#####"],
            enemies: [{ ai: "chase" }],
        })
        const state = createGameState(level)
        expect(state.cells).toEqual([
            [1, 1, 1, 1, 1],
            [1, 0, 2, 2, 1],
            [1, 1, 1, 1, 1],
        ])
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        expect(state.enemies).toHaveLength(1)
        expect(state.enemies[0].id).toBe(ENEMY_IDS[0])
        expect(state.enemies[0].pos).toEqual(vec2(3, 1))
        expect(state.enemies[0].ai).toBe(AiType.chase)
    })

    it("starts with no score, full health and no invulnerability", () => {
        const state = createGameState(OLD_LEVEL)
        expect(state.players[0].score).toBe(0)
        expect(state.players[0].health).toBe(MAX_HEALTH)
        expect(state.players[0].invulnerableFor).toBe(0)
    })

    it("has the player ready to move at once and the enemies wait", () => {
        const state = createGameState(OLD_LEVEL)
        expect(state.players[0].character.moveProgress).toBe(1)
        expect(state.enemies.map((e) => e.moveProgress)).toEqual([0, 0])
        const start = state.players[0].character.pos
        const enemies = state.enemies.map((e) => e.pos)
        // The old level's player starts with open cells to the west and east.
        step(state, TICK, { held: [east], pressed: east }, fixedRandom(0))
        expect(state.players[0].character.pos).toEqual(
            vec2(start.x + 1, start.y)
        )
        expect(state.enemies.map((e) => e.pos)).toEqual(enemies)
    })

    it("gives the characters the level's speeds", () => {
        const level = parseFlat({
            name: "fast",
            parTime: 60,
            map: ["#######", "#P.E.E#", "#######"],
            playerSpeed: 6,
            enemies: [{ ai: "chase", speed: 3 }, { ai: "random" }],
        })
        const state = createGameState(level)
        expect(state.players[0].character.speed).toBe(6)
        expect(state.enemies.map((e) => e.speed)).toEqual([3, ENEMY_SPEED])
    })

    it("gives phantoms their slower default speed unless the level sets one", () => {
        const level = parseFlat({
            name: "phantoms",
            parTime: 60,
            map: ["######", "#P.EE#", "######"],
            enemies: [{ ai: "phantom" }, { ai: "phantom", speed: 3 }],
        })
        const state = createGameState(level)
        expect(state.enemies.map((e) => e.speed)).toEqual([PHANTOM_SPEED, 3])
    })

    it("gives four enemies their own ids and a patroller its route", () => {
        const level = parseFlat({
            name: "four",
            parTime: 60,
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
            ENEMY_IDS[0],
            ENEMY_IDS[1],
            ENEMY_IDS[2],
            ENEMY_IDS[3],
        ])
        expect(state.enemies[3].route).toEqual([vec2(1, 2), vec2(4, 1)])
        expect(state.enemies[3].route).not.toBe(level.enemies[3].route)
        expect(state.enemies[3].routeIndex).toBe(0)
        expect(state.enemies[0]).not.toHaveProperty("route")
    })

    it("uses the default speeds when the level leaves them out", () => {
        const level = parseFlat({
            name: "default",
            parTime: 60,
            map: ["#####", "#P.E#", "#####"],
            enemies: [{ ai: "chase" }],
        })
        const state = createGameState(level)
        expect(state.players[0].character.speed).toBe(PLAYER_SPEED)
        expect(state.enemies[0].speed).toBe(ENEMY_SPEED)
    })

    it("returns a fresh state each time", () => {
        const a = createGameState(OLD_LEVEL)
        a.cells[0][0] = Cell.none
        a.cells[1][1] = Cell.none
        a.players[0].character.pos.x = 99
        a.enemies[0].pos.x = 99
        const b = createGameState(OLD_LEVEL)
        expect(b.cells[0][0]).toBe(Cell.wall)
        expect(b.cells[1][1]).toBe(Cell.dot)
        // Literals, so a shared (aliased) level spawn would be caught.
        expect(b.players[0].character.pos).toEqual(vec2(4, 1))
        expect(b.enemies[0].pos).toEqual(vec2(1, 4))
    })
})

describe("score", () => {
    it("scores DOT_POINTS per dot eaten", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        expect(state.players[0].score).toBe(0)
        movePlayer(state, east)
        expect(state.players[0].score).toBe(DOT_POINTS)
        movePlayer(state, east)
        expect(state.players[0].score).toBe(2 * DOT_POINTS)
    })

    it("scores nothing for empty cells or walls", () => {
        const state = makeState(map, { x: 1, y: 1 })
        expect(movePlayer(state, vec2(0, 1))).toBe(false) // wall
        expect(movePlayer(state, north)).toBe(true) // empty
        expect(movePlayer(state, vec2(0, 1))).toBe(true) // the empty start
        expect(state.players[0].score).toBe(0)
    })

    it("scores the dots eaten while stepping", () => {
        const state = makeState(corridor, { x: 0, y: 1 })
        ready(state)
        run(state, 2 * (TICK_RATE / PLAYER_SPEED) + 1, east)
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        expect(state.players[0].score).toBe(3 * DOT_POINTS)
    })
})

describe("step: health", () => {
    // The player at (1, 1) walks east while the enemy at (2, 1) walks west:
    // they swap cells, and the player eats the dot at (2, 1).
    function swap(health: number = MAX_HEALTH) {
        const state = makeState(
            corridor,
            { x: 1, y: 1 },
            [makeEnemy(2, 1, AiType.random, { x: 3, y: 1 })],
            { health }
        )
        ready(state)
        return state
    }

    it("costs ENEMY_DAMAGE on a swap, keeping dots and score", () => {
        const state = swap()
        expect(run(state, SWAP_TICKS - 1, east)).toBeNull()
        expect(state.players[0].health).toBe(MAX_HEALTH)
        expect(run(state, 1, east)).toBeNull()
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(state.cells[1][2]).toBe(Cell.none)
        expect(state.players[0].score).toBeGreaterThanOrEqual(DOT_POINTS)
    })

    it("knocks the player back a cell, away from the enemy", () => {
        const state = swap()
        run(state, SWAP_TICKS, east)
        // A third of the way into (2, 1), so pushed west from (1, 1).
        const { character } = state.players[0]
        expect(character.lastPos).toEqual(vec2(1, 1))
        expect(character.pos).toEqual(vec2(0, 1))
        expect(character.moveProgress).toBe(0)
    })

    it("resets nobody: the enemy carries on where it is", () => {
        const state = swap()
        run(state, SWAP_TICKS - 1, east)
        const enemy = cloneState(state).enemies[0]
        run(state, 1, east)
        // It went on with its move, not back to its spawn.
        expect(state.enemies[0].pos).toEqual(enemy.pos)
        expect(state.enemies[0].moveProgress).toBeGreaterThan(
            enemy.moveProgress
        )
    })

    it("hurts when an enemy walks into a player who stays put", () => {
        const state = swap()
        expect(ticksUntilCaught(state)).toBe(STEP_IN_TICKS)
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        // Pushed west, away from the enemy coming in from the east.
        expect(state.players[0].character.pos).toEqual(vec2(0, 1))
        expect(state.enemies[0].pos).toEqual(vec2(1, 1))
    })

    it("lets enemies pass through an invulnerable player", () => {
        const state = swap()
        state.players[0].invulnerableFor = TICK_RATE
        run(state, TICK_RATE - 1)
        expect(state.players[0].health).toBe(MAX_HEALTH)
        expect(state.events).toEqual([])
    })

    it("is lost when a hit takes the last health", () => {
        const state = swap(ENEMY_DAMAGE)
        expect(run(state, SWAP_TICKS - 1, east)).toBeNull()
        expect(run(state, 1, east)).toBe("dead")
        expect(state.players[0].health).toBe(0)
        // No knockback and no respawn: the final positions stay as they
        // were.
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(1, 1))
    })

    it("is lost after MAX_HEALTH / ENEMY_DAMAGE hits, one per invulnerability", () => {
        // Boxed in with an enemy on its cell: nowhere to be knocked to, so
        // it is hit again as soon as each invulnerability wears off.
        const { map } = textMap(["#####", "# #.#", "#####"])
        const state = makeState(map, { x: 1, y: 1 }, [makeEnemy(1, 1)], {
            health: MAX_HEALTH,
        })
        const hits = MAX_HEALTH / ENEMY_DAMAGE
        expect(run(state, 1)).toBeNull()
        for (let i = 1; i < hits; i++) {
            expect(state.players[0].health).toBe(MAX_HEALTH - i * ENEMY_DAMAGE)
            expect(run(state, HURT_INVULNERABLE_TICKS - 1)).toBeNull()
            expect(state.players[0].health).toBe(MAX_HEALTH - i * ENEMY_DAMAGE)
            if (i < hits - 1) expect(run(state, 1)).toBeNull()
        }
        expect(run(state, 1)).toBe("dead")
        expect(state.ticks).toBe(1 + (hits - 1) * HURT_INVULNERABLE_TICKS)
    })
})

// The rule when the player eats the last dot on the same tick they are
// touched: see checkEnd.
describe("step: touched on the tick the last dot is eaten", () => {
    // Only one dot, at (2, 1). The player at (1, 1) eats it walking east
    // while the enemy, half way from (2, 1) into the player's cell, is
    // already touching them: a hit on that tick.
    const lastDot = [
        [1, 1, 1, 1, 1, 1, 1],
        [0, 0, 2, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1, 1],
    ] as const

    function touchedOnLastDot(health: number) {
        const state = makeState(
            lastDot,
            { x: 1, y: 1 },
            [makeEnemy(1, 1, AiType.random, { x: 2, y: 1 })],
            { health }
        )
        state.players[0].character.moveProgress = 1
        state.enemies[0].moveProgress = 0.5
        return state
    }

    it("is a win that costs no health", () => {
        const state = touchedOnLastDot(MAX_HEALTH)
        expect(run(state, 1, east)).toBe("won")
        expect(state.players[0].health).toBe(MAX_HEALTH)
        expect(state.players[0].score).toBe(DOT_POINTS)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
    })

    it("is a win with the last health too", () => {
        const state = touchedOnLastDot(1)
        expect(run(state, 1, east)).toBe("won")
        expect(state.players[0].health).toBe(1)
    })

    it("hurts when other dots remain", () => {
        const state = touchedOnLastDot(MAX_HEALTH)
        state.cells[1][5] = Cell.dot
        expect(run(state, 1, east)).toBeNull()
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
    })
})

describe("eatenAt", () => {
    it("starts as null", () => {
        expect(createGameState(OLD_LEVEL).players[0].eatenAt).toBeNull()
    })

    it("records the dot eaten on the player's latest move", () => {
        const state = makeState(corridor, { x: 1, y: 1 })
        movePlayer(state, east)
        expect(state.players[0].eatenAt).toEqual(vec2(2, 1))
        movePlayer(state, east)
        expect(state.players[0].eatenAt).toEqual(vec2(3, 1))
    })

    it("is cleared by a move that eats nothing", () => {
        const state = makeState(corridor, { x: 1, y: 1 })
        movePlayer(state, east)
        movePlayer(state, west)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        expect(state.players[0].eatenAt).toBeNull()
    })

    it("is kept when the player doesn't move", () => {
        const state = makeState(corridor, { x: 1, y: 1 })
        movePlayer(state, east)
        expect(movePlayer(state, north)).toBe(false)
        expect(movePlayer(state, none)).toBe(false)
        expect(state.players[0].eatenAt).toEqual(vec2(2, 1))
    })

    it("is set by stepping onto a dot", () => {
        const state = makeState(corridor, { x: 1, y: 1 })
        ready(state)
        run(state, 1, east)
        expect(state.players[0].eatenAt).toEqual(vec2(2, 1))
    })

    it("is the dot a knockback lands on", () => {
        // The player eats (2, 1) while swapping cells with the enemy, and
        // is knocked back onto the dot at (0, 1).
        const state = makeState(
            corridor,
            { x: 1, y: 1 },
            [makeEnemy(2, 1, AiType.random, { x: 3, y: 1 })],
            { health: MAX_HEALTH }
        )
        ready(state)
        expect(run(state, 1, east)).toBeNull()
        expect(state.players[0].eatenAt).toEqual(vec2(2, 1))
        expect(run(state, SWAP_TICKS - 1, east)).toBeNull()
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(state.players[0].score).toBe(2 * DOT_POINTS)
        expect(state.players[0].eatenAt).toEqual(vec2(0, 1))
    })
})

describe("settle", () => {
    // The player has just eaten (2, 1); the enemy is mid-glide too.
    function ended() {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            makeEnemy(6, 1, AiType.random, { x: 7, y: 1 }),
        ])
        movePlayer(state, east)
        state.players[0].character.moveProgress = 0
        state.enemies[0].moveProgress = 0.5
        return state
    }

    it("raises everyone's progress by speed * dt", () => {
        const state = ended()
        expect(settle(state, 0.1)).toBe(false)
        expect(state.players[0].character.moveProgress).toBeCloseTo(
            0.1 * PLAYER_SPEED
        )
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
        expect(state.players[0].character.moveProgress).toBe(1)
        for (let i = 0; i < TICK_RATE; i++) settle(state, TICK)
        expect(state.players[0].character.moveProgress).toBe(1)
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
        const before = cloneState(state)
        for (let i = 0; i < TICK_RATE; i++) settle(state, TICK)
        expect(state).toEqual({
            ...before,
            players: [
                {
                    ...before.players[0],
                    character: {
                        ...before.players[0].character,
                        moveProgress: 1,
                    },
                },
            ],
            enemies: [{ ...before.enemies[0], moveProgress: 1 }],
        })
        expect(state.players[0].score).toBe(DOT_POINTS)
        expect(state.players[0].eatenAt).toEqual(vec2(2, 1))
    })
})

describe("ticks (the clear time)", () => {
    it("starts at 0 and counts every step, moving or not", () => {
        const state = createGameState(OLD_LEVEL)
        expect(state.ticks).toBe(0)
        run(state, 3)
        expect(state.ticks).toBe(3)
        run(state, 2, east)
        expect(state.ticks).toBe(5)
    })

    it("keeps counting through a hit", () => {
        // The enemy spawns on the player, so the first tick hurts it.
        const state = makeState(corridor, { x: 1, y: 1 }, [makeEnemy(1, 1)], {
            health: MAX_HEALTH,
        })
        run(state, 1)
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(state.ticks).toBe(1)
        run(state, 1)
        expect(state.ticks).toBe(2)
    })

    it("isn't counted by settle", () => {
        const state = createGameState(OLD_LEVEL)
        run(state, 4)
        state.players[0].character.moveProgress = 0
        settle(state, TICK)
        settle(state, TICK)
        expect(state.ticks).toBe(4)
    })
})
