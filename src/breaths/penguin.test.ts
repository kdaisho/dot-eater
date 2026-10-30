import { describe, expect, it } from "vite-plus/test"
import { addStatus } from "../breath"
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
    state.players[0].breather.energy = 100
    state.players[0].character.moveProgress = 1
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
        expect(FROZEN).toMatchObject({ holds: true, harmless: true })
    })

    it("freezes an enemy for 3 s: it doesn't move or catch, then does", () => {
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.moveProgress = 1
        const state = penguinState(corridor, [enemy])
        tick(state, { breath: true })
        expect(state.players[0].breather.energy).toBe(50)
        expect(enemy.statuses).toEqual([{ status: FROZEN, left: 3 }])
        // One step east onto the new ice at x 2, and the slide carries the
        // player on onto the frozen enemy's cell (floor, not iced under
        // it), where it stops, uncaught.
        tick(state, { held: east })
        for (let i = 0; i < TICK_RATE * 3 - 2; i++) {
            expect(tick(state)).toBeNull()
            expect(enemy.pos).toEqual(vec2(3, 1))
        }
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        // Thawed, it catches the player on its cell at once, as any enemy
        // that stops being harmless there would.
        expect(ticksUntilCaught(state, none, 1)).toBe(1)
        expect(enemy.statuses).toEqual([])
    })

    // Regression (KDA-260): a frozen enemy blocked the player like a wall,
    // so it stopped at x 2.
    it("lets the player walk on past a frozen enemy", () => {
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.moveProgress = 1
        const state = penguinState(corridor, [enemy])
        tick(state, { breath: true })
        // East held: onto the ice at x 2, over the enemy at x 3, onto the
        // ice at x 4 and on to the wall. The enemy is held all the while.
        for (let i = 0; i < TICK_RATE * 2; i++) {
            expect(tick(state, { held: east })).toBeNull()
            expect(enemy.pos).toEqual(vec2(3, 1))
        }
        expect(state.players[0].character.pos).toEqual(vec2(8, 1))
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
        state.players[0].breather.energy = 100
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
        expect(state.players[0].character.pos).toEqual(vec2(5, 1))
        run(state, MOVE * 2)
        expect(state.players[0].character.pos).toEqual(vec2(5, 1))
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
        state.players[0].breather.energy = 49
        tick(state, { breath: true })
        expect(state.players[0].breather.energy).toBe(49)
        expect(enemy.statuses).toEqual([])
        expect(state.tiles).toEqual([])
    })

    it("keeps the energy when facing straight into a wall", () => {
        const state = penguinState()
        state.players[0].breather.facing = vec2(-1, 0)
        tick(state, { breath: true })
        expect(state.players[0].breather.energy).toBe(100)
        expect(state.players[0].breather.cooldown).toBe(0)
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

    // The player at x 1, ready to move, on `level` (default: the one above).
    function slideState(
        breath = penguin,
        { map, ice } = level,
        enemies: Character[] = []
    ) {
        const state = makeState(map, { x: 1, y: 1 }, enemies, { breath, ice })
        state.players[0].character.moveProgress = 1
        return state
    }

    // Press east once, then let go until the player comes to rest. Returns
    // each of its glides as [the x it glides into, its speed as a factor of
    // the normal one]: MOVE over the ticks from arriving there to moving on
    // (or coming to rest).
    function glideRates(state: GameState): [number, number][] {
        tick(state, { held: east })
        const rates: [number, number][] = []
        let x = state.players[0].character.pos.x
        let ticks = 0
        for (let i = 0; i < TICK_RATE * 5; i++) {
            tick(state)
            ticks++
            const moved = state.players[0].character.pos.x !== x
            if (moved || state.players[0].character.moveProgress >= 1) {
                rates.push([x, MOVE / ticks])
                if (!moved) return rates
                x = state.players[0].character.pos.x
                ticks = 0
            }
        }
        throw new Error("Never came to rest")
    }

    it("slides 1.5x as fast as normal", () => {
        // The player's own step onto the ice, at x 2, is at normal speed;
        // only the slide steps after it, x 3 to the floor at x 8, are
        // faster.
        expect(glideRates(slideState())).toEqual([
            [2, 1],
            [3, 1.5],
            [4, 1.5],
            [5, 1.5],
            [6, 1.5],
            [7, 1.5],
            [8, 1.5],
        ])
    })

    // Regression (KDA-260): the slide used to end next to a frozen enemy.
    it("slides faster over a frozen enemy too, not on the step onto the ice", () => {
        // Ice from x 2 to 5, a frozen enemy at x 4: the slide passes over it
        // to the floor at x 6.
        const short = textMap(["########", "# ~~~~ #", "########", "#.######"])
        const enemy = makeEnemy(4, 1)
        addStatus(enemy, FROZEN, 100)
        expect(glideRates(slideState(penguin, short, [enemy]))).toEqual([
            [2, 1],
            [3, 1.5],
            [4, 1.5],
            [5, 1.5],
            [6, 1.5],
        ])
    })

    it("only on ice, and only for the Penguin", () => {
        expect(glideRates(slideState(dragon)).every(([, r]) => r === 1)).toBe(
            true
        )
        const state = makeState(corridor, { x: 1, y: 1 }, [], {
            breath: penguin,
        })
        state.players[0].character.moveProgress = 1
        run(state, 1 + MOVE * 2, { held: east })
        expect(state.players[0].character.pos).toEqual(vec2(4, 1))
        tick(state, { held: east })
        expect(state.players[0].character.pos).toEqual(vec2(4, 1))
    })

    it("on the breath's own ice too", () => {
        const state = penguinState()
        tick(state, { breath: true })
        // Onto the new ice at x 2 at the normal pace, then sliding to x 3, 4
        // and the floor at x 5 at the faster one.
        expect(glideRates(state)).toEqual([
            [2, 1],
            [3, 1.5],
            [4, 1.5],
            [5, 1.5],
        ])
    })
})
