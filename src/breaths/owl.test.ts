import { describe, expect, it } from "vite-plus/test"
import { inPlay } from "../breath"
import { AiType, CharacterId, TICK_RATE } from "../constants"
import { step, type GameState, type MoveInput } from "../game"
import { fixedRandom, makeEnemy, makeState, textMap } from "../test/helpers"
import { vec2 } from "../vec2"
import { GUST, GUST_SECONDS, owl, WIND_PUSH } from "./owl"

// The Owl's wind breath through step(), as the player plays it.

const TICK = 1 / TICK_RATE

function tick(state: GameState, breath = false) {
    const move: MoveInput = { held: [], pressed: vec2(0, 0), breath }
    return step(state, TICK, move, fixedRandom(0))
}

function run(state: GameState, n: number) {
    for (let i = 0; i < n; i++) tick(state)
}

// A wrap-around corridor (row 1, open at both edges) above a dead-end row.
// The dot shut away in the bottom row keeps the game from being won.
const corridor = textMap([
    "#########",
    "         ",
    "#### ####",
    "#.#######",
]).map

// The player at (x, 1) facing right (the start facing) with a full meter.
function owlState(x: number, enemies = [makeEnemy(3, 1)]) {
    const state = makeState(corridor, { x, y: 1 }, enemies, { breath: owl })
    state.breather.energy = 100
    return state
}

describe("owl wind breath", () => {
    it("pushes an enemy in the line back 3 cells", () => {
        const enemy = makeEnemy(3, 1)
        const state = owlState(1, [enemy])
        expect(tick(state, true)).toBeNull()
        expect(enemy.pos).toEqual(vec2(3 + WIND_PUSH, 1))
        expect(inPlay(enemy)).toBe(true)
    })

    it("stops a pushed enemy before a wall", () => {
        const { map } = textMap(["#######", "#     #", "#######", "#.#####"])
        const enemy = makeEnemy(4, 1)
        const state = makeState(map, { x: 1, y: 1 }, [enemy], { breath: owl })
        state.breather.energy = 100
        tick(state, true)
        expect(enemy.pos).toEqual(vec2(5, 1))
    })

    it("pushes through a tunnel", () => {
        // Line from x 6: 7, 8, then through the tunnel to 0, 1, 2.
        const enemy = makeEnemy(8, 1)
        const state = owlState(6, [enemy])
        tick(state, true)
        expect(enemy.pos).toEqual(vec2(2, 1))
    })

    it("pushes every enemy in the line, the one on the player's cell too", () => {
        const onPlayer = makeEnemy(1, 1)
        const near = makeEnemy(
            2,
            1,
            AiType.random,
            undefined,
            CharacterId.enemy2
        )
        const far = makeEnemy(
            4,
            1,
            AiType.random,
            undefined,
            CharacterId.enemy3
        )
        const state = owlState(1, [onPlayer, near, far])
        tick(state, true)
        expect(onPlayer.pos).toEqual(vec2(4, 1))
        expect(near.pos).toEqual(vec2(5, 1))
        expect(far.pos).toEqual(vec2(7, 1))
    })

    it("leaves enemies out of the line alone", () => {
        // Below the line, and in the corridor behind the player.
        const below = makeEnemy(4, 2)
        const behind = makeEnemy(
            0,
            1,
            AiType.random,
            undefined,
            CharacterId.enemy2
        )
        const state = owlState(2, [below, behind])
        tick(state, true)
        expect(below.pos).toEqual(vec2(4, 2))
        expect(behind.pos).toEqual(vec2(0, 1))
    })

    it("defeats nobody and scores nothing", () => {
        const enemy = makeEnemy(3, 1)
        const state = owlState(1, [enemy])
        tick(state, true)
        expect(inPlay(enemy)).toBe(true)
        expect(state.score).toBe(0)
        expect(state.breather.energy).toBe(75)
    })

    it("fires with nobody in the line, showing a short gust", () => {
        const state = owlState(1, [])
        tick(state, true)
        expect(state.breather.energy).toBe(75)
        expect(state.tiles.map((t) => t.pos)).toEqual(
            [2, 3, 4, 5, 6].map((x) => vec2(x, 1))
        )
        expect(state.tiles.every((t) => t.effect === GUST)).toBe(true)
        run(state, Math.ceil(GUST_SECONDS * TICK_RATE))
        expect(state.tiles).toEqual([])
    })

    it("is gated by the 0.5 s cooldown", () => {
        const state = owlState(1, [])
        tick(state, true)
        // Breaths before the cooldown is over are dropped.
        for (let i = 1; i < TICK_RATE * 0.5; i++) tick(state, true)
        expect(state.breather.energy).toBe(75)
        tick(state, true)
        expect(state.breather.energy).toBe(50)
    })

    it("costs 25 and can't fire with less", () => {
        const enemy = makeEnemy(3, 1)
        const state = owlState(1, [enemy])
        state.breather.energy = 24
        tick(state, true)
        expect(state.breather.energy).toBe(24)
        expect(enemy.pos).toEqual(vec2(3, 1))
        state.breather.energy = 25
        tick(state, true)
        expect(state.breather.energy).toBe(0)
        expect(enemy.pos).toEqual(vec2(6, 1))
    })

    it("lets a pushed enemy that lands on ice slide on", () => {
        // Off the ice, the chaser would leave (5, 1) down the side loop back
        // to the player; on it, it slides on east.
        const { map, ice } = textMap([
            "##########",
            "#    ~~  #",
            "# ### ####",
            "#     ####",
            "#.########",
        ])
        const enemy = makeEnemy(2, 1, AiType.chase)
        const state = makeState(map, { x: 1, y: 1 }, [enemy], {
            ice,
            breath: owl,
        })
        state.breather.energy = 100
        tick(state, true)
        expect(enemy.pos).toEqual(vec2(5, 1))
        // One enemy move (2 cells/s): the slide step.
        run(state, TICK_RATE / 2)
        expect(enemy.pos).toEqual(vec2(6, 1))
    })
})
