import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell, DOT_POINTS, PLAYER_SPEED, TICK_RATE } from "./constants"
import type { Character } from "./character"
import { createGameState, step, type GameState, type Outcome } from "./game"
import { levels } from "./levels"
import {
    fixedRandom,
    makeEnemy,
    makePatroller,
    makeState,
    textMap,
    ticksUntilCaught,
} from "./test/helpers"
import { samePos, vec2, type Vec2 } from "./vec2"

// Sliding on ice inside the game step (see ice.ts for the rules).

const TICK = 1 / TICK_RATE
const PLAYER_TICKS = TICK_RATE / PLAYER_SPEED
const none = vec2(0, 0)
const north = vec2(0, -1)
const south = vec2(0, 1)
const east = vec2(1, 0)
const west = vec2(-1, 0)

// A state from rows of map characters (see textMap), with everyone ready to
// move on the first tick.
function rink(
    rows: readonly string[],
    player: Vec2,
    enemies: Character[] = [],
    lives = 1
): GameState {
    const { map, ice } = textMap(rows)
    const state = makeState(map, player, enemies, { lives, ice })
    state.player.moveProgress = 1
    for (const enemy of enemies) enemy.moveProgress = 1
    return state
}

type Tick = { held?: readonly Vec2[]; pressed?: Vec2 }

// Step `n` ticks with the same input, returning every cell `who` (the player
// by default) moved to, in order.
function trail(
    state: GameState,
    n: number,
    input: Tick = {},
    who: Character = state.player
): Vec2[] {
    const cells: Vec2[] = []
    for (let i = 0; i < n; i++) {
        const before = who.pos
        step(
            state,
            TICK,
            { held: input.held ?? [], pressed: input.pressed ?? none },
            fixedRandom(0)
        )
        if (!samePos(before, who.pos)) cells.push(who.pos)
    }
    return cells
}

function stepOnce(state: GameState, input: Tick = {}): Outcome | null {
    return step(
        state,
        TICK,
        { held: input.held ?? [], pressed: input.pressed ?? none },
        fixedRandom(0)
    )
}

// A dot out of the way in each map, so eating the rest doesn't win.
describe("step: sliding on ice", () => {
    // Floor at (1, 1) and (7, 1), ice between.
    const lane = ["#########", "# ~~~~~ #", "#######.#"]

    it("keeps moving the same way at the normal speed, then stops on floor", () => {
        const state = rink(lane, vec2(1, 1))
        expect(trail(state, 1, { held: [east] })).toEqual([vec2(2, 1)])
        // Nothing held: the slide carries on, a cell per PLAYER_TICKS.
        for (let x = 3; x <= 7; x++) {
            expect(trail(state, PLAYER_TICKS - 1)).toEqual([])
            expect(trail(state, 1)).toEqual([vec2(x, 1)])
        }
        // On normal floor it stops.
        expect(trail(state, TICK_RATE)).toEqual([])
        expect(state.player.pos).toEqual(vec2(7, 1))
        expect(state.player.moveProgress).toBe(1)
    })

    it("stops on the ice before a wall, free to go any way from there", () => {
        const state = rink(
            ["#######", "#####.#", "#  ~~~#", "#######"],
            vec2(1, 2)
        )
        trail(state, 1, { held: [east] })
        // (2, 2) is floor; the slide starts on the ice at (3, 2).
        expect(trail(state, PLAYER_TICKS * 5, { held: [east] })).toEqual([
            vec2(3, 2),
            vec2(4, 2),
            vec2(5, 2),
        ])
        // Stopped on ice: it can turn north, which the wall ahead allows.
        expect(trail(state, PLAYER_TICKS, { held: [north] })).toEqual([
            vec2(5, 1),
        ])
    })

    it("can start a new slide back the way it came after stopping", () => {
        const state = rink(["#######", "#  ~~~#", "#####.#"], vec2(2, 1))
        trail(state, PLAYER_TICKS * 4, { held: [east] })
        expect(state.player.pos).toEqual(vec2(5, 1))
        // West slides back over the ice and stops on the floor at (2, 1).
        trail(state, 1, { held: [west] })
        expect(trail(state, PLAYER_TICKS * 4)).toEqual([vec2(3, 1), vec2(2, 1)])
    })

    it("slides through a wrap tunnel", () => {
        // Ice on both edges: going west from (2, 1) slides off the left edge,
        // in at the right and on to the floor it started from.
        const state = rink(["#####", "~~ ~~", "###.#"], vec2(2, 1))
        const cells = [
            ...trail(state, 1, { held: [west] }),
            ...trail(state, PLAYER_TICKS * 6),
        ]
        expect(cells).toEqual([
            vec2(1, 1),
            vec2(0, 1),
            vec2(4, 1),
            vec2(3, 1),
            vec2(2, 1),
        ])
    })

    it("eats the dots it slides over", () => {
        const state = rink(["#######", "# :~: #", "#####.#"], vec2(1, 1))
        trail(state, 1, { held: [east] })
        expect(state.score).toBe(DOT_POINTS)
        expect(state.eatenAt).toEqual(vec2(2, 1))
        trail(state, PLAYER_TICKS)
        expect(state.eatenAt).toBeNull()
        trail(state, PLAYER_TICKS)
        expect(state.eatenAt).toEqual(vec2(4, 1))
        expect(state.score).toBe(2 * DOT_POINTS)
        expect(state.cells[1][2]).toBe(Cell.none)
        expect(state.cells[1][4]).toBe(Cell.none)
    })

    // Open floor above and below the ice: turning would be possible if
    // steering counted.
    const field = [
        "#######", //
        "#     #",
        "# ~~~ #",
        "#    .#",
        "#######",
    ]

    it("ignores held directions while sliding", () => {
        const state = rink(field, vec2(1, 2))
        trail(state, 1, { held: [east] })
        expect(
            trail(state, PLAYER_TICKS * 3, { held: [north, south, west] })
        ).toEqual([vec2(3, 2), vec2(4, 2), vec2(5, 2)])
    })

    it("keeps a tap made mid-slide for the first move after the slide", () => {
        const state = rink(field, vec2(1, 2))
        trail(state, 1, { held: [east] })
        // Tapped at once, three cells before the slide ends.
        stepOnce(state, { pressed: north })
        expect(trail(state, PLAYER_TICKS * 3 - 1)).toEqual([
            vec2(3, 2),
            vec2(4, 2),
            vec2(5, 2),
        ])
        expect(state.bufferedStep).toEqual(north)
        // The slide is over: the tap turns the player north.
        expect(trail(state, PLAYER_TICKS)).toEqual([vec2(5, 1)])
        expect(state.bufferedStep).toEqual(none)
    })

    it("lets a newer tap replace one made earlier in the slide", () => {
        const state = rink(field, vec2(1, 2))
        trail(state, 1, { held: [east] })
        stepOnce(state, { pressed: north })
        stepOnce(state, { pressed: south })
        trail(state, PLAYER_TICKS * 4)
        expect(state.player.pos).toEqual(vec2(5, 3))
    })

    it("doesn't reverse a slide on a tap the other way", () => {
        const state = rink(field, vec2(1, 2))
        trail(state, 1, { held: [east] })
        stepOnce(state, { pressed: west })
        expect(trail(state, PLAYER_TICKS * 3 - 1)).toEqual([
            vec2(3, 2),
            vec2(4, 2),
            vec2(5, 2),
        ])
        // Then the tap is used, from the floor at the end.
        expect(trail(state, PLAYER_TICKS)).toEqual([vec2(4, 2)])
    })
})

describe("step: enemies on ice", () => {
    // An ice lane with floor at both ends, open floor above it, and a
    // player out of the way at (1, 3).
    const lane = [
        "#########", //
        "#.......#",
        "#.~~~~~.#",
        "#.#####.#",
        "#########",
    ]
    const ENEMY_TICKS = TICK_RATE / 2

    it("slide, ignoring their AI", () => {
        // Random with fixedRandom(0) would turn north (first in direction
        // order) if it could choose.
        const enemy = makeEnemy(2, 2, AiType.random, { x: 1, y: 2 })
        const state = rink(lane, vec2(1, 3), [enemy])
        expect(trail(state, ENEMY_TICKS * 5, {}, enemy)).toEqual([
            vec2(3, 2),
            vec2(4, 2),
            vec2(5, 2),
            vec2(6, 2),
            vec2(7, 2),
        ])
    })

    it("slide even past the player they chase", () => {
        // The player is just north of (4, 2); the chaser slides on by.
        const enemy = makeEnemy(3, 2, AiType.chase, { x: 2, y: 2 })
        const state = rink(lane, vec2(4, 1), [enemy])
        expect(trail(state, ENEMY_TICKS * 2, {}, enemy)).toEqual([
            vec2(4, 2),
            vec2(5, 2),
        ])
    })

    it("choose freely again once the slide ends", () => {
        const enemy = makeEnemy(6, 2, AiType.chase, { x: 5, y: 2 })
        const state = rink(lane, vec2(7, 1), [enemy])
        // Slides onto the floor at (7, 2), then turns north at the player.
        expect(trail(state, 1, {}, enemy)).toEqual([vec2(7, 2)])
        expect(trail(state, ENEMY_TICKS, {}, enemy)).toEqual([vec2(7, 1)])
        expect(ticksUntilCaught(state)).toBeLessThan(ENEMY_TICKS)
        expect(enemy.pos).toEqual(vec2(7, 1))
    })

    it("a phantom floats over ice without sliding", () => {
        // Heading east on ice, but the player is to the west: it turns back.
        const phantom = makeEnemy(4, 2, AiType.phantom, { x: 3, y: 2 })
        const state = rink(lane, vec2(1, 2), [phantom])
        expect(trail(state, 1, {}, phantom)).toEqual([vec2(3, 2)])
    })

    it("a patroller that slides over its waypoint moves on to the next", () => {
        const patroller = makePatroller(
            3,
            2,
            [
                [4, 2],
                [1, 1],
            ],
            { x: 2, y: 2 }
        )
        const state = rink(lane, vec2(1, 3), [patroller])
        trail(state, 1, {}, patroller)
        expect(patroller.pos).toEqual(vec2(4, 2))
        expect(patroller.routeIndex).toBe(1)
    })

    // Regression: patrolStep only notices a waypoint at the patroller's next
    // AI move, which a slide replaces, so a waypoint on ice it had stepped
    // onto was never reached and it kept coming back for it.
    it("a patroller carried off its waypoint by a slide moves on to the next", () => {
        const patroller = makePatroller(
            3,
            2,
            [
                [3, 2],
                [1, 1],
            ],
            { x: 2, y: 2 }
        )
        const state = rink(lane, vec2(1, 3), [patroller])
        trail(state, 1, {}, patroller)
        expect(patroller.pos).toEqual(vec2(4, 2))
        expect(patroller.routeIndex).toBe(1)
    })
})

// Collisions are on drawn positions (see collides in game.ts); slides are
// ordinary moves, drawn gliding like any other.
describe("step: collisions while sliding", () => {
    const lane = ["#########", "# ~~~~~ #", "#######.#"]

    it("catches a sliding player and an enemy swapping cells where they meet", () => {
        const state = rink(lane, vec2(3, 1), [
            makeEnemy(4, 1, AiType.random, { x: 5, y: 1 }),
        ])
        state.player.lastPos = vec2(2, 1)
        expect(stepOnce(state, { held: [west] })).toBeNull()
        expect(state.player.pos).toEqual(vec2(4, 1))
        expect(state.enemies[0].pos).toEqual(vec2(3, 1))
        // A cell apart, closing 0.1 cells a tick to CATCH_DISTANCE.
        expect(ticksUntilCaught(state)).toBe(4)
    })

    it("catches both sliding into the same cell once the sprites meet", () => {
        const state = rink(lane, vec2(2, 1), [
            makeEnemy(4, 1, AiType.random, { x: 5, y: 1 }),
        ])
        state.player.lastPos = vec2(1, 1)
        expect(stepOnce(state)).toBeNull()
        expect(state.player.pos).toEqual(vec2(3, 1))
        expect(state.enemies[0].pos).toEqual(vec2(3, 1))
        expect(ticksUntilCaught(state)).toBe(14)
    })

    it("catches an enemy sliding into a player who stays put once the sprites touch", () => {
        // The enemy slides east from (3, 1); the player stands on the ice
        // at (5, 1) without sliding (it hasn't moved).
        const enemy = makeEnemy(3, 1, AiType.random, { x: 2, y: 1 })
        const state = rink(lane, vec2(5, 1), [enemy])
        // Two slide steps at ENEMY_SPEED (2): on the first tick and the
        // TICK_RATE / 2 ticks after it. The second goes into the player's
        // cell with the sprites still a cell apart.
        expect(trail(state, TICK_RATE / 2 + 1, {}, enemy)).toEqual([
            vec2(4, 1),
            vec2(5, 1),
        ])
        expect(state.lives).toBe(1)
        // 0.4 cells at 1/30 of a cell a tick.
        expect(ticksUntilCaught(state)).toBe(12)
        expect(enemy.pos).toEqual(vec2(5, 1))
    })

    it("is not a collision when an enemy slides into the cell the player leaves", () => {
        const state = rink(lane, vec2(3, 1), [
            makeEnemy(2, 1, AiType.random, { x: 1, y: 1 }),
        ])
        state.player.lastPos = vec2(2, 1)
        expect(stepOnce(state)).toBeNull()
        expect(state.player.pos).toEqual(vec2(4, 1))
        expect(state.enemies[0].pos).toEqual(vec2(3, 1))
    })
})

describe("createGameState: ice", () => {
    it("copies the level's ice", () => {
        const level = levels.find((l) =>
            l.ice.some((row) => row.includes(true))
        )
        expect(level).toBeDefined()
        if (!level) return
        const state = createGameState(level)
        expect(state.ice).toEqual(level.ice)
        expect(state.ice).not.toBe(level.ice)
    })

    it("starts the player off ice, so nobody starts sliding", () => {
        for (const level of levels) {
            const state = createGameState(level)
            for (const c of [state.player, ...state.enemies]) {
                expect(state.ice[c.pos.y][c.pos.x]).toBe(false)
            }
        }
    })
})

describe("step: enemy pathing on ice", () => {
    // An ice lane from (2, 1) to (6, 1) between floor at (1, 1) and a dead
    // end at (7, 1). (3, 1) has walls above and below, so it can only be
    // slid over. The player waits in a sealed pocket at (7, 3).
    const rows = [
        "#########",
        "#.~~~~~ #",
        "#.##.####",
        "#.##.##.#",
        "#....####",
        "#########",
    ]

    // Regression: plain BFS sent the patroller east from (1, 1) for (4, 3)
    // every time, sliding to (7, 1) and back for ever.
    it("a patroller whose waypoint can only be slid over loops round its route", () => {
        const patroller = makePatroller(1, 4, [
            [3, 1],
            [4, 3],
        ])
        const state = rink(rows, vec2(7, 3), [patroller])
        const moves = trail(state, 60 * 30, {}, patroller)
        // Up and east, sliding over (3, 1) to (7, 1); back west to (1, 1),
        // then round below to (4, 3); up to stop on (4, 1), and west over
        // (3, 1) again.
        expect(moves.slice(0, 27)).toEqual(
            [
                [1, 3],
                [1, 2],
                [1, 1],
                [2, 1],
                [3, 1],
                [4, 1],
                [5, 1],
                [6, 1],
                [7, 1],
                [6, 1],
                [5, 1],
                [4, 1],
                [3, 1],
                [2, 1],
                [1, 1],
                [1, 2],
                [1, 3],
                [1, 4],
                [2, 4],
                [3, 4],
                [4, 4],
                [4, 3],
                [4, 2],
                [4, 1],
                [3, 1],
                [2, 1],
                [1, 1],
            ].map(([x, y]) => vec2(x, y))
        )
        const visits = (x: number, y: number) =>
            moves.filter((p) => samePos(p, vec2(x, y))).length
        expect(visits(4, 3)).toBeGreaterThanOrEqual(2)
        expect(visits(3, 1)).toBeGreaterThanOrEqual(4)
    })
})
