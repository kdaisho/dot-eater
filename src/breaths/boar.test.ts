import { describe, expect, it } from "vite-plus/test"
import { addStatus, type EnemyStatus } from "../breath"
import { AiType, Cell, MAX_HEALTH, TICK_RATE } from "../constants"
import { createGameState, step, type GameState, type MoveInput } from "../game"
import { parseFlat } from "../test/helpers"
import type { Character } from "../character"
import {
    fixedRandom,
    makeEnemy,
    makeState,
    textMap,
    type MapLiteral,
} from "../test/helpers"
import { vec2, type Vec2 } from "../vec2"
import { boar, BROKEN_WALL } from "./boar"

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
    it("breaks the inner wall in front, for 75 energy and a 1 s cooldown", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        tick(state, { breath: true })
        expect(state.cells[1][3]).toBe(Cell.none)
        expect(state.players[0].breather.energy).toBe(25)
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
        expect(state.players[0].breather.energy).toBe(25)
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

    it("needs 75 energy", () => {
        const state = boarState(rooms, { x: 2, y: 1 })
        state.players[0].breather.energy = 74
        tick(state, { breath: true })
        expect(state.cells[1][3]).toBe(Cell.wall)
        expect(state.players[0].breather.energy).toBe(74)
        state.players[0].breather.energy = 75
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
