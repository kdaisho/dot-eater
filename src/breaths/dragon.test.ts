import { describe, expect, it } from "vite-plus/test"
import { inPlay } from "../breath"
import type { Character } from "../character"
import { AiType, DEFEAT_POINTS, PLAYER_SPEED, TICK_RATE } from "../constants"
import { step, type GameState } from "../game"
import { fixedRandom, makeEnemy, makeState, textMap } from "../test/helpers"
import { vec2, type Vec2 } from "../vec2"
import { BURNING, dragon } from "./dragon"

// The Dragon's fire breath end to end through step().

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
const west = vec2(-1, 0)
// Ticks per player move at the default speed.
const MOVE = TICK_RATE / PLAYER_SPEED

type Press = { held?: Vec2; breath?: boolean }

function tick(state: GameState, { held, breath }: Press = {}) {
    return step(
        state,
        TICK,
        { held: held ? [held] : [], pressed: held ?? none, breath: !!breath },
        fixedRandom(0)
    )
}

function run(state: GameState, n: number, press: Press = {}) {
    for (let i = 0; i < n; i++) tick(state, press)
}

// The x of every burning cell, in the order they were lit.
function burning(state: GameState): number[] {
    return state.tiles
        .filter((t) => t.effect.name === BURNING.name)
        .map((t) => t.pos.x)
}

// Maps keep a dot shut away in a wall pocket (bottom row), so the game isn't
// won by clearing every dot.
const long = textMap([
    "##########",
    "#        #",
    "##########",
    "#.########",
]).map

// A Dragon game on `map` with a full energy meter.
function dragonState(
    player: { x: number; y: number },
    enemies: Character[] = [],
    map = long
) {
    const state = makeState(map, player, enemies, { breath: dragon })
    state.breather.energy = dragon.maxEnergy
    return state
}

describe("dragon fire breath", () => {
    it("defeats the first enemy in line and burns up to it", () => {
        const first = makeEnemy(3, 1)
        const behind = makeEnemy(4, 1)
        const state = dragonState({ x: 1, y: 1 }, [first, behind])
        tick(state, { breath: true })
        expect(inPlay(first)).toBe(false)
        expect(inPlay(behind)).toBe(true)
        expect(behind.pos).toEqual(vec2(4, 1))
        expect(state.score).toBe(DEFEAT_POINTS)
        expect(state.breather.energy).toBe(dragon.maxEnergy - dragon.cost)
        // The fire stopped at the enemy: x 2 and 3 burn, not beyond.
        expect(burning(state)).toEqual([2, 3])
    })

    it("burns the whole line when it hits nobody", () => {
        const state = dragonState({ x: 1, y: 1 })
        tick(state, { breath: true })
        expect(burning(state)).toEqual([2, 3, 4, 5, 6])
        expect(state.breather.energy).toBe(dragon.maxEnergy - dragon.cost)
    })

    it("counts an enemy on the player's own cell as the first hit", () => {
        // Still gliding in from x 2, so it hasn't touched the player yet.
        const onPlayer = makeEnemy(1, 1, AiType.random, { x: 2, y: 1 })
        onPlayer.moveProgress = 0
        const ahead = makeEnemy(3, 1)
        const state = dragonState({ x: 1, y: 1 }, [onPlayer, ahead])
        expect(tick(state, { breath: true })).toBeNull()
        expect(inPlay(onPlayer)).toBe(false)
        expect(inPlay(ahead)).toBe(true)
        expect(state.score).toBe(DEFEAT_POINTS)
        // The fire never left the player's cell.
        expect(burning(state)).toEqual([])
    })

    it("is stopped by walls", () => {
        const { map } = textMap([
            "##########",
            "#  #     #",
            "##########",
            "#.########",
        ])
        const beyond = makeEnemy(4, 1)
        const state = dragonState({ x: 1, y: 1 }, [beyond], map)
        tick(state, { breath: true })
        expect(inPlay(beyond)).toBe(true)
        expect(state.score).toBe(0)
        expect(burning(state)).toEqual([2])
    })

    it("refuses, for free, when facing a wall with nothing to hit", () => {
        const state = dragonState({ x: 8, y: 1 })
        tick(state, { breath: true })
        expect(burning(state)).toEqual([])
        expect(state.breather.energy).toBe(dragon.maxEnergy)
        expect(state.breather.cooldown).toBe(0)
    })

    it("wraps through a tunnel", () => {
        const { map } = textMap([
            "#########",
            "         ",
            "#########",
            "#.#######",
        ])
        const enemy = makeEnemy(7, 1)
        const state = dragonState({ x: 1, y: 1 }, [enemy], map)
        state.breather.facing = west
        tick(state, { breath: true })
        expect(inPlay(enemy)).toBe(false)
        expect(state.score).toBe(DEFEAT_POINTS)
        expect(burning(state)).toEqual([0, 8, 7])
    })

    it("does nothing and spends nothing without enough energy", () => {
        const enemy = makeEnemy(3, 1)
        const state = dragonState({ x: 1, y: 1 }, [enemy])
        state.breather.energy = dragon.cost - 5
        tick(state, { breath: true })
        expect(inPlay(enemy)).toBe(true)
        expect(state.score).toBe(0)
        expect(burning(state)).toEqual([])
        expect(state.breather.energy).toBe(dragon.cost - 5)
        expect(state.breather.cooldown).toBe(0)
    })

    it("leaves burning cells that block enemies for 2 s, then don't", () => {
        // The chaser at x 8 heads for the player, but x 2 to 6 burn.
        const chaser = makeEnemy(8, 1, AiType.chase)
        const state = dragonState({ x: 1, y: 1 }, [chaser])
        tick(state, { breath: true })
        expect(inPlay(chaser)).toBe(true)
        for (let i = 0; i < TICK_RATE * 2 - 2; i++) {
            expect(tick(state)).toBeNull()
            expect(chaser.pos.x).toBeGreaterThanOrEqual(7)
        }
        run(state, 2)
        expect(burning(state)).toEqual([])
        // Out, it comes for the player.
        run(state, TICK_RATE)
        expect(chaser.pos.x).toBeLessThan(7)
    })

    it("lets the player walk through it while it keeps an enemy out", () => {
        // The chaser, past the line's reach, would otherwise meet the
        // player head on in the corridor.
        const chaser = makeEnemy(8, 1, AiType.chase)
        const state = dragonState({ x: 1, y: 1 }, [chaser])
        tick(state, { breath: true })
        expect(burning(state)).toEqual([2, 3, 4, 5, 6])
        for (let i = 0; i < MOVE * 4; i++) {
            expect(tick(state, { held: east })).toBeNull()
        }
        expect(state.player.pos.x).toBeGreaterThanOrEqual(5)
        expect(chaser.pos.x).toBeGreaterThanOrEqual(7)
    })
})
