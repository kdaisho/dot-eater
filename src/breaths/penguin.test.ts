import { describe, expect, it } from "vite-plus/test"
import type { Character } from "../character"
import { AiType, PLAYER_SPEED, TICK_RATE } from "../constants"
import { step, type GameState, type MoveInput } from "../game"
import type { IceMap } from "../ice"
import {
    fixedRandom,
    makeEnemy,
    makeState,
    textMap,
    type MapLiteral,
    ticksUntilCaught,
} from "../test/helpers"
import { vec2, type Vec2 } from "../vec2"
import { dragon } from "./dragon"
import { BREATH_ICE, FROZEN, ICE_SECONDS, penguin } from "./penguin"

// The Penguin's ice breath and its stat, end to end through step().

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
// Ticks per player move at the default speed.
const MOVE = TICK_RATE / PLAYER_SPEED

type Press = { held?: Vec2; breath?: boolean }

function tick(state: GameState, { held, breath }: Press = {}) {
    const move: MoveInput = {
        held: held ? [held] : [],
        pressed: none,
        breath: breath ?? false,
    }
    return step(state, TICK, move, fixedRandom(0))
}

function run(state: GameState, n: number, press: Press = {}) {
    for (let i = 0; i < n; i++) tick(state, press)
}

// A corridor along row 1, walled at both ends, with a dot shut away in a
// wall pocket (bottom row) so the game isn't won by clearing every dot.
const corridor = textMap([
    "##########",
    "#        #",
    "##########",
    "#.########",
]).map

const iceAt = (state: GameState) =>
    state.tiles
        .filter((t) => t.effect === BREATH_ICE)
        .map((t) => t.pos)
        .sort((a, b) => a.x - b.x || a.y - b.y)

// The Penguin at x 1 on row 1 with a full meter, ready to move.
function penguinState(
    map: MapLiteral = corridor,
    enemies: Character[] = [],
    ice?: IceMap
) {
    const state = makeState(map, { x: 1, y: 1 }, enemies, {
        breath: penguin,
        ...(ice ? { ice } : {}),
    })
    state.breather.energy = 100
    state.player.moveProgress = 1
    return state
}

describe("penguin's ice breath", () => {
    it("has the issue's numbers", () => {
        expect(penguin.shape).toEqual({ kind: "cone", range: 3 })
        expect(penguin.cost).toBe(50)
        expect(penguin.cooldown).toBe(1)
        expect(penguin.duration).toBe(3)
        expect(penguin.maxEnergy).toBe(100)
        expect(penguin.slideSpeedScale).toBe(1.5)
        expect(FROZEN).toMatchObject({
            holds: true,
            harmless: true,
            solid: true,
        })
    })

    it("freezes an enemy for 3 s: it doesn't move or catch, then does", () => {
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.moveProgress = 1
        const state = penguinState(corridor, [enemy])
        tick(state, { breath: true })
        expect(state.breather.energy).toBe(50)
        expect(enemy.statuses).toEqual([{ status: FROZEN, left: 3 }])
        // Walking east into it: onto the new ice at x 2, and the slide
        // stops against the frozen enemy, uncaught.
        for (let i = 0; i < TICK_RATE * 3 - 1; i++) {
            expect(tick(state, { held: east })).toBeNull()
            expect(enemy.pos).toEqual(vec2(3, 1))
        }
        expect(state.player.pos).toEqual(vec2(2, 1))
        // Thawed, it steps at once towards the player next to it, and
        // catches it as soon as it has glided close enough.
        tick(state, { held: east })
        expect(enemy.statuses).toEqual([])
        expect(enemy.pos).toEqual(vec2(2, 1))
        expect(ticksUntilCaught(state, east, MOVE)).toBeGreaterThan(0)
    })

    it("lets walls cast the cone's shadow", () => {
        // From (1, 3) facing east the cone covers x 2 (1 cell), x 3 (3) and
        // x 4 (5). The wall at (3, 4) shades (4, 5) behind it.
        const { map } = textMap([
            "#######",
            "#     #",
            "#     #",
            "#     #",
            "#  #  #",
            "#     #",
            "#######",
            "#.#####",
        ])
        const lit = makeEnemy(4, 1)
        const shaded = makeEnemy(4, 5)
        const state = makeState(map, { x: 1, y: 3 }, [lit, shaded], {
            breath: penguin,
        })
        state.breather.energy = 100
        tick(state, { breath: true })
        expect(lit.statuses.map((s) => s.status)).toEqual([FROZEN])
        expect(shaded.statuses).toEqual([])
        // Ice on every covered cell but the frozen enemy's.
        expect(iceAt(state)).toEqual([
            vec2(2, 3),
            vec2(3, 2),
            vec2(3, 3),
            vec2(4, 2),
            vec2(4, 3),
            vec2(4, 4),
        ])
        expect(state.ice[1][4]).toBe(false)
        expect(state.ice[5][4]).toBe(false)
    })

    it("turns the covered floor to ice for 5 s, not under anyone", () => {
        const enemy = makeEnemy(3, 1)
        const state = penguinState(corridor, [enemy])
        tick(state, { breath: true })
        expect(iceAt(state)).toEqual([vec2(2, 1), vec2(4, 1)])
        expect(state.ice[1].slice(0, 6)).toEqual([
            false,
            false,
            true,
            false,
            true,
            false,
        ])
        run(state, TICK_RATE * ICE_SECONDS - 1)
        expect(state.ice[1][2]).toBe(true)
        tick(state)
        expect(state.ice[1][2]).toBe(false)
        expect(state.ice[1][4]).toBe(false)
        expect(state.tiles).toEqual([])
    })

    it("makes ice the player slides on", () => {
        const state = penguinState()
        tick(state, { breath: true })
        expect(iceAt(state)).toEqual([vec2(2, 1), vec2(3, 1), vec2(4, 1)])
        // Onto the ice at x 2, then on over x 3 and 4 to the floor at x 5,
        // with nothing held.
        tick(state, { held: east })
        run(state, MOVE * 3)
        expect(state.player.pos).toEqual(vec2(5, 1))
        run(state, MOVE * 2)
        expect(state.player.pos).toEqual(vec2(5, 1))
    })

    it("leaves a frozen enemy on ice in place, sliding on once it thaws", () => {
        // Level ice at x 4 and 5. The enemy has just moved east onto x 4,
        // so it is sliding, when the breath freezes it.
        const { map, ice } = textMap([
            "##########",
            "#   ~~   #",
            "##########",
            "#.########",
        ])
        const enemy = makeEnemy(4, 1, AiType.chase, { x: 3, y: 1 })
        enemy.moveProgress = 1
        const state = penguinState(map, [enemy], ice)
        tick(state, { breath: true })
        run(state, TICK_RATE * 3 - 1)
        expect(enemy.pos).toEqual(vec2(4, 1))
        // Thawed, it slides on east, away from the player it chases, over
        // x 5 to the floor at x 6.
        tick(state)
        expect(enemy.pos).toEqual(vec2(5, 1))
        while (enemy.pos.x === 5) tick(state)
        expect(enemy.pos).toEqual(vec2(6, 1))
    })

    it("does nothing without enough energy", () => {
        const enemy = makeEnemy(3, 1)
        const state = penguinState(corridor, [enemy])
        state.breather.energy = 49
        tick(state, { breath: true })
        expect(state.breather.energy).toBe(49)
        expect(enemy.statuses).toEqual([])
        expect(state.tiles).toEqual([])
    })

    it("keeps the energy when facing straight into a wall", () => {
        const state = penguinState()
        state.breather.facing = vec2(-1, 0)
        tick(state, { breath: true })
        expect(state.breather.energy).toBe(100)
        expect(state.breather.cooldown).toBe(0)
    })
})

describe("penguin's stat: slides faster on ice", () => {
    // Level ice from x 2 to 7, floor at x 8.
    const level = textMap([
        "###########",
        "# ~~~~~~  #",
        "###########",
        "#.#########",
    ])

    // Ticks until the player, starting at x 1 and pressing east once,
    // reaches x 8.
    function ticksToEnd(breath = penguin): number {
        const state = makeState(level.map, { x: 1, y: 1 }, [], {
            breath,
            ice: level.ice,
        })
        state.player.moveProgress = 1
        tick(state, { held: east })
        for (let i = 2; i < TICK_RATE * 5; i++) {
            tick(state)
            if (state.player.pos.x === 8) return i
        }
        throw new Error("Never reached the end")
    }

    it("slides 1.5x as fast as normal", () => {
        // The first move, onto the ice, is at normal speed; the six slide
        // steps after it take MOVE / 1.5 ticks each.
        expect(ticksToEnd()).toBe(1 + (6 * MOVE) / 1.5)
    })

    it("only on ice, and only for the Penguin", () => {
        expect(ticksToEnd(dragon)).toBe(1 + 6 * MOVE)
        const state = makeState(corridor, { x: 1, y: 1 }, [], {
            breath: penguin,
        })
        state.player.moveProgress = 1
        run(state, 1 + MOVE * 2, { held: east })
        expect(state.player.pos).toEqual(vec2(4, 1))
        tick(state, { held: east })
        expect(state.player.pos).toEqual(vec2(4, 1))
    })

    it("on the breath's own ice too", () => {
        const state = penguinState()
        tick(state, { breath: true })
        // Onto the new ice at x 2 at tick 2, then x 3, 4 and the floor at
        // x 5 at the faster pace.
        tick(state, { held: east })
        run(state, (3 * MOVE) / 1.5 - 1)
        expect(state.player.pos).toEqual(vec2(4, 1))
        tick(state)
        expect(state.player.pos).toEqual(vec2(5, 1))
    })
})
