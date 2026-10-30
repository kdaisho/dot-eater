import { describe, expect, it } from "vite-plus/test"
import { addStatus } from "./breath"
import {
    AiType,
    Cell,
    ENEMY_DAMAGE,
    MAX_HEALTH,
    PLAYER_RESPAWN_DELAY,
    PLAYER_SPEED,
    TICK_RATE,
} from "./constants"
import {
    checkEnd,
    createGameState,
    IDLE,
    outForGood,
    step,
    takeOut,
    type GameState,
    type Mode,
    type MoveInput,
} from "./game"
import type { Boss } from "./boss"
import { BREATHS } from "./breaths"
import type { Character } from "./character"
import { levels } from "./levels"
import { ANIMAL_IDS } from "./roster"
import {
    fixedRandom,
    makeBoss,
    makeEnemy,
    makeState,
    testBreath,
    textMap,
    ticksUntilCaught,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// Co-op (KDA-221, KDA-257): each player has its own health; one knocked
// out (no health left) is out on its own, for good, and the game is lost
// once nobody is in play. Taking a player out and bringing it back
// PLAYER_RESPAWN_DELAY seconds later (versus's knockouts, see
// game.versus.test.ts) are tested here too, by mode-free takeOut.

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
const west = vec2(-1, 0)
// Ticks the respawn takes.
const RESPAWN_TICKS = PLAYER_RESPAWN_DELAY * TICK_RATE
// Ticks per player move at the default speed.
const MOVE = TICK_RATE / PLAYER_SPEED

const hold = (d: Vec2, breath = false): MoveInput => ({
    held: [d],
    pressed: none,
    breath,
})
const tap = (d: Vec2): MoveInput => ({ held: [], pressed: d })

// An empty hall with player 1 at its west end and player 2 at its east
// end, and a dot in a pocket below, so the game isn't won.
const hall = textMap([
    "#############",
    "#           #",
    "#############",
    "#.###########",
]).map
const P1 = vec2(1, 1)
const P2 = vec2(11, 1)

// A 2-player game in the hall, played by `mode`'s rules with `health`
// each.
function coop(
    enemies = [makeEnemy(6, 1)],
    {
        health = MAX_HEALTH,
        mode = "coop",
    }: { health?: number; mode?: Mode } = {}
): GameState {
    return makeState(hall, [P1, P2], enemies, { health, mode })
}

// An enemy that never moves, standing at (x, y).
function post(x: number, y: number) {
    const enemy = makeEnemy(x, y)
    enemy.speed = 0
    return enemy
}

function run(state: GameState, moves: readonly MoveInput[], ticks: number) {
    for (let i = 0; i < ticks; i++) {
        const outcome = step(state, TICK, moves, fixedRandom(0))
        if (outcome) return outcome
    }
    return null
}

describe("the game's mode", () => {
    it("is solo unless given", () => {
        expect(createGameState().mode).toBe("solo")
        expect(createGameState(levels[0], ["dragon", "owl"]).mode).toBe("solo")
    })

    it("is the one given", () => {
        const state = createGameState(levels[0], ["dragon", "owl"], "coop")
        expect(state.mode).toBe("coop")
    })

    it("starts every player in play", () => {
        const state = createGameState(levels[0], ["dragon", "owl"], "coop")
        for (const p of state.players) {
            expect(p.out).toBe(false)
            expect(p.respawnIn).toBeNull()
        }
    })
})

describe("a co-op knockout", () => {
    // An enemy on player 1's cell hits it on the first tick, taking its
    // last health. Its spawn is elsewhere, so a reset would show.
    function knockedOutOnFirstTick(health = 1) {
        const enemy = post(1, 1)
        const state = coop([enemy], { health })
        state.spawns = { ...state.spawns, enemies: [vec2(6, 1)] }
        const outcome = step(state, TICK, [IDLE, hold(west)], fixedRandom(0))
        return { state, enemy, outcome }
    }

    it("takes only that player out, for good", () => {
        const { state, enemy, outcome } = knockedOutOnFirstTick()
        expect(outcome).toBeNull()
        const [p1, p2] = state.players
        expect(p1.out).toBe(true)
        expect(outForGood(p1)).toBe(true)
        expect(p1.health).toBe(0)
        expect(p2.out).toBe(false)
        expect(p2.health).toBe(1)
        // Nobody is reset: the enemy stays where it hit.
        expect(enemy.pos).toEqual(vec2(1, 1))
    })

    it("with health left only hurts that player", () => {
        const { state, outcome } = knockedOutOnFirstTick(MAX_HEALTH)
        expect(outcome).toBeNull()
        const [p1, p2] = state.players
        expect(p1.out).toBe(false)
        expect(p1.health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(p2.health).toBe(MAX_HEALTH)
    })

    it("lets the other player and the enemies carry on", () => {
        const roamer = makeEnemy(6, 1, AiType.random)
        roamer.moveProgress = 1
        const state = coop([post(1, 1), roamer], { health: 1 })
        state.spawns = { ...state.spawns, enemies: [vec2(1, 1), vec2(6, 1)] }
        step(state, TICK, [IDLE, hold(west)], fixedRandom(0))
        expect(state.players[0].out).toBe(true)
        const moved = vec2(roamer.pos.x, roamer.pos.y)
        expect(moved).not.toEqual(vec2(6, 1))
        run(state, [IDLE, hold(west)], MOVE * 2)
        expect(state.players[1].character.pos.x).toBeLessThan(P2.x - 1)
        expect(roamer.pos).not.toEqual(vec2(6, 1))
    })

    it("doesn't reset the dots, the scores or the boss", () => {
        const boss = makeBoss(5, 1)
        boss.health = 3
        boss.speed = 0
        const state = makeState(hall, [P1, P2], [post(1, 1)], {
            mode: "coop",
            boss,
        })
        state.spawns = { ...state.spawns, enemies: [vec2(6, 1)] }
        state.players[1].score = 40
        boss.pos = vec2(7, 0)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(state.players[0].out).toBe(true)
        expect(state.players[1].score).toBe(40)
        expect(state.cells[3][1]).toBe(Cell.dot)
        expect(boss.pos).toEqual(vec2(7, 0))
    })

    it("still wins on the last dot, eaten by the player in play", () => {
        const map = textMap([
            "#############",
            "#         . #",
            "#############",
        ]).map
        const state = makeState(map, [P1, P2], [post(1, 1)], { mode: "coop" })
        expect(run(state, [IDLE, hold(west)], MOVE * 2)).toBe("won")
        expect(state.players[0].out).toBe(true)
    })

    it("ends the game once nobody is in play", () => {
        const state = coop([post(1, 1), post(11, 1)], { health: 1 })
        expect(step(state, TICK, [IDLE, IDLE], fixedRandom(0))).toBe("dead")
        expect(state.players.every(outForGood)).toBe(true)
    })

    it("ends the game when the last player in play is knocked out", () => {
        const state = coop([post(1, 1)], { health: 1 })
        takeOut(state.players[1], null)
        expect(step(state, TICK, [IDLE, IDLE], fixedRandom(0))).toBe("dead")
    })

    it("hurts one and knocks the other out on the same tick", () => {
        const state = coop([post(1, 1), post(11, 1)])
        state.players[1].health = 1
        expect(step(state, TICK, [IDLE, IDLE], fixedRandom(0))).toBeNull()
        const [p1, p2] = state.players
        expect(p1.health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(p1.out).toBe(false)
        expect(outForGood(p2)).toBe(true)
    })
})

describe("a player out of play", () => {
    // Player 1 taken out after walking to (4, 1) with energy and a
    // buffered tap; no enemies.
    function outAfterWalking() {
        const state = coop([])
        const p1 = state.players[0]
        p1.character.pos = vec2(4, 1)
        p1.character.lastPos = vec2(3, 1)
        p1.character.moveProgress = 0.5
        p1.breather.facing = vec2(-1, 0)
        p1.breather.energy = 60
        p1.bufferedStep = east
        takeOut(p1, PLAYER_RESPAWN_DELAY)
        return { state, p1 }
    }

    it("comes back at its own spawn after exactly PLAYER_RESPAWN_DELAY", () => {
        const { state, p1 } = outAfterWalking()
        run(state, [IDLE, IDLE], RESPAWN_TICKS - 1)
        expect(p1.out).toBe(true)
        expect(p1.respawnIn).toBeCloseTo(TICK)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(p1.out).toBe(false)
        expect(p1.respawnIn).toBeNull()
        expect(p1.character.pos).toEqual(P1)
        expect(p1.character.lastPos).toEqual(P1)
    })

    it("comes back ready to move, facing right, with its energy kept", () => {
        const { state, p1 } = outAfterWalking()
        run(state, [IDLE, IDLE], RESPAWN_TICKS)
        expect(p1.character.moveProgress).toBe(1)
        expect(p1.breather.facing).toEqual(east)
        expect(p1.bufferedStep).toEqual(none)
        expect(p1.breather.energy).toBe(60)
        // It can move on the very next tick.
        step(state, TICK, [hold(east), IDLE], fixedRandom(0))
        expect(p1.character.pos).toEqual(vec2(2, 1))
    })

    it("moves on the tick it comes back", () => {
        const { state, p1 } = outAfterWalking()
        run(state, [IDLE, IDLE], RESPAWN_TICKS - 1)
        step(state, TICK, [hold(east), IDLE], fixedRandom(0))
        expect(p1.character.pos).toEqual(vec2(2, 1))
    })

    it("ignores its input, taps included", () => {
        const { state, p1 } = outAfterWalking()
        const energy = p1.breather.energy
        run(state, [{ ...tap(west), held: [west], breath: true }, IDLE], 30)
        expect(p1.character.pos).toEqual(vec2(4, 1))
        expect(p1.bufferedStep).toEqual(none)
        expect(p1.breather.energy).toBe(energy)
        expect(p1.breather.cooldown).toBe(0)
        // A tap made while out isn't carried over to its return.
        run(state, [tap(west), IDLE], RESPAWN_TICKS - 31)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(p1.out).toBe(false)
        expect(p1.bufferedStep).toEqual(none)
        expect(p1.character.pos).toEqual(P1)
    })

    it("doesn't eat the dot it stands on", () => {
        const state = makeState(
            textMap(["#####", "#...#", "#####", "#.###"]).map,
            [vec2(1, 1), vec2(3, 1)],
            [],
            { mode: "coop", breath: testBreath() }
        )
        const p1 = state.players[0]
        takeOut(p1, PLAYER_RESPAWN_DELAY)
        run(state, [hold(east), IDLE], MOVE * 3)
        expect(state.cells[1][2]).toBe(Cell.dot)
        expect(p1.score).toBe(0)
    })

    it("can't be hurt", () => {
        const roamer = makeEnemy(2, 1, AiType.random)
        roamer.moveProgress = 1
        const state = coop([roamer])
        takeOut(state.players[0], PLAYER_RESPAWN_DELAY)
        roamer.pos = vec2(1, 1)
        roamer.lastPos = vec2(1, 1)
        expect(checkEnd(state)).toBeNull()
        expect(state.players[0].health).toBe(MAX_HEALTH)
        expect(state.players[0].respawnIn).toBe(PLAYER_RESPAWN_DELAY)
    })

    it("isn't chased: enemies go after the player in play", () => {
        // The chaser is 2 cells from player 1 (out) and 8 from player 2.
        const chaser = makeEnemy(3, 1, AiType.chase)
        chaser.moveProgress = 1
        const state = coop([chaser])
        takeOut(state.players[0], PLAYER_RESPAWN_DELAY)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(chaser.pos).toEqual(vec2(4, 1))
        // In play, player 1 draws it.
        const both = coop([makeEnemy(3, 1, AiType.chase)])
        both.enemies[0].moveProgress = 1
        step(both, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(both.enemies[0].pos).toEqual(vec2(2, 1))
    })

    it("isn't chased by the boss", () => {
        const arena = textMap([
            "############",
            "#          #",
            "#          #",
            "#          #",
            "############",
            "#.##########",
        ]).map
        // Player 1 is nearer; with it out the boss heads for player 2.
        const boss = makeBoss(4, 1)
        const state = makeState(arena, [vec2(1, 1), vec2(10, 1)], [], {
            mode: "coop",
            boss,
        })
        takeOut(state.players[0], PLAYER_RESPAWN_DELAY)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(boss.pos).toEqual(vec2(5, 1))
    })
})

describe("while nobody is in play", () => {
    // An open room: player 1's spawn is (1, 1) and player 2's (6, 2).
    const room = textMap([
        "########",
        "#      #",
        "#      #",
        "########",
        "#.######",
    ]).map

    // Both players out, player 1 coming back in PLAYER_RESPAWN_DELAY.
    function nobodyIn(state: GameState) {
        takeOut(state.players[0], PLAYER_RESPAWN_DELAY)
        takeOut(state.players[1], null)
    }

    it("sends enemies back to their own spawns", () => {
        // The chaser stands next to where player 2 went out, its spawn to
        // the west; the players' spots no longer draw it.
        const chaser = makeEnemy(5, 1, AiType.chase)
        chaser.moveProgress = 1
        const state = makeState(room, [vec2(1, 1), vec2(6, 2)], [chaser], {
            mode: "coop",
        })
        state.spawns = { ...state.spawns, enemies: [vec2(3, 1)] }
        nobodyIn(state)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(chaser.pos).toEqual(vec2(4, 1))
    })

    it("sends the boss back to its spawn", () => {
        const boss = makeBoss(1, 1)
        boss.spawn = vec2(5, 1)
        const state = makeState(room, [vec2(1, 1), vec2(6, 2)], [], {
            mode: "coop",
            boss,
        })
        nobodyIn(state)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(boss.pos).toEqual(vec2(2, 1))
        run(state, [IDLE, IDLE], TICK_RATE * 2.5)
        expect(boss.pos).toEqual(vec2(5, 1))
    })

    it("goes back to the players once one is in play again", () => {
        const chaser = makeEnemy(4, 1, AiType.chase)
        chaser.moveProgress = 1
        const state = makeState(room, [vec2(1, 1), vec2(6, 2)], [chaser], {
            mode: "coop",
        })
        state.spawns = { ...state.spawns, enemies: [vec2(6, 1)] }
        takeOut(state.players[1], null)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(chaser.pos).toEqual(vec2(3, 1))
    })

    // Regression: the boss or a phantom on the waiting player's spawn
    // parked there, aiming at where the players went out, so the player
    // waited at respawnIn 0 for ever and the game hung.
    // Only versus brings a knocked-out player back now.
    describe("with the last player knocked out on its own spawn", () => {
        function caughtOnSpawn(
            spawn: Vec2,
            enemies: Character[],
            boss: Boss | null,
            enemySpawns: Vec2[] = []
        ) {
            const state = makeState(room, [spawn, vec2(6, 2)], enemies, {
                mode: "versus",
                boss,
            })
            state.spawns = { ...state.spawns, enemies: enemySpawns }
            takeOut(state.players[1], null)
            expect(step(state, TICK, [IDLE, IDLE], fixedRandom(0))).toBeNull()
            expect(state.players[0].respawnIn).toBe(PLAYER_RESPAWN_DELAY)
            return state
        }

        // Steps until player 1 is back and returns how many ticks that
        // took; fails on an outcome first.
        function ticksUntilBack(state: GameState, max: number) {
            for (let i = 1; i <= max; i++) {
                const outcome = step(state, TICK, [IDLE, IDLE], fixedRandom(0))
                expect(outcome).toBeNull()
                if (!state.players[0].out) return i
            }
            throw new Error(`Not back within ${max} ticks`)
        }

        // Steps until player 1 is out again, as ticksUntilBack.
        function ticksUntilOut(state: GameState, max: number) {
            for (let i = 1; i <= max; i++) {
                const outcome = step(state, TICK, [IDLE, IDLE], fixedRandom(0))
                expect(outcome).toBeNull()
                if (state.players[0].out) return i
            }
            throw new Error(`Not out within ${max} ticks`)
        }

        it("comes back once the boss there has gone home", () => {
            const boss = makeBoss(1, 1)
            boss.spawn = vec2(5, 1)
            const state = caughtOnSpawn(vec2(1, 1), [], boss)
            const back = ticksUntilBack(state, RESPAWN_TICKS + TICK_RATE * 2)
            expect(back).toBeGreaterThanOrEqual(RESPAWN_TICKS - 1)
            expect(state.players[0].character.pos).toEqual(vec2(1, 1))
            // The game goes on: the boss comes for it again and knocks it
            // out once more.
            expect(ticksUntilOut(state, TICK_RATE * 10)).toBeGreaterThan(0)
        })

        it("comes back once the phantom there has gone home", () => {
            const phantom = makeEnemy(2, 2, AiType.phantom)
            phantom.moveProgress = 1
            const state = caughtOnSpawn(vec2(2, 2), [phantom], null, [
                vec2(6, 1),
            ])
            const back = ticksUntilBack(state, RESPAWN_TICKS + TICK_RATE * 2)
            expect(back).toBeGreaterThanOrEqual(RESPAWN_TICKS - 1)
            expect(state.players[0].character.pos).toEqual(vec2(2, 2))
            expect(ticksUntilOut(state, TICK_RATE * 10)).toBeGreaterThan(0)
        })
    })
})

describe("coming back onto an occupied spawn", () => {
    it("waits while an enemy there would catch it, then comes back", () => {
        const guard = post(1, 1)
        const state = coop([guard])
        const p1 = state.players[0]
        takeOut(p1, PLAYER_RESPAWN_DELAY)
        run(state, [IDLE, IDLE], RESPAWN_TICKS + 30)
        expect(p1.out).toBe(true)
        expect(p1.respawnIn).toBe(0)
        expect(p1.health).toBe(MAX_HEALTH)
        // Once the enemy is off the spawn, it is back on the next tick.
        guard.pos = vec2(3, 1)
        guard.lastPos = vec2(3, 1)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(p1.out).toBe(false)
        expect(p1.character.pos).toEqual(P1)
        expect(p1.health).toBe(MAX_HEALTH)
    })

    it("waits for an enemy gliding off it to be RESPAWN_CLEAR_DISTANCE away", () => {
        // Gliding from (2, 1) to (3, 1): drawn 1.3 cells from the spawn,
        // then 1.6.
        const guard = post(3, 1)
        guard.lastPos = vec2(2, 1)
        guard.moveProgress = 0.3
        const state = coop([guard])
        takeOut(state.players[0], 0)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(state.players[0].out).toBe(true)
        guard.moveProgress = 0.6
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(state.players[0].out).toBe(false)
    })

    it("waits for an enemy whose move ends next to it", () => {
        // Gliding from (3, 1) to (2, 1): drawn 2 cells away, but its
        // move ends next to the spawn.
        const guard = post(2, 1)
        guard.lastPos = vec2(3, 1)
        guard.moveProgress = 0
        const state = coop([guard])
        takeOut(state.players[0], 0)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(state.players[0].out).toBe(true)
    })

    // Regression: the spawn counted as clear with an enemy just out of
    // catching reach gliding onto it, so the player was caught a tick
    // after it came back.
    it("isn't caught right after coming back by an enemy gliding in", () => {
        const map = textMap([
            "#########",
            "#       #",
            "#       #",
            "#       #",
            "#########",
            "#.#######",
        ]).map
        // Gliding from (5, 2) into player 1's spawn, drawn 0.65 from it.
        const chaser = makeEnemy(4, 2, AiType.chase, { x: 5, y: 2 })
        chaser.moveProgress = 0.35
        const state = makeState(map, [vec2(4, 2), vec2(7, 3)], [chaser], {
            mode: "coop",
        })
        state.spawns = { ...state.spawns, enemies: [vec2(7, 1)] }
        const p1 = state.players[0]
        // Due back this tick, holding up.
        takeOut(p1, TICK)
        const north = vec2(0, -1)
        let back = -1
        for (let i = 0; i < TICK_RATE * 2 && back < 0; i++) {
            step(state, TICK, [hold(north), IDLE], fixedRandom(0))
            if (!p1.out) back = i
        }
        expect(back).toBeGreaterThan(0)
        run(state, [hold(north), IDLE], 2)
        expect(p1.out).toBe(false)
        expect(p1.health).toBe(MAX_HEALTH)
    })

    it("isn't held up by a harmless enemy", () => {
        const guard = post(1, 1)
        addStatus(guard, { name: "test.calm", harmless: true }, 10)
        const state = coop([guard])
        takeOut(state.players[0], PLAYER_RESPAWN_DELAY)
        run(state, [IDLE, IDLE], RESPAWN_TICKS)
        expect(state.players[0].out).toBe(false)
    })

    it("waits for the boss's footprint to be off it", () => {
        const arena = textMap([
            "######",
            "#    #",
            "#    #",
            "######",
            "#.####",
        ]).map
        const boss = makeBoss(1, 1, 0)
        const state = makeState(arena, [vec2(1, 1), vec2(4, 2)], [], {
            mode: "coop",
            boss,
        })
        takeOut(state.players[0], 0)
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(state.players[0].out).toBe(true)
        boss.defeated = true
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(state.players[0].out).toBe(false)
    })
})

describe("ticksUntilCaught in co-op", () => {
    it("notices a player going out for good", () => {
        const chaser = makeEnemy(3, 1, AiType.chase)
        chaser.moveProgress = 1
        const state = coop([chaser], { health: 1 })
        expect(ticksUntilCaught(state)).toBeGreaterThan(0)
        expect(outForGood(state.players[0])).toBe(true)
        expect(state.players[1].out).toBe(false)
    })

    it("notices a player hurt with health left", () => {
        const chaser = makeEnemy(3, 1, AiType.chase)
        chaser.moveProgress = 1
        const state = coop([chaser])
        expect(ticksUntilCaught(state)).toBeGreaterThan(0)
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
    })
})

describe("solo rules", () => {
    it("never take a player out or reset anyone on a hit", () => {
        const state = coop([post(1, 1)], { mode: "solo" })
        state.players[1].character.pos = vec2(8, 1)
        expect(step(state, TICK, [IDLE, IDLE], fixedRandom(0))).toBeNull()
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        for (const p of state.players) expect(p.out).toBe(false)
        expect(state.players[1].character.pos).toEqual(vec2(8, 1))
    })

    it("lose the game on a knockout, taking nobody out", () => {
        const state = coop([post(1, 1)], { mode: "solo", health: 1 })
        expect(step(state, TICK, [IDLE, IDLE], fixedRandom(0))).toBe("dead")
        for (const p of state.players) expect(p.out).toBe(false)
    })
})

describe("dots eaten", () => {
    it("are counted for the player who ate them", () => {
        const map = textMap(["#######", "#.....#", "#######", "#.#####"]).map
        const state = makeState(map, [vec2(1, 1), vec2(5, 1)], [], {
            mode: "coop",
        })
        run(state, [hold(east), hold(west)], MOVE * 2)
        expect(state.players.map((p) => p.dots)).toEqual([2, 1])
        expect(state.players.map((p) => p.score)).toEqual([20, 10])
    })
})

describe("breaths in co-op", () => {
    // Player 1 breathes east along a hall with player 2 right in front of
    // it and an enemy beyond: whatever the breath does, player 2 is left
    // alone and can walk on through whatever it left behind.
    it.each(ANIMAL_IDS)("never affect the partner: %s", (animal) => {
        const map = textMap([
            "##########",
            "#        #",
            "##########",
            "#.########",
        ]).map
        const enemy = makeEnemy(5, 1)
        enemy.speed = 0
        const state = makeState(map, [vec2(1, 1), vec2(2, 1)], [enemy], {
            health: MAX_HEALTH,
            mode: "coop",
            breath: BREATHS[animal],
        })
        const [p1, p2] = state.players
        p1.breather.energy = p1.breather.breath.maxEnergy
        p2.breather.energy = 40
        p2.character.moveProgress = 1
        p2.breather.facing = west
        expect(
            step(state, TICK, [{ ...IDLE, breath: true }, IDLE], fixedRandom(0))
        ).toBeNull()
        // It fired (the Boar's refuses: there is no wall in front, only
        // the partner).
        const spent = p1.breather.energy < p1.breather.breath.maxEnergy
        expect(spent).toBe(animal !== "boar")
        expect(p2.character.pos).toEqual(vec2(2, 1))
        expect(p2.character.lastPos).toEqual(vec2(2, 1))
        expect(p2.out).toBe(false)
        expect(p2.score).toBe(0)
        expect(p2.breather.energy).toBe(40)
        expect(p2.breather.cooldown).toBe(0)
        expect(p2.breather.facing).toEqual(west)
        expect(state.ice[1][2]).toBe(false)
        expect(p2.health).toBe(MAX_HEALTH)
        // Player 2 walks on through the breath's cells.
        run(state, [IDLE, hold(east)], MOVE)
        expect(p2.character.pos).toEqual(vec2(3, 1))
    })
})
