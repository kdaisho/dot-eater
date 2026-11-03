import { describe, expect, it } from "vite-plus/test"
import { bossDamage, inFootprint } from "./boss"
import { CHARGE_SECONDS, MAX_CHARGE } from "./breath"
import { BREATHS } from "./breaths"
import { Cell, TICK_RATE } from "./constants"
import { DIFFICULTIES, type Difficulty } from "./difficulty"
import { createGameState, IDLE, step, type GameState } from "./game"
import { parseLevel, type LevelData } from "./level"
import { stage10 } from "./levels/stage10"
import { stage5 } from "./levels/stage5"
import { ANIMAL_IDS, type AnimalId } from "./roster"
import { fixedRandom, withoutBreath } from "./test/helpers"
import { allDirections, directions, vec2, type Vec2 } from "./vec2"

// Every character can defeat both bosses (KDA-304, after feedback that the
// Boar couldn't: "every character needs to be able to finish the game").
// A scripted fight through the real step, per animal, per boss stage, at
// every difficulty: the boss held still with its breath off and no minions
// about, the player standing in line with it and breathing at it, its meter
// filled before each breath as eating dots would. So these guard the
// damage each breath does the boss, from the range it can do it from, not
// the dodging: a later balance change that leaves a character unable to
// hurt a boss, or hurting it far less than the others, fails here.

const TICK = 1 / TICK_RATE

const BOSS_STAGES: readonly [string, LevelData][] = [
    ["stage 5", stage5],
    ["stage 10", stage10],
]

// The furthest a tap reaches each animal's way, in cells along its
// facing, to the nearest cell of the boss: the Dragon's spread, the
// Penguin's cone and the Skunk's cloud 2, the Owl's wind 4, and the Boar's
// Rush 1 (it dashes right up to it).
const TAP_REACH: Readonly<Record<AnimalId, number>> = {
    dragon: 2,
    penguin: 2,
    owl: 4,
    skunk: 2,
    boar: 1,
}

// From a full charge every animal reaches 2 cells at least (the Rush 3).
const CHARGED_REACH = 2

// The boss's stage at `difficulty` as `animal`, alone with the boss: no
// minions, the boss still and never breathing.
function arena(data: LevelData, difficulty: Difficulty, animal: AnimalId) {
    const level = parseLevel(data, difficulty)
    const state = createGameState(level, animal, "solo", difficulty)
    state.enemies = []
    state.spawns.enemies = []
    const boss = withoutBreath(state.boss!)
    boss.speed = 0
    boss.moveProgress = 0
    return state
}

// A cell `distance` cells from the boss's footprint, in line with it, with
// open floor all the way to it, and the way to face it: where a player
// stands to breathe at it from that far. The first in direction order.
function standing(
    state: GameState,
    distance: number
): { at: Vec2; facing: Vec2 } {
    const boss = state.boss!
    const open = (p: Vec2) =>
        state.cells[p.y]?.[p.x] !== undefined &&
        state.cells[p.y][p.x] !== Cell.wall &&
        !inFootprint(boss.pos, p)
    for (const dir of allDirections) {
        const facing = directions[dir]
        // Each of the footprint's cells on the side facing the player.
        for (const side of [0, 1]) {
            const edge = vec2(
                boss.pos.x + (facing.x < 0 ? 1 : facing.x > 0 ? 0 : side),
                boss.pos.y + (facing.y < 0 ? 1 : facing.y > 0 ? 0 : side)
            )
            const way = Array.from({ length: distance }, (_, k) =>
                vec2(edge.x - facing.x * (k + 1), edge.y - facing.y * (k + 1))
            )
            if (way.every(open)) return { at: way[distance - 1], facing }
        }
    }
    throw new Error(`Nowhere ${distance} cells from the boss`)
}

// Fight the boss of `state` as player 1, from `distance` cells away, each
// breath charged to `level`: before each one the player is put back on
// its spot facing the boss (the Boar's dash carries it up to the boss) and
// its meter filled; it holds the breath until the level is reached, lets
// go and waits out the cooldown. Returns how many breaths it took, or
// Infinity if the boss still stands after a hundred.
function fight(state: GameState, distance: number, level: number): number {
    const player = state.players[0]
    const { at, facing } = standing(state, distance)
    const holdTicks = Math.ceil(((level - 1) * CHARGE_SECONDS) / TICK)
    for (let breaths = 1; breaths <= 100; breaths++) {
        const c = player.character
        c.pos = vec2(at.x, at.y)
        c.lastPos = vec2(at.x, at.y)
        c.moveProgress = 1
        player.breather.facing = vec2(facing.x, facing.y)
        player.breather.energy = player.breather.breath.maxEnergy
        const press = { ...IDLE, breath: true, breathHeld: level > 1 }
        step(state, TICK, press, fixedRandom(0))
        for (let i = 0; i < holdTicks; i++) {
            step(state, TICK, { ...IDLE, breathHeld: true }, fixedRandom(0))
        }
        step(state, TICK, IDLE, fixedRandom(0))
        if (state.boss!.defeated) return breaths
        while (player.breather.cooldown > 0) {
            step(state, TICK, IDLE, fixedRandom(0))
        }
    }
    return Infinity
}

describe.each(BOSS_STAGES)("the %s boss", (_, data) => {
    describe.each(DIFFICULTIES)("on %s", (difficulty) => {
        it.each(ANIMAL_IDS)("falls to the %s's full charges", (animal) => {
            const state = arena(data, difficulty, animal)
            const health = state.boss!.health
            const { cost, maxEnergy, bossDamageScale = 1 } = BREATHS[animal]
            const charged = Math.min(MAX_CHARGE, Math.floor(maxEnergy / cost))
            const breaths = fight(state, CHARGED_REACH, charged)
            // Every one of them landed: as many as its energy needs.
            expect(breaths).toBe(
                Math.ceil(
                    health / (bossDamage(cost * charged) * bossDamageScale) -
                        1e-9
                )
            )
        })

        it.each(ANIMAL_IDS)(
            "falls to the %s's taps from as far as they reach",
            (animal) => {
                const state = arena(data, difficulty, animal)
                const health = state.boss!.health
                const { cost, bossDamageScale = 1 } = BREATHS[animal]
                const breaths = fight(state, TAP_REACH[animal], 1)
                expect(breaths).toBe(
                    Math.ceil(
                        health / (bossDamage(cost) * bossDamageScale) - 1e-9
                    )
                )
            }
        )
    })
})
