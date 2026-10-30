import { describe, expect, it } from "vite-plus/test"
import { addStatus, type BreathDef } from "../breath"
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
import { ANIMALS } from "../roster"
import { vec2, type Vec2 } from "../vec2"
import { dragon } from "./dragon"
import { BREATH_ICE, FROZEN, ICE_SECONDS, penguin } from "./penguin"

// The Penguin's ice breath and its stat, end to end through step().

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
// Ticks per player move at the default speed.
const MOVE = TICK_RATE / PLAYER_SPEED

type Press = { held?: Vec2; pressed?: Vec2; breath?: boolean }

const input = ({ held, pressed, breath }: Press = {}): MoveInput => ({
    held: held ? [held] : [],
    pressed: pressed ?? none,
    breath: breath ?? false,
})

function tick(state: GameState, press: Press = {}) {
    return step(state, TICK, input(press), fixedRandom(0))
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
        expect(penguin.walksOnIce).toBe(true)
        expect(FROZEN).toMatchObject({ holds: true, harmless: true })
    })

    it("freezes an enemy for 3 s: it doesn't move or catch, then does", () => {
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.moveProgress = 1
        const state = penguinState(corridor, [enemy])
        tick(state, { breath: true })
        expect(state.players[0].breather.energy).toBe(50)
        expect(enemy.statuses).toEqual([{ status: FROZEN, left: 3 }])
        // Walking east over the new ice at x 2 onto the frozen enemy's
        // cell (floor, not iced under it), and stopping there, uncaught.
        for (let i = 0; i < TICK_RATE * 3 - 1; i++) {
            expect(tick(state, i <= MOVE ? { held: east } : {})).toBeNull()
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

    // Regression (KDA-260): a slide used to end next to a frozen enemy.
    it("lets a slide pass over a frozen enemy", () => {
        // Ice from x 2 to 5, a frozen enemy at x 4: a Dragon steps onto the
        // ice and slides over the enemy to the floor at x 6, uncaught, and
        // the enemy stays put.
        const { map, ice } = textMap([
            "########",
            "# ~~~~ #",
            "########",
            "#.######",
        ])
        const enemy = makeEnemy(4, 1, AiType.chase)
        enemy.moveProgress = 1
        addStatus(enemy, FROZEN, 100)
        const state = makeState(map, { x: 1, y: 1 }, [enemy], {
            breath: dragon,
            ice,
        })
        state.players[0].character.moveProgress = 1
        tick(state, { held: east })
        for (let i = 0; i < TICK_RATE * 2; i++) {
            expect(tick(state)).toBeNull()
            expect(enemy.pos).toEqual(vec2(4, 1))
        }
        expect(state.players[0].character.pos).toEqual(vec2(6, 1))
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

    it("makes ice that other animals slide on", () => {
        const state = penguinState()
        tick(state, { breath: true })
        expect(iceAt(state)).toEqual([vec2(2, 1), vec2(3, 1), vec2(4, 1)])
        // A Dragon in the Penguin's place: onto the ice at x 2, then on over
        // x 3 and 4 to the floor at x 5, with nothing held.
        state.players[0].breather.breath = dragon
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

describe("penguin's stat: walks on ice", () => {
    // Level ice from x 2 to 7, floor at x 8.
    const level = textMap([
        "###########",
        "# ~~~~~~  #",
        "###########",
        "#.#########",
    ])

    // The player at x 1, ready to move, on `level`.
    function iceState(breath: BreathDef) {
        const state = makeState(level.map, { x: 1, y: 1 }, [], {
            breath,
            ice: level.ice,
        })
        state.players[0].character.moveProgress = 1
        return state
    }

    const at = (state: GameState, i = 0) => state.players[i].character.pos

    it("reads as such on the character card", () => {
        expect(ANIMALS.penguin.statText).toBe("Walks on ice")
    })

    it("moves cell by cell on level ice and stops when input stops", () => {
        const state = iceState(penguin)
        // Onto the ice at x 2, then a cell per MOVE while east is held.
        tick(state, { held: east })
        expect(at(state)).toEqual(vec2(2, 1))
        run(state, MOVE - 1, { held: east })
        expect(at(state)).toEqual(vec2(2, 1))
        tick(state, { held: east })
        expect(at(state)).toEqual(vec2(3, 1))
        // Let go mid-rink: it stops there, and stays.
        run(state, TICK_RATE * 2)
        expect(at(state)).toEqual(vec2(3, 1))
        // And can walk back the way it came, a cell at a time.
        run(state, MOVE, { held: vec2(-1, 0) })
        expect(at(state)).toEqual(vec2(2, 1))
        run(state, TICK_RATE)
        expect(at(state)).toEqual(vec2(2, 1))
    })

    it("still slides for any other animal", () => {
        const state = iceState(dragon)
        tick(state, { held: east })
        run(state, TICK_RATE * 3)
        expect(at(state)).toEqual(vec2(8, 1))
    })

    it("turns on a tapped direction mid-rink, as on floor", () => {
        // A 4x2 rink of level ice, floor round it.
        const { map, ice } = textMap([
            "########",
            "#      #",
            "# ~~~~ #",
            "# ~~~~ #",
            "#      #",
            "########",
            "#.######",
        ])
        const state = makeState(map, { x: 1, y: 2 }, [], {
            breath: penguin,
            ice,
        })
        state.players[0].character.moveProgress = 1
        run(state, 1 + MOVE, { held: east })
        expect(at(state)).toEqual(vec2(3, 2))
        // A tap south mid-glide, east still held: the tap is taken at the
        // next move, then the held east again.
        tick(state, { held: east, pressed: vec2(0, 1) })
        run(state, MOVE - 2, { held: east })
        expect(at(state)).toEqual(vec2(3, 2))
        tick(state, { held: east })
        expect(at(state)).toEqual(vec2(3, 3))
        run(state, MOVE, { held: east })
        expect(at(state)).toEqual(vec2(4, 3))
        run(state, TICK_RATE)
        expect(at(state)).toEqual(vec2(4, 3))
    })

    it("on its own breath's ice too", () => {
        const state = penguinState()
        tick(state, { breath: true })
        expect(iceAt(state)).toEqual([vec2(2, 1), vec2(3, 1), vec2(4, 1)])
        tick(state, { held: east })
        run(state, TICK_RATE)
        expect(at(state)).toEqual(vec2(2, 1))
        run(state, MOVE, { held: east })
        run(state, TICK_RATE)
        expect(at(state)).toEqual(vec2(3, 1))
    })

    // Two rows of corridor; player 1 at (1, 1), player 2 at (1, 2).
    const hall = textMap([
        "##########",
        "#        #",
        "#        #",
        "##########",
        "#.########",
    ]).map

    // Step both players with their own input.
    function tick2(state: GameState, p1: Press = {}, p2: Press = {}) {
        return step(state, TICK, [input(p1), input(p2)], fixedRandom(0))
    }

    // A co-op game in the hall, player 1 with a full meter.
    function hallState(breaths: [BreathDef, BreathDef]) {
        const state = makeState(hall, [vec2(1, 1), vec2(1, 2)], [], {
            breath: breaths,
            mode: "coop",
        })
        for (const p of state.players) p.character.moveProgress = 1
        state.players[0].breather.energy = 100
        return state
    }

    // Player 1's breath east from (1, 1) covers (2, 1), then x 3 and 4 on
    // both rows.
    const hallIce = [vec2(2, 1), vec2(3, 1), vec2(3, 2), vec2(4, 1), vec2(4, 2)]

    it("in 2P, a Penguin walks and a Dragon slides, each by its own rule", () => {
        const state = hallState([penguin, dragon])
        tick2(state, { breath: true })
        expect(iceAt(state)).toEqual(hallIce)
        // Both head east and let go once on the ice. The Penguin stops on
        // the ice at x 2; the Dragon steps onto the floor at x 2, then the
        // ice at x 3, and slides over x 4 to the floor at x 5.
        tick2(state, { held: east }, { held: east })
        for (let i = 0; i < MOVE; i++) tick2(state, {}, { held: east })
        for (let i = 0; i < TICK_RATE * 2; i++) tick2(state)
        expect(at(state, 0)).toEqual(vec2(2, 1))
        expect(at(state, 1)).toEqual(vec2(5, 2))
    })

    it("on another Penguin's breath ice too", () => {
        const state = hallState([penguin, penguin])
        tick2(state, { breath: true })
        expect(iceAt(state)).toEqual(hallIce)
        // Player 2 walks over the floor at x 2 onto player 1's ice at x 3
        // and stops there.
        tick2(state, {}, { held: east })
        for (let i = 0; i < MOVE; i++) tick2(state, {}, { held: east })
        for (let i = 0; i < TICK_RATE * 2; i++) tick2(state)
        expect(at(state, 1)).toEqual(vec2(3, 2))
    })

    it("leaves the enemies sliding on ice as before", () => {
        // Level ice from x 4 to 6. A chaser that has just stepped east onto
        // the ice at x 4 slides on over x 5 and 6 to the floor at x 7, away
        // from the player it chases, whichever animal the player is.
        const { map, ice } = textMap([
            "##########",
            "#   ~~~  #",
            "##########",
            "#.########",
        ])
        const trailOf = (breath: BreathDef) => {
            const enemy = makeEnemy(4, 1, AiType.chase, { x: 3, y: 1 })
            enemy.moveProgress = 1
            const state = makeState(map, { x: 1, y: 1 }, [enemy], {
                breath,
                ice,
            })
            const xs: number[] = []
            for (let i = 0; i < TICK_RATE * 3 && xs.length < 3; i++) {
                const x = enemy.pos.x
                tick(state)
                if (enemy.pos.x !== x) xs.push(enemy.pos.x)
            }
            return xs
        }
        expect(trailOf(penguin)).toEqual([5, 6, 7])
        expect(trailOf(penguin)).toEqual(trailOf(dragon))
    })
})
