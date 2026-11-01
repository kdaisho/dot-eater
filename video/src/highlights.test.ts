import { describe, expect, it } from "vite-plus/test"
import { addTileEffect, CHARGE_SECONDS, type BreathDef } from "../../src/breath"
import { BREATHS } from "../../src/breaths"
import { BURNING } from "../../src/breaths/dragon"
import { AiType, Cell, TICK_MS } from "../../src/constants"
import { IDLE, step, type GameState } from "../../src/game"
import {
    cloneState,
    fixedRandom,
    makeBoss,
    makeEnemy,
    makeState,
    textMap,
} from "../../src/test/helpers"
import { vec2, type Vec2 } from "../../src/vec2"
import { heroOf, momentsOf, type Moment } from "./highlights"

const DT = TICK_MS / 1000

// A corridor along row 1, walled in, with a second one along row 3 whose
// dots keep the game going.
const CORRIDORS = textMap([
    "#########",
    "#       #",
    "#########",
    "#.......#",
    "#########",
]).map

// A 2-row hall, room for a boss.
const HALL = textMap(["#########", "#       #", "#.......#", "#########"]).map

// Player 1 as `breath`, at `at` facing `facing`, with a full meter.
function ready(state: GameState, breath: BreathDef, facing: Vec2): GameState {
    const me = state.players[0]
    me.breather.breath = breath
    me.breather.facing = facing
    me.breather.energy = breath.maxEnergy
    return state
}

// One tick, player 1 breathing if `breath` (a tap, or let go at charge
// `level`; see chargeTick): the moments it makes.
function tick(state: GameState, breath = true, level = 1): Moment[] {
    const before = cloneState(state)
    if (breath && level > 1) {
        state.players[0].breather.charge = (level - 1) * CHARGE_SECONDS
    }
    const input =
        breath && level > 1
            ? { ...IDLE, breath: false, breathHeld: false }
            : { ...IDLE, breath }
    step(state, DT, input, fixedRandom(0))
    return momentsOf(before, state, state.events, 1)
}

const kinds = (moments: readonly Moment[]) => moments.map((m) => m.kind)

describe("momentsOf", () => {
    it("reports a breath and the enemy it defeats, framed between them", () => {
        const state = ready(
            makeState(CORRIDORS, { x: 1, y: 1 }, [makeEnemy(4, 1)]),
            BREATHS.dragon,
            vec2(1, 0)
        )
        const moments = tick(state)
        expect(kinds(moments)).toEqual(["breathed", "enemyDefeated"])
        expect(moments[0]).toMatchObject({
            tick: 1,
            player: 0,
            animal: "dragon",
            at: vec2(1, 1),
        })
        expect(moments[1]).toMatchObject({
            player: 0,
            enemy: 0,
            at: vec2(4, 1),
            // Halfway from the dragon's centre to the enemy's.
            focus: vec2(3, 1.5),
        })
    })

    it("finds enemies frozen by the Penguin's ice", () => {
        const state = ready(
            makeState(CORRIDORS, { x: 1, y: 1 }, [
                makeEnemy(3, 1),
                makeEnemy(4, 1),
            ]),
            BREATHS.penguin,
            vec2(1, 0)
        )
        const frozen = tick(state, true, 3).filter(
            (m) => m.kind === "enemyFrozen"
        )
        expect(frozen.map((m) => [m.enemy, m.at, m.player])).toEqual([
            [0, vec2(3, 1), 0],
            [1, vec2(4, 1), 0],
        ])
        // Still frozen on the next tick: nothing new.
        expect(kinds(tick(state, false))).not.toContain("enemyFrozen")
    })

    it("finds an enemy the Owl's wind threw back, where it landed", () => {
        const state = ready(
            makeState(CORRIDORS, { x: 1, y: 1 }, [makeEnemy(2, 1)]),
            BREATHS.owl,
            vec2(1, 0)
        )
        // Level 2 blows it back 3 cells (see windPush).
        const blown = tick(state, true, 2).filter(
            (m) => m.kind === "enemyBlown"
        )
        expect(blown).toHaveLength(1)
        expect(blown[0]).toMatchObject({ player: 0, enemy: 0, at: vec2(5, 1) })
    })

    it("doesn't take an enemy walking on as blown back", () => {
        const enemy = makeEnemy(4, 1, AiType.random, { x: 3, y: 1 })
        enemy.moveProgress = 1
        const state = makeState(CORRIDORS, { x: 1, y: 3 }, [enemy])
        const moments = tick(state, false)
        expect(state.enemies[0].pos).not.toEqual(vec2(4, 1))
        expect(moments).toEqual([])
    })

    it("finds a wall the Boar broke, though no event reports it", () => {
        const state = ready(
            makeState(CORRIDORS, { x: 2, y: 1 }),
            BREATHS.boar,
            vec2(0, 1)
        )
        const moments = tick(state)
        expect(state.cells[2][2]).not.toBe(Cell.wall)
        expect(state.events.map((e) => e.type)).toEqual(["breathed"])
        expect(moments.find((m) => m.kind === "wallBroken")).toMatchObject({
            tick: 1,
            player: 0,
            at: vec2(2, 2),
            focus: vec2(2.5, 2.5),
        })
    })

    it("finds an enemy turning back from a cell it can't enter", () => {
        // Walking right, into a cell that blocks enemies.
        const enemy = makeEnemy(4, 1, AiType.random, { x: 3, y: 1 })
        enemy.moveProgress = 1
        const state = makeState(CORRIDORS, { x: 1, y: 3 }, [enemy])
        addTileEffect(state, vec2(5, 1), BURNING, 2)
        const moments = tick(state, false)
        expect(state.enemies[0].pos).toEqual(vec2(3, 1))
        expect(moments).toEqual([
            {
                tick: 1,
                kind: "enemyRepelled",
                enemy: 0,
                at: vec2(4, 1),
                focus: vec2(4.5, 1.5),
            },
        ])
    })

    it("reports the boss hit, then defeated, at its centre", () => {
        const state = ready(
            makeState(HALL, { x: 1, y: 1 }, [], { boss: makeBoss(4, 1) }),
            BREATHS.dragon,
            vec2(1, 0)
        )
        state.boss!.health = 4
        const hit = tick(state, true, 3).find((m) => m.kind === "bossHit")
        expect(hit).toMatchObject({ player: 0, at: vec2(4, 1) })
        expect(hit?.focus).toEqual(vec2(5, 2))
        state.players[0].breather.cooldown = 0
        const boss = state.boss!
        state.players[0].breather.energy = BREATHS.dragon.maxEnergy
        const down = tick(state, true, 3).find((m) => m.kind === "bossDefeated")
        expect(down).toMatchObject({ player: 0, at: boss.pos })
    })
})

describe("heroOf", () => {
    const at = vec2(0, 0)
    const moments: Moment[] = [
        { tick: 5, kind: "nearMiss", at, focus: at, distance: 0.9 },
        { tick: 9, kind: "enemyFrozen", at, focus: at },
        { tick: 12, kind: "nearMiss", at, focus: at, distance: 0.7 },
        { tick: 20, kind: "enemyFrozen", at, focus: at },
    ]

    it("is the first moment of the kind", () => {
        expect(heroOf(moments, "enemyFrozen")?.tick).toBe(9)
    })

    it("is the closest near miss", () => {
        expect(heroOf(moments, "nearMiss")?.tick).toBe(12)
    })

    it("is undefined when there is none", () => {
        expect(heroOf(moments, "bossDefeated")).toBeUndefined()
    })
})
