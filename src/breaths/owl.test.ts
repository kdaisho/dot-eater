import { describe, expect, it } from "vite-plus/test"
import { breathe, inPlay } from "../breath"
import { AiType, ENEMY_IDS, TICK_RATE } from "../constants"
import { step, type GameState, type MoveInput } from "../game"
import { fixedRandom, makeEnemy, makeState, textMap } from "../test/helpers"
import { vec2 } from "../vec2"
import { GUST, GUST_SECONDS, owl, windPush, windRange } from "./owl"

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
    state.players[0].breather.energy = 100
    return state
}

describe("owl wind breath", () => {
    it("pushes an enemy in the line back 2 cells with a tap", () => {
        const enemy = makeEnemy(3, 1)
        const state = owlState(1, [enemy])
        expect(tick(state, true)).toBeNull()
        expect(enemy.pos).toEqual(vec2(3 + windPush(1), 1))
        expect(enemy.pos).toEqual(vec2(5, 1))
        expect(inPlay(enemy)).toBe(true)
    })

    it("stops a pushed enemy before a wall", () => {
        const { map } = textMap(["#######", "#     #", "#######", "#.#####"])
        const enemy = makeEnemy(4, 1)
        const state = makeState(map, { x: 1, y: 1 }, [enemy], { breath: owl })
        state.players[0].breather.energy = 100
        tick(state, true)
        expect(enemy.pos).toEqual(vec2(5, 1))
    })

    it("pushes through a tunnel", () => {
        // Line from x 6: 7, 8, then through the tunnel to 0, 1.
        const enemy = makeEnemy(8, 1)
        const state = owlState(6, [enemy])
        tick(state, true)
        expect(enemy.pos).toEqual(vec2(1, 1))
    })

    it("pushes every enemy in the line, the one on the player's cell too", () => {
        const onPlayer = makeEnemy(1, 1)
        const near = makeEnemy(2, 1, AiType.random, undefined, ENEMY_IDS[1])
        const far = makeEnemy(4, 1, AiType.random, undefined, ENEMY_IDS[2])
        const state = owlState(1, [onPlayer, near, far])
        tick(state, true)
        expect(onPlayer.pos).toEqual(vec2(3, 1))
        expect(near.pos).toEqual(vec2(4, 1))
        expect(far.pos).toEqual(vec2(6, 1))
    })

    it("doesn't catch the player with a 1-cell push off its cell", () => {
        // The enemy is on the player's cell (2, 1), its sprite still
        // gliding in from (1, 1); a wall at (4, 1) lets it go 1 cell. Gliding
        // in from (2, 1) would draw it on the player.
        const { map } = textMap(["#####", "#   #", "#####", "#.###"])
        const glidingIn = () => {
            const enemy = makeEnemy(2, 1, AiType.random, { x: 1, y: 1 })
            enemy.moveProgress = 0.1
            return enemy
        }
        const without = makeState(map, { x: 2, y: 1 }, [glidingIn()], {
            breath: owl,
        })
        expect(tick(without)).toBeNull()
        const enemy = glidingIn()
        const state = makeState(map, { x: 2, y: 1 }, [enemy], { breath: owl })
        state.players[0].breather.energy = 100
        expect(tick(state, true)).toBeNull()
        expect(enemy.pos).toEqual(vec2(3, 1))
        expect(state.players[0].health).toBe(1)
    })

    it("leaves enemies out of the line alone", () => {
        // Below the line, and in the corridor behind the player.
        const below = makeEnemy(4, 2)
        const behind = makeEnemy(0, 1, AiType.random, undefined, ENEMY_IDS[1])
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
        expect(state.players[0].score).toBe(0)
        expect(state.players[0].breather.energy).toBe(90)
    })

    it("fires with nobody in the line, showing a short gust", () => {
        const state = owlState(1, [])
        tick(state, true)
        expect(state.players[0].breather.energy).toBe(90)
        expect(state.tiles.map((t) => t.pos)).toEqual(
            [2, 3, 4, 5].map((x) => vec2(x, 1))
        )
        expect(state.tiles.every((t) => t.effect === GUST)).toBe(true)
        run(state, Math.ceil(GUST_SECONDS * TICK_RATE))
        expect(state.tiles).toEqual([])
    })

    it("refuses facing a wall with nobody on the player's cell", () => {
        const { map } = textMap(["####", "#. #", "####"])
        const state = makeState(map, { x: 2, y: 1 }, [], { breath: owl })
        state.players[0].breather.energy = 100
        tick(state, true)
        expect(state.players[0].breather.energy).toBe(100)
        expect(state.players[0].breather.cooldown).toBe(0)
        expect(state.tiles).toEqual([])
    })

    it("is gated by the 0.5 s cooldown", () => {
        const state = owlState(1, [])
        tick(state, true)
        // Breaths before the cooldown is over are dropped.
        for (let i = 1; i < TICK_RATE * 0.5; i++) tick(state, true)
        expect(state.players[0].breather.energy).toBe(90)
        tick(state, true)
        expect(state.players[0].breather.energy).toBe(80)
    })

    it("costs 10 for a tap and can't fire with less", () => {
        const enemy = makeEnemy(3, 1)
        const state = owlState(1, [enemy])
        state.players[0].breather.energy = 9
        tick(state, true)
        expect(state.players[0].breather.energy).toBe(9)
        expect(enemy.pos).toEqual(vec2(3, 1))
        state.players[0].breather.energy = 10
        tick(state, true)
        expect(state.players[0].breather.energy).toBe(0)
        expect(enemy.pos).toEqual(vec2(5, 1))
    })

    it("lets a pushed enemy that lands on ice slide on", () => {
        // Off the ice, the chaser would head back west to the player; on
        // it, it slides on east.
        const { map, ice } = textMap([
            "##########",
            "#   ~~   #",
            "# ### ####",
            "#     ####",
            "#.########",
        ])
        const enemy = makeEnemy(2, 1, AiType.chase)
        const state = makeState(map, { x: 1, y: 1 }, [enemy], {
            ice,
            breath: owl,
        })
        state.players[0].breather.energy = 100
        tick(state, true)
        expect(enemy.pos).toEqual(vec2(4, 1))
        // One enemy move (2 cells/s): the slide step.
        run(state, TICK_RATE / 2)
        expect(enemy.pos).toEqual(vec2(5, 1))
    })
})

describe("the Owl's charged breath (KDA-289)", () => {
    // A hall 13 cells long, the player at its west end facing east.
    const hall = textMap([
        "###############",
        "#             #",
        "###############",
        "#.#############",
    ]).map

    it("reaches 4 cells and pushes 2 for a tap, one more of each a level", () => {
        const levels = [1, 2, 3, 4, 5]
        expect(levels.map(windRange)).toEqual([4, 5, 6, 7, 8])
        expect(levels.map(windPush)).toEqual([2, 3, 4, 5, 6])
    })

    it.each([1, 2, 3, 4, 5])(
        "blows further at level %i, for 10 energy a level",
        (level) => {
            // Just inside the line's reach.
            const enemy = makeEnemy(1 + windRange(level), 1)
            const state = makeState(hall, { x: 1, y: 1 }, [enemy], {
                breath: owl,
            })
            state.players[0].breather.energy = 100
            expect(breathe(state, state.players[0], level)).toBe(true)
            expect(enemy.pos).toEqual(
                vec2(Math.min(13, 1 + windRange(level) + windPush(level)), 1)
            )
            expect(state.tiles).toHaveLength(windRange(level))
            expect(state.players[0].breather.energy).toBe(100 - 10 * level)
        }
    )
})
