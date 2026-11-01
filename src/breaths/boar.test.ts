import { describe, expect, it } from "vite-plus/test"
import { addStatus, breathe, type EnemyStatus } from "../breath"
import { AiType, Cell, MAX_HEALTH, TICK_RATE } from "../constants"
import { createGameState, step, type GameState, type MoveInput } from "../game"
import { parseFlat } from "../test/helpers"
import type { Character } from "../character"
import {
    cellsFrom,
    fixedRandom,
    makeEnemy,
    makeState,
    textMap,
    type MapLiteral,
} from "../test/helpers"
import { vec2, type Vec2 } from "../vec2"
import { boar, BROKEN_WALL, tunnel } from "./boar"

// The Boar's wall-break breath end to end through step().

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
const north = vec2(0, -1)
const south = vec2(0, 1)
// Ticks a broken wall stays open.
const OPEN_TICKS = TICK_RATE * 10

type Press = { held?: Vec2; pressed?: Vec2; breath?: boolean }

function tick(state: GameState, { held, pressed, breath }: Press = {}) {
    const move: MoveInput = {
        held: held ? [held] : [],
        pressed: pressed ?? none,
        breath: breath ?? false,
    }
    return step(state, TICK, move, fixedRandom(0))
}

function run(state: GameState, n: number, press: Press = {}) {
    for (let i = 0; i < n; i++) tick(state, press)
}

// Two rooms split by an inner wall at (3, 1). The dot in the wall pocket
// (bottom row) keeps the game from being won.
const rooms = textMap(["#######", "#  #  #", "#######", "#.#####"]).map

// A boar at `player` (facing right, ready to move) with a full meter.
function boarState(
    map: MapLiteral,
    player: { x: number; y: number },
    enemies: Character[] = [],
    health = 1
): GameState {
    const state = makeState(map, player, enemies, { breath: boar, health })
    state.players[0].breather.energy = boar.maxEnergy
    state.players[0].character.moveProgress = 1
    return state
}

const hold: EnemyStatus = { name: "test.hold", holds: true }

describe("the Boar's wall-break breath", () => {
    it("breaks the inner wall in front, for 20 energy and a 1 s cooldown", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { breath: true })
        expect(state.cells[1][3]).toBe(Cell.none)
        expect(state.players[0].breather.energy).toBe(80)
        expect(state.players[0].breather.cooldown).toBeCloseTo(1)
        expect(state.tiles).toEqual([
            { pos: vec2(3, 1), effect: BROKEN_WALL, left: 10 },
        ])
    })

    it("lets the player walk through the opening", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { breath: true })
        tick(state, { held: east })
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        run(state, TICK_RATE, { held: east })
        expect(state.players[0].character.pos).toEqual(vec2(5, 1))
    })

    it("lets enemies through the opening", () => {
        const enemy = makeEnemy(5, 1, AiType.chase)
        const state = boarState(rooms, { x: 2, y: 1 }, [enemy], MAX_HEALTH)
        tick(state, { breath: true })
        let through = false
        for (let i = 0; i < TICK_RATE * 2 && !through; i++) {
            tick(state)
            through = enemy.pos.x === 3
        }
        expect(through).toBe(true)
    })

    it("grows the wall back after 10 s", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { breath: true })
        run(state, OPEN_TICKS - 1)
        expect(state.cells[1][3]).toBe(Cell.none)
        tick(state)
        expect(state.cells[1][3]).toBe(Cell.wall)
        expect(state.tiles).toEqual([])
    })

    it("pushes a player standing in it out when it grows back", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { breath: true })
        tick(state, { held: east })
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        run(state, OPEN_TICKS)
        expect(state.cells[1][3]).toBe(Cell.wall)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
    })

    it("pushes an enemy standing in it out when it grows back", () => {
        const enemy = makeEnemy(5, 1, AiType.random)
        const state = boarState(rooms, { x: 2, y: 1 }, [enemy])
        tick(state, { breath: true })
        // An enemy held in the opening, having come in from the east.
        enemy.pos = vec2(3, 1)
        enemy.lastPos = vec2(4, 1)
        addStatus(enemy, hold, 20)
        run(state, OPEN_TICKS)
        expect(state.cells[1][3]).toBe(Cell.wall)
        expect(enemy.pos).toEqual(vec2(4, 1))
    })

    it("breaks a wall the player faces after pushing against it", () => {
        const { map } = textMap([
            "#######",
            "#     #",
            "#  #  #",
            "#     #",
            "#######",
            "#.#####",
        ])
        const state = boarState(map, { x: 3, y: 1 })
        // South of the player is a wall: it doesn't move but turns to it.
        tick(state, { pressed: south, held: south })
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        expect(state.players[0].breather.facing).toEqual(south)
        tick(state, { held: south, breath: true })
        expect(state.cells[2][3]).toBe(Cell.none)
        expect(state.players[0].breather.energy).toBe(80)
    })

    it("refuses an outer wall, spending nothing", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { pressed: north })
        expect(state.players[0].breather.facing).toEqual(north)
        tick(state, { breath: true })
        expect(state.cells[0][2]).toBe(Cell.wall)
        expect(state.tiles).toEqual([])
        expect(state.players[0].breather.energy).toBe(100)
        expect(state.players[0].breather.cooldown).toBe(0)
    })

    it("refuses an outer wall beside a wrap tunnel", () => {
        // Row 1 is a tunnel; the player stands on its edge cell, facing the
        // border wall above it.
        const { map } = textMap(["#######", "       ", "#######", "#.#####"])
        const state = boarState(map, { x: 0, y: 1 })
        tick(state, { pressed: north })
        expect(state.players[0].breather.facing).toEqual(north)
        tick(state, { breath: true })
        expect(state.cells[0][0]).toBe(Cell.wall)
        expect(state.players[0].breather.energy).toBe(100)
        // The far edge's border wall holds too.
        tick(state, { pressed: south })
        tick(state, { breath: true })
        expect(state.cells[2][0]).toBe(Cell.wall)
        expect(state.players[0].breather.energy).toBe(100)
    })

    it("refuses empty floor in front, spending nothing", () => {
        const state = boarState(rooms, { x: 1, y: 1 })
        tick(state, { breath: true })
        expect(state.tiles).toEqual([])
        expect(state.players[0].breather.energy).toBe(100)
        expect(state.players[0].breather.cooldown).toBe(0)
    })

    it("needs 20 energy", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        state.players[0].breather.energy = 19
        tick(state, { breath: true })
        expect(state.cells[1][3]).toBe(Cell.wall)
        expect(state.players[0].breather.energy).toBe(19)
        state.players[0].breather.energy = 20
        tick(state, { breath: true })
        expect(state.cells[1][3]).toBe(Cell.none)
        expect(state.players[0].breather.energy).toBe(0)
    })

    it("leaves the opened cell without a dot", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { breath: true })
        expect(state.cells[1][3]).not.toBe(Cell.dot)
    })

    it("moves at 3.5 cells/s", () => {
        const level = parseFlat({
            name: "Track",
            parTime: 60,
            map: [
                "####################",
                "#P                .#",
                "####################",
            ],
            enemies: [],
        })
        const game = createGameState(level, "boar")
        expect(game.players[0].character.speed).toBe(3.5)
        run(game, TICK_RATE * 3, { held: east })
        expect(game.players[0].character.pos).toEqual(vec2(1 + 11, 1))
    })
})

// KDA-289, with the user: a charged Boar bores a tunnel, a wall a level.
describe("the Boar's tunnel", () => {
    // Row 1: floor at x 1 and 2, inner walls at x 3 to 5, floor at x 6, an
    // inner wall at x 7, floor at x 8, then the outer wall.
    const gaps = textMap([
        "##########",
        "#  ### # #",
        "##########",
        "#.########",
    ]).map
    // Row 1: floor at x 1 and 2, then inner walls at x 3 to 5 right up to
    // the outer wall at x 6.
    const solid = textMap(["#######", "#  ####", "#######", "#.#####"]).map

    const opened = (state: GameState) =>
        state.tiles.filter((t) => t.effect === BROKEN_WALL).map((t) => t.pos.x)

    it("bores up to a wall a level, stopping at open floor", () => {
        const cells = cellsFrom(gaps)
        const lengths = [1, 2, 3, 4, 5].map(
            (level) => tunnel(cells, vec2(3, 1), east, level).length
        )
        // Floor at x 6 ends it, though x 7 is a wall again.
        expect(lengths).toEqual([1, 2, 3, 3, 3])
    })

    it("stops at the outer wall, which never breaks", () => {
        const cells = cellsFrom(solid)
        expect(tunnel(cells, vec2(3, 1), east, 5)).toEqual([
            vec2(3, 1),
            vec2(4, 1),
            vec2(5, 1),
        ])
        expect(tunnel(cells, vec2(6, 1), east, 5)).toEqual([])
        expect(tunnel(cells, vec2(2, 0), north, 5)).toEqual([])
    })

    it.each([1, 2, 3, 4, 5])(
        "opens the tunnel at level %i, for 20 a level, each wall for 10 s",
        (level) => {
            const state = boarState(gaps, { x: 2, y: 1 })
            expect(breathe(state, state.players[0], level)).toBe(true)
            const xs = [3, 4, 5].slice(0, level)
            expect(opened(state)).toEqual(xs)
            for (const x of xs) expect(state.cells[1][x]).toBe(Cell.none)
            expect(state.cells[1][7]).toBe(Cell.wall)
            expect(state.tiles.every((t) => t.left === 10)).toBe(true)
            // The charge's energy, even where the tunnel ran out of walls.
            expect(state.players[0].breather.energy).toBe(100 - 20 * level)
            // The event covers the opened walls.
            const event = state.events.find((e) => e.type === "breathed")
            expect(event?.type === "breathed" && event.cells).toEqual(
                xs.map((x) => vec2(x, 1))
            )
        }
    )

    it("lets the player walk through the whole tunnel", () => {
        const state = boarState(solid, { x: 2, y: 1 })
        breathe(state, state.players[0], 3)
        run(state, TICK_RATE, { held: east })
        expect(state.players[0].character.pos).toEqual(vec2(5, 1))
    })

    it("is refused at open floor, spending nothing, however charged", () => {
        const state = boarState(gaps, { x: 1, y: 1 })
        expect(breathe(state, state.players[0], 5)).toBe(false)
        expect(state.tiles).toEqual([])
        expect(state.players[0].breather.energy).toBe(100)
        expect(state.players[0].breather.cooldown).toBe(0)
    })

    it("is refused at an outer wall, spending nothing, however charged", () => {
        const state = boarState(solid, { x: 2, y: 1 })
        state.players[0].breather.facing = north
        expect(breathe(state, state.players[0], 5)).toBe(false)
        expect(state.cells[0][2]).toBe(Cell.wall)
        expect(state.players[0].breather.energy).toBe(100)
    })

    it("grows every wall back together after 10 s", () => {
        const state = boarState(solid, { x: 2, y: 1 })
        breathe(state, state.players[0], 3)
        run(state, OPEN_TICKS - 1)
        expect([3, 4, 5].map((x) => state.cells[1][x])).toEqual([
            Cell.none,
            Cell.none,
            Cell.none,
        ])
        tick(state)
        expect([3, 4, 5].map((x) => state.cells[1][x])).toEqual([
            Cell.wall,
            Cell.wall,
            Cell.wall,
        ])
        expect(state.tiles).toEqual([])
    })

    // Regression: walls grew back one at a time, each pushing whoever was
    // in it back where it came from, even into a wall still to grow back,
    // so a player near the tunnel's mouth was carried along it to the far
    // end.
    it("pushes a player inside out to the nearest open cell", () => {
        const state = boarState(gaps, { x: 2, y: 1 })
        breathe(state, state.players[0], 3)
        // In the tunnel's first cell, having come from the second.
        const { character } = state.players[0]
        character.pos = vec2(3, 1)
        character.lastPos = vec2(4, 1)
        run(state, OPEN_TICKS)
        expect(state.cells[1][3]).toBe(Cell.wall)
        expect(character.pos).toEqual(vec2(2, 1))
    })
})
