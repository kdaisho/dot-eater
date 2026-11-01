import { describe, expect, it } from "vite-plus/test"
import type { BreathDef } from "./breath"
import { BREATHS } from "./breaths"
import {
    BOSS_HEALTH,
    ENEMY_DAMAGE,
    ENEMY_IDS,
    MAX_HEALTH,
    TICK_RATE,
} from "./constants"
import { takeEvents, type GameEvent, type GameEventType } from "./events"
import {
    settle,
    step,
    takeOut,
    type GameState,
    type Mode,
    type MoveInput,
} from "./game"
import { AnimalId } from "./roster"
import { createSplitter } from "./splitter"
import {
    fixedRandom,
    makeBoss,
    makeEnemy,
    makeState,
    testBreath,
    textMap,
    type MapLiteral,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// Game events (events.ts): what each tick reports, once per occurrence.

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)

const hold = (d: Vec2): MoveInput => ({ held: [d], pressed: none })
const breath: MoveInput = { held: [], pressed: none, breath: true }

function tick(
    state: GameState,
    moves: MoveInput | readonly MoveInput[] = { held: [], pressed: none }
) {
    return step(state, TICK, moves, fixedRandom(0))
}

// Every event of `type` this tick reported.
function ofType<T extends GameEventType>(
    state: GameState,
    type: T
): Extract<GameEvent, { type: T }>[] {
    return state.events.filter(
        (e): e is Extract<GameEvent, { type: T }> => e.type === type
    )
}

// A one-row hall, cells (1, 1) to (7, 1), with a dot in a pocket below so
// the game isn't won.
const hall = textMap(["#########", "#       #", "#########", "#.#######"]).map

// The hall, two rows high, for the boss.
const room = textMap([
    "#########",
    "#       #",
    "#       #",
    "#########",
    "#.#######",
]).map

// Player 1 at (1, 1) facing east with a full meter, breathing `def`.
function breather(
    def: BreathDef,
    map: MapLiteral = hall,
    options: Parameters<typeof makeState>[3] = {}
): GameState {
    const state = makeState(map, vec2(1, 1), [], {
        health: MAX_HEALTH,
        breath: def,
        ...options,
    })
    state.players[0].breather.energy = def.maxEnergy
    return state
}

describe("the event list", () => {
    it("starts empty", () => {
        expect(makeState(hall, vec2(1, 1)).events).toEqual([])
    })

    it("is emptied at the start of every step", () => {
        const state = makeState(textMap(["#####", "# ..#", "#####"]).map, {
            x: 1,
            y: 1,
        })
        let ticks = 0
        while (state.events.length === 0) {
            tick(state, hold(east))
            if (++ticks > TICK_RATE) throw new Error("No dot eaten")
        }
        tick(state)
        expect(state.events).toEqual([])
    })

    it("takeEvents returns the events and empties the list", () => {
        const state = makeState(hall, vec2(1, 1))
        state.events.push({ type: "gameWon" })
        expect(takeEvents(state)).toEqual([{ type: "gameWon" }])
        expect(state.events).toEqual([])
    })
})

describe("dotEaten", () => {
    it("reports the player and the dot's cell, once per dot", () => {
        const state = makeState(textMap(["######", "# ...#", "######"]).map, [
            vec2(1, 1),
        ])
        const eaten: GameEvent[] = []
        for (let i = 0; i < TICK_RATE / 2; i++) {
            tick(state, hold(east))
            eaten.push(...ofType(state, "dotEaten"))
        }
        expect(eaten).toEqual([
            { type: "dotEaten", player: 0, at: vec2(2, 1) },
            { type: "dotEaten", player: 0, at: vec2(3, 1) },
        ])
    })

    it("names player 2 for player 2's dot", () => {
        const state = makeState(
            textMap(["######", "#  . #", "######", "#.####"]).map,
            [vec2(1, 1), vec2(4, 1)],
            [],
            { mode: "coop" }
        )
        const eaten: GameEvent[] = []
        for (let i = 0; i < TICK_RATE / 2; i++) {
            tick(state, [{ held: [], pressed: none }, hold(vec2(-1, 0))])
            eaten.push(...ofType(state, "dotEaten"))
        }
        expect(eaten).toEqual([{ type: "dotEaten", player: 1, at: vec2(3, 1) }])
    })
})

describe("breathed", () => {
    it("reports the player, its animal, its cell, its facing and the cells it covered", () => {
        const state = breather(BREATHS[AnimalId.penguin])
        tick(state, breath)
        expect(ofType(state, "breathed")).toEqual([
            {
                type: "breathed",
                player: 0,
                animal: AnimalId.penguin,
                at: vec2(1, 1),
                facing: east,
                // A tap's cone (range 2), in a corridor one cell high.
                cells: [vec2(2, 1), vec2(3, 1)],
            },
        ])
    })

    it("reports the cells up to the boss's body", () => {
        const state = breather(BREATHS[AnimalId.dragon], room, {
            boss: makeBoss(3, 1),
        })
        tick(state, breath)
        expect(ofType(state, "breathed")[0].cells).toEqual([
            vec2(2, 1),
            vec2(3, 1),
        ])
    })

    it("reports the wall a breath opened when nothing else was in reach", () => {
        const state = breather(
            BREATHS[AnimalId.boar],
            textMap(["#####", "# # #", "#####", "#.###"]).map
        )
        tick(state, breath)
        expect(ofType(state, "breathed")[0].cells).toEqual([vec2(2, 1)])
    })

    it("reports the player's cell when nothing was in reach", () => {
        // Owl against a wall, blowing an enemy off the player's cell.
        const state = breather(
            BREATHS[AnimalId.owl],
            textMap(["###", "# #", "###", "#.#"]).map
        )
        state.enemies = [makeEnemy(1, 1)]
        state.spawns = { ...state.spawns, enemies: [vec2(1, 1)] }
        tick(state, breath)
        expect(ofType(state, "breathed")[0].cells).toEqual([vec2(1, 1)])
    })

    it("reports nothing for a breath that refuses", () => {
        const state = breather(testBreath({ fire: () => false }))
        tick(state, breath)
        expect(state.events).toEqual([])
    })

    it("reports nothing for a hook that reports, then refuses", () => {
        // Against the contract (refuse before changing anything), but its
        // events mustn't outlive the refusal.
        const state = breather(
            testBreath({
                fire: (hit) => {
                    hit.enemies.forEach((e) => hit.defeat(e))
                    return false
                },
            })
        )
        state.enemies.push(makeEnemy(3, 1))
        state.spawns = { ...state.spawns, enemies: [vec2(7, 1)] }
        tick(state, breath)
        expect(state.events).toEqual([])
    })

    it("reports nothing without the energy", () => {
        const state = breather(testBreath())
        state.players[0].breather.energy = 0
        tick(state, breath)
        expect(state.events).toEqual([])
    })
})

describe("enemyDefeated", () => {
    const defeating = testBreath({
        fire: (hit) => hit.enemies.forEach((e) => hit.defeat(e)),
    })

    it("follows the breath, with the enemy's index and cell", () => {
        const state = breather(defeating)
        state.enemies.push(makeEnemy(3, 1))
        state.spawns = { ...state.spawns, enemies: [vec2(7, 1)] }
        tick(state, breath)
        expect(state.events.map((e) => e.type)).toEqual([
            "breathed",
            "enemyDefeated",
        ])
        expect(ofType(state, "enemyDefeated")).toEqual([
            {
                type: "enemyDefeated",
                player: 0,
                enemy: 0,
                at: vec2(3, 1),
                split: false,
            },
        ])
    })

    it("marks a whole Splitter's split", () => {
        const state = breather(defeating)
        const slots = createSplitter([ENEMY_IDS[0], ENEMY_IDS[1]], vec2(3, 1))
        state.enemies.push(...slots)
        state.spawns = {
            ...state.spawns,
            enemies: [vec2(3, 1), vec2(3, 1)],
        }
        tick(state, breath)
        expect(ofType(state, "enemyDefeated")).toEqual([
            {
                type: "enemyDefeated",
                player: 0,
                enemy: 0,
                at: vec2(3, 1),
                split: true,
            },
        ])
    })

    it("reports one event per enemy, two defeated in one breath", () => {
        const state = breather(defeating)
        state.enemies.push(
            makeEnemy(2, 1),
            makeEnemy(3, 1, undefined, undefined, ENEMY_IDS[1])
        )
        state.spawns = {
            ...state.spawns,
            enemies: [vec2(7, 1), vec2(7, 1)],
        }
        tick(state, breath)
        expect(ofType(state, "enemyDefeated").map((e) => e.enemy)).toEqual([
            0, 1,
        ])
        expect(ofType(state, "breathed")).toHaveLength(1)
    })
})

describe("bossHit and bossDefeated", () => {
    // Costs 50: 2 damage a breath.
    const strong = testBreath({ cost: 50 })

    it("reports a hit with the health left", () => {
        const state = breather(strong, room, { boss: makeBoss(3, 1) })
        tick(state, breath)
        expect(state.events.map((e) => e.type)).toEqual(["breathed", "bossHit"])
        expect(ofType(state, "bossHit")).toEqual([
            {
                type: "bossHit",
                player: 0,
                at: vec2(3, 1),
                health: BOSS_HEALTH - 2,
            },
        ])
    })

    it("reports only bossDefeated for the killing blow", () => {
        const boss = makeBoss(3, 1)
        boss.health = 2
        const state = breather(strong, room, { boss })
        tick(state, breath)
        // Defeating it clears the stage too (KDA-267).
        expect(state.events.map((e) => e.type)).toEqual([
            "breathed",
            "bossDefeated",
            "gameWon",
        ])
        expect(ofType(state, "bossDefeated")).toEqual([
            { type: "bossDefeated", player: 0, at: vec2(3, 1) },
        ])
    })
})

// A game where an enemy stands on player 1's cell (1, 1), so the first step
// hits it; with two players, player 2 is at (5, 1), out of reach.
function caughtGame(mode: Mode, health: number, players = 1): GameState {
    const starts = [vec2(1, 1), vec2(5, 1)].slice(0, players)
    return makeState(hall, starts, [makeEnemy(1, 1)], { mode, health })
}

describe("hurt, playerCaught and playerRespawned", () => {
    it("solo with health left: hurt, and nobody respawned", () => {
        const state = caughtGame("solo", MAX_HEALTH)
        expect(tick(state)).toBeNull()
        expect(state.events).toEqual([
            { type: "hurt", player: 0, at: vec2(1, 1), damage: ENEMY_DAMAGE },
        ])
    })

    it("solo with the last health: caught for good, then the game is lost", () => {
        const state = caughtGame("solo", ENEMY_DAMAGE)
        expect(tick(state)).toBe("dead")
        expect(state.events).toEqual([
            {
                type: "playerCaught",
                player: 0,
                at: vec2(1, 1),
                outForGood: true,
            },
            { type: "gameLost" },
        ])
    })

    it("co-op with health left: hurt", () => {
        const state = caughtGame("coop", MAX_HEALTH, 2)
        tick(state)
        expect(state.events).toEqual([
            { type: "hurt", player: 0, at: vec2(1, 1), damage: ENEMY_DAMAGE },
        ])
    })

    it("co-op with the last health: out for good, the game goes on", () => {
        const state = caughtGame("coop", 1, 2)
        expect(tick(state)).toBeNull()
        expect(state.events).toEqual([
            {
                type: "playerCaught",
                player: 0,
                at: vec2(1, 1),
                outForGood: true,
            },
        ])
    })

    it("reports each of two players hurt on one tick once", () => {
        const state = makeState(
            hall,
            [vec2(1, 1), vec2(5, 1)],
            [
                makeEnemy(1, 1),
                makeEnemy(5, 1, undefined, undefined, ENEMY_IDS[1]),
            ],
            { mode: "coop", health: MAX_HEALTH }
        )
        tick(state)
        expect(ofType(state, "hurt").map((e) => e.player)).toEqual([0, 1])
    })

    it("versus: knocked out, never for good", () => {
        const state = caughtGame("versus", 1, 2)
        tick(state)
        expect(ofType(state, "playerCaught")).toEqual([
            {
                type: "playerCaught",
                player: 0,
                at: vec2(1, 1),
                outForGood: false,
            },
        ])
    })

    it("reports a 2-player respawn on the tick the player is back", () => {
        const state = makeState(hall, [vec2(1, 1), vec2(5, 1)], [], {
            mode: "versus",
        })
        const p2 = state.players[1]
        p2.character.pos = vec2(3, 1)
        takeOut(p2, TICK * 2)
        tick(state)
        expect(state.events).toEqual([])
        tick(state)
        expect(state.events).toEqual([
            { type: "playerRespawned", player: 1, at: vec2(5, 1) },
        ])
    })
})

describe("playerStunned", () => {
    it("follows the breath that stunned, naming both players", () => {
        const state = makeState(hall, [vec2(1, 1), vec2(3, 1)], [], {
            mode: "versus",
            breath: BREATHS[AnimalId.dragon],
        })
        state.players[0].breather.energy = 100
        tick(state, [breath, { held: [], pressed: none }])
        expect(state.events).toEqual([
            {
                type: "breathed",
                player: 0,
                animal: AnimalId.dragon,
                at: vec2(1, 1),
                facing: east,
                // A tap's whole line: players don't stop it.
                cells: [2, 3, 4].map((x) => vec2(x, 1)),
            },
            { type: "playerStunned", player: 1, by: 0, at: vec2(3, 1) },
        ])
    })

    it("isn't reported for a player already stunned", () => {
        const state = makeState(hall, [vec2(1, 1), vec2(3, 1)], [], {
            mode: "versus",
            breath: BREATHS[AnimalId.owl],
        })
        state.players[0].breather.energy = 100
        state.players[1].stunnedFor = 1
        tick(state, [breath, { held: [], pressed: none }])
        expect(ofType(state, "playerStunned")).toEqual([])
    })
})

describe("gameWon", () => {
    const corridor = textMap(["####", "# .#", "####"]).map

    it("follows the last dot", () => {
        const state = makeState(corridor, vec2(1, 1))
        let outcome = null
        for (let i = 0; i < TICK_RATE && !outcome; i++) {
            outcome = tick(state, hold(east))
        }
        expect(outcome).toBe("won")
        expect(state.events).toEqual([
            { type: "dotEaten", player: 0, at: vec2(2, 1) },
            { type: "gameWon" },
        ])
    })

    it("ends a versus round too", () => {
        const state = makeState(corridor, [vec2(1, 1), vec2(1, 1)], [], {
            mode: "versus",
        })
        let outcome = null
        for (let i = 0; i < TICK_RATE && !outcome; i++) {
            outcome = tick(state, [hold(east), { held: [], pressed: none }])
        }
        expect(outcome).toBe("won")
        expect(ofType(state, "gameWon")).toHaveLength(1)
    })

    it("nothing is reported by the outro", () => {
        const state = makeState(corridor, vec2(1, 1))
        while (!tick(state, hold(east)));
        takeEvents(state)
        while (!settle(state, TICK));
        expect(state.events).toEqual([])
    })
})
