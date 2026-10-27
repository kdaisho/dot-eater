import { describe, expect, it } from "vite-plus/test"
import { nearestTarget } from "./ai"
import { bossTarget } from "./boss"
import { addTileEffect, energyHud } from "./breath"
import {
    AiType,
    BOSS_DEFEAT_POINTS,
    BOSS_HEALTH,
    DEFEAT_POINTS,
    DOT_POINTS,
    PLAYER_SPEED,
    START_LIVES,
    TICK_RATE,
} from "./constants"
import { BREATHS } from "./breaths"
import {
    createGameState,
    IDLE,
    settle,
    step,
    totalScore,
    type GameState,
    type MoveInput,
} from "./game"
import { levels } from "./levels"
import {
    cellsFrom,
    fixedRandom,
    makeBoss,
    makeEnemy,
    makeState,
    p2Move,
    testBreath,
    textMap,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// Two players in one game, through step(): each moves, eats, scores and
// breathes on its own; they pass through each other; enemies and the boss
// go after the nearer one; a catch of either costs a shared life.

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
const west = vec2(-1, 0)
// Ticks per player move at the default speed.
const MOVE = TICK_RATE / PLAYER_SPEED

const hold = (d: Vec2, breath = false): MoveInput => ({
    held: [d],
    pressed: none,
    breath,
})

function run(state: GameState, moves: readonly MoveInput[], ticks: number) {
    for (let i = 0; i < ticks; i++) {
        const outcome = step(state, TICK, moves, fixedRandom(0))
        if (outcome) return outcome
    }
    return null
}

// A long corridor of dots with one dot in a pocket below, so eating the
// corridor doesn't win.
const corridor = textMap([
    "###########",
    "#.........#",
    "#.#########",
    "#.#########",
    "###########",
]).map

describe("createGameState with two players", () => {
    it("starts each on its own spawn as its own animal", () => {
        const level = levels[0]
        const state = createGameState(level, ["dragon", "boar"])
        const [p1, p2] = state.players
        expect(p1.character.pos).toEqual(level.playerSpawns[0])
        expect(p2.character.pos).toEqual(level.playerSpawns[1])
        expect(state.spawns.players).toEqual(level.playerSpawns)
        expect(p1.breather.breath).toBe(BREATHS.dragon)
        expect(p2.breather.breath).toBe(BREATHS.boar)
        expect(p1.character.speed).toBe(PLAYER_SPEED)
        expect(p2.character.speed).toBe(PLAYER_SPEED * BREATHS.boar.speedScale)
        expect(p2.character.moveProgress).toBe(1)
        expect(state.lives).toBe(START_LIVES)
    })

    it("lets both players pick the same animal", () => {
        const state = createGameState(levels[0], ["owl", "owl"])
        expect(state.players.map((p) => p.breather.breath.animal)).toEqual([
            "owl",
            "owl",
        ])
        expect(state.players[0].breather).not.toBe(state.players[1].breather)
    })

    it("starts one player from a single animal", () => {
        expect(createGameState(levels[0], "skunk").players).toHaveLength(1)
    })

    it("refuses more players than the level has spawns", () => {
        expect(() =>
            createGameState(levels[0], ["owl", "owl", "owl"])
        ).toThrow()
    })
})

describe("two players", () => {
    it("move independently, each with its own input", () => {
        const state = makeState(corridor, [
            { x: 2, y: 1 },
            { x: 8, y: 1 },
        ])
        run(state, [hold(east), hold(west)], MOVE * 2)
        const [p1, p2] = state.players
        expect(p1.character.pos).toEqual(vec2(4, 1))
        expect(p2.character.pos).toEqual(vec2(6, 1))
        expect(p1.breather.facing).toEqual(east)
        expect(p2.breather.facing).toEqual(west)
    })

    it("take a single MoveInput as player 1's, with player 2 idle", () => {
        const state = makeState(corridor, [
            { x: 2, y: 1 },
            { x: 8, y: 1 },
        ])
        for (let i = 0; i < MOVE; i++) {
            step(state, TICK, hold(east), fixedRandom(0))
        }
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        expect(state.players[1].character.pos).toEqual(vec2(8, 1))
    })

    it("buffer their own taps", () => {
        const state = makeState(corridor, [
            { x: 2, y: 1 },
            { x: 8, y: 1 },
        ])
        step(state, TICK, p2Move({ held: [], pressed: west }), fixedRandom(0))
        expect(state.players[1].bufferedStep).toEqual(west)
        run(state, [IDLE, IDLE], MOVE)
        expect(state.players[1].character.pos).toEqual(vec2(7, 1))
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(state.players[0].bufferedStep).toEqual(none)
    })

    it("each score and fill their own meter from the dots they eat", () => {
        const state = makeState(corridor, [
            { x: 2, y: 1 },
            { x: 8, y: 1 },
        ])
        run(state, [hold(east), hold(west)], MOVE * 2)
        const [p1, p2] = state.players
        expect(p1.score).toBe(2 * DOT_POINTS)
        expect(p2.score).toBe(2 * DOT_POINTS)
        expect(p1.breather.energy).toBeGreaterThan(0)
        expect(p1.breather.energy).toBe(p2.breather.energy)
        expect(p1.eatenAt).toEqual(vec2(4, 1))
        expect(p2.eatenAt).toEqual(vec2(6, 1))
        expect(totalScore(state)).toBe(4 * DOT_POINTS)
    })

    it("give a dot both step onto on the same tick to player 1", () => {
        const state = makeState(corridor, [
            { x: 4, y: 1 },
            { x: 6, y: 1 },
        ])
        run(state, [hold(east), hold(west)], MOVE)
        expect(state.players[0].character.pos).toEqual(vec2(5, 1))
        expect(state.players[1].character.pos).toEqual(vec2(5, 1))
        expect(state.players[0].score).toBe(DOT_POINTS)
        expect(state.players[1].score).toBe(0)
        expect(state.players[1].eatenAt).toBeNull()
    })

    it("pass through each other", () => {
        const state = makeState(corridor, [
            { x: 4, y: 1 },
            { x: 6, y: 1 },
        ])
        run(state, [hold(east), hold(west)], MOVE * 2)
        expect(state.players[0].character.pos).toEqual(vec2(6, 1))
        expect(state.players[1].character.pos).toEqual(vec2(4, 1))
        expect(state.lives).toBe(1)
    })

    it("can share a cell", () => {
        const state = makeState(corridor, [
            { x: 4, y: 1 },
            { x: 4, y: 1 },
        ])
        expect(run(state, [hold(east), hold(east)], MOVE * 2)).toBeNull()
        expect(state.players[0].character.pos).toEqual(vec2(6, 1))
        expect(state.players[1].character.pos).toEqual(vec2(6, 1))
    })

    it("win when either eats the last dot", () => {
        const { map } = textMap(["#####", "#  .#", "#####"])
        const state = makeState(map, [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
        ])
        expect(run(state, [IDLE, hold(east)], MOVE)).toBe("won")
        expect(state.players[1].score).toBe(DOT_POINTS)
    })

    it("settle only once both glides are complete", () => {
        const state = makeState(corridor, [
            { x: 2, y: 1 },
            { x: 8, y: 1 },
        ])
        state.players[1].character.moveProgress = 0.5
        expect(settle(state, 0)).toBe(false)
        expect(settle(state, 1)).toBe(true)
    })
})

describe("catching two players", () => {
    // Player 1 at the left end, player 2 on a chaser's cell at the right.
    function cornered(lives: number) {
        const chaser = makeEnemy(8, 1, AiType.chase)
        return makeState(
            corridor,
            [
                { x: 2, y: 1 },
                { x: 8, y: 1 },
            ],
            [chaser],
            { lives }
        )
    }

    it("costs one shared life when either is caught, and respawns both", () => {
        const state = cornered(3)
        run(state, [hold(east), IDLE], 1)
        expect(state.lives).toBe(2)
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(state.players[1].character.pos).toEqual(vec2(8, 1))
        expect(state.enemies[0].pos).toEqual(vec2(8, 1))
    })

    it("ends the game on the last life", () => {
        expect(run(cornered(1), [IDLE, IDLE], 1)).toBe("dead")
    })
})

describe("breaths with two players", () => {
    const breath = testBreath({ cost: 10, cooldown: 1 })

    function twoBreathers() {
        const enemy = makeEnemy(9, 1)
        enemy.moveProgress = 0
        const state = makeState(
            corridor,
            [
                { x: 2, y: 1 },
                { x: 7, y: 1 },
            ],
            [enemy],
            { breath }
        )
        for (const p of state.players) p.breather.energy = 50
        return state
    }

    it("spend only the breathing player's energy and cooldown", () => {
        const state = twoBreathers()
        step(state, TICK, p2Move({ ...IDLE, breath: true }), fixedRandom(0))
        const [p1, p2] = state.players
        expect(p1.breather.energy).toBe(50)
        expect(p1.breather.cooldown).toBe(0)
        expect(p2.breather.energy).toBe(40)
        expect(p2.breather.cooldown).toBe(1)
        expect(energyHud(state, 1).energy).toBe(40)
        expect(energyHud(state).energy).toBe(50)
    })

    it("count both players' cooldowns down", () => {
        const state = twoBreathers()
        step(state, TICK, [{ ...IDLE, breath: true }, IDLE], fixedRandom(0))
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(state.players[0].breather.cooldown).toBeCloseTo(1 - TICK)
    })

    it("fire from the breathing player's cell and facing", () => {
        const hits: Vec2[] = []
        const state = twoBreathers()
        state.players[1].breather.breath = testBreath({
            fire: (hit) => {
                hits.push(hit.origin, hit.facing)
            },
        })
        state.players[1].breather.facing = east
        step(state, TICK, p2Move({ ...IDLE, breath: true }), fixedRandom(0))
        expect(hits).toEqual([vec2(7, 1), east])
    })

    it("score a defeat for the player who breathed", () => {
        const state = twoBreathers()
        state.players[1].breather.breath = testBreath({
            fire: (hit) => hit.enemies.forEach((e) => hit.defeat(e)),
        })
        state.players[1].breather.facing = east
        step(state, TICK, p2Move({ ...IDLE, breath: true }), fixedRandom(0))
        expect(state.players[1].score).toBe(DEFEAT_POINTS)
        expect(state.players[0].score).toBe(0)
    })

    it("score the boss for the player who finished it", () => {
        const { map } = textMap([
            "########",
            "#      #",
            "#      #",
            "########",
            "#.######",
        ])
        const boss = makeBoss(4, 1)
        boss.health = 1
        boss.moveProgress = 0
        const state = makeState(
            map,
            [
                { x: 1, y: 1 },
                { x: 2, y: 1 },
            ],
            [],
            { breath: testBreath({ cost: 25 }), boss }
        )
        state.players[1].breather.energy = 25
        step(state, TICK, p2Move({ ...IDLE, breath: true }), fixedRandom(0))
        expect(boss.defeated).toBe(true)
        expect(state.players[1].score).toBe(BOSS_DEFEAT_POINTS)
        expect(state.players[0].score).toBe(0)
        expect(BOSS_HEALTH).toBeGreaterThan(1)
    })

    it("never lay ice under either player", () => {
        const state = twoBreathers()
        const ice = { name: "test.ice", ice: true }
        addTileEffect(state, vec2(7, 1), ice, 1)
        addTileEffect(state, vec2(2, 1), ice, 1)
        expect(state.tiles).toEqual([])
    })
})

describe("enemies with two players", () => {
    // A ring: a chaser at the top middle, player 1 far round to the left,
    // player 2 close by on the right.
    const ring = textMap([
        "###########",
        "#         #",
        "# ####### #",
        "#         #",
        "###########",
    ]).map

    it("aim for the nearest player by maze distance", () => {
        const chaser = makeEnemy(5, 1, AiType.chase)
        expect(
            nearestTarget(cellsFrom(ring), chaser, [vec2(1, 3), vec2(8, 1)])
        ).toBe(1)
        expect(
            nearestTarget(cellsFrom(ring), chaser, [vec2(2, 1), vec2(8, 1)])
        ).toBe(0)
    })

    it("take player 1 on a tie, or when there is only one", () => {
        const chaser = makeEnemy(5, 1, AiType.chase)
        expect(
            nearestTarget(cellsFrom(ring), chaser, [vec2(3, 1), vec2(7, 1)])
        ).toBe(0)
        expect(nearestTarget(cellsFrom(ring), chaser, [vec2(9, 3)])).toBe(0)
    })

    it("count a walled-off player as farthest", () => {
        const { map } = textMap(["#######", "#   # #", "#######"])
        const chaser = makeEnemy(1, 1, AiType.chase)
        expect(
            nearestTarget(cellsFrom(map), chaser, [vec2(5, 1), vec2(3, 1)])
        ).toBe(1)
    })

    it("measure straight through walls for a phantom", () => {
        const phantom = makeEnemy(5, 1, AiType.phantom)
        // Player 1 is just below through the wall, a long way round by path.
        expect(
            nearestTarget(cellsFrom(ring), phantom, [vec2(5, 3), vec2(9, 1)])
        ).toBe(0)
        const chaser = makeEnemy(5, 1, AiType.chase)
        expect(
            nearestTarget(cellsFrom(ring), chaser, [vec2(5, 3), vec2(9, 1)])
        ).toBe(1)
    })

    it("chase the nearer player through step", () => {
        const chaser = makeEnemy(5, 1, AiType.chase)
        chaser.moveProgress = 1
        const state = makeState(
            ring,
            [
                { x: 1, y: 3 },
                { x: 8, y: 1 },
            ],
            [chaser]
        )
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(chaser.pos).toEqual(vec2(6, 1))
        // With player 2 gone, the same chaser heads for player 1.
        const solo = makeState(ring, { x: 1, y: 3 }, [
            makeEnemy(5, 1, AiType.chase),
        ])
        solo.enemies[0].moveProgress = 1
        step(solo, TICK, IDLE, fixedRandom(0))
        expect(solo.enemies[0].pos).toEqual(vec2(4, 1))
    })

    it("ambush along the heading of the player they target", () => {
        const ambusher = makeEnemy(5, 1, AiType.ambusher)
        ambusher.moveProgress = 1
        const state = makeState(
            ring,
            [
                { x: 1, y: 3 },
                { x: 7, y: 1 },
            ],
            [ambusher]
        )
        // Player 2 is heading west, towards the ambusher: it aims 4 ahead
        // of player 2 (past itself) rather than at player 1.
        state.players[1].character.lastPos = vec2(8, 1)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(ambusher.pos).toEqual(vec2(4, 1))
    })
})

describe("the boss with two players", () => {
    // An open arena with a pocket below that keeps the game from being won.
    const arena = textMap([
        "############",
        "#          #",
        "#          #",
        "#          #",
        "############",
        "#.##########",
    ]).map

    it("targets the player nearest its footprint", () => {
        const state = makeState(
            arena,
            [
                { x: 1, y: 1 },
                { x: 9, y: 2 },
            ],
            [],
            { boss: makeBoss(6, 1) }
        )
        const targets = state.players.map((p) => p.character.pos)
        expect(bossTarget(state, targets)).toBe(1)
        expect(bossTarget(state, [targets[0]])).toBe(0)
    })

    it("moves towards the nearer player through step", () => {
        const boss = makeBoss(5, 1)
        const state = makeState(
            arena,
            [
                { x: 1, y: 1 },
                { x: 9, y: 1 },
            ],
            [],
            { boss }
        )
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(boss.pos).toEqual(vec2(6, 1))
    })
})
