import { describe, expect, it } from "vite-plus/test"
import {
    AiType,
    Cell,
    ENEMY_DAMAGE,
    MAX_HEALTH,
    PLAYER_SPEED,
    TICK_RATE,
} from "./constants"
import {
    checkEnd,
    createGameState,
    IDLE,
    step,
    takeOut,
    type GameState,
    type Mode,
    type MoveInput,
} from "./game"
import { BREATHS } from "./breaths"
import { levels } from "./levels"
import { panicked, PANIC_SECONDS } from "./panic"
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
// once nobody is in play.

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
        expect(p1.out).toBe(true)
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
        expect(state.players.every((p) => p.out)).toBe(true)
    })

    it("ends the game when the last player in play is knocked out", () => {
        const state = coop([post(1, 1)], { health: 1 })
        takeOut(state.players[1])
        expect(step(state, TICK, [IDLE, IDLE], fixedRandom(0))).toBe("dead")
    })

    it("hurts one and knocks the other out on the same tick", () => {
        const state = coop([post(1, 1), post(11, 1)])
        state.players[1].health = 1
        expect(step(state, TICK, [IDLE, IDLE], fixedRandom(0))).toBeNull()
        const [p1, p2] = state.players
        expect(p1.health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(p1.out).toBe(false)
        expect(p2.out).toBe(true)
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
        takeOut(p1)
        return { state, p1 }
    }

    it("ignores its input, taps included", () => {
        const { state, p1 } = outAfterWalking()
        const energy = p1.breather.energy
        run(state, [{ ...tap(west), held: [west], breath: true }, IDLE], 30)
        expect(p1.character.pos).toEqual(vec2(4, 1))
        expect(p1.bufferedStep).toEqual(none)
        expect(p1.breather.energy).toBe(energy)
        expect(p1.breather.cooldown).toBe(0)
    })

    it("doesn't eat the dot it stands on", () => {
        const state = makeState(
            textMap(["#####", "#...#", "#####", "#.###"]).map,
            [vec2(1, 1), vec2(3, 1)],
            [],
            { mode: "coop", breath: testBreath() }
        )
        const p1 = state.players[0]
        takeOut(p1)
        run(state, [hold(east), IDLE], MOVE * 3)
        expect(state.cells[1][2]).toBe(Cell.dot)
        expect(p1.score).toBe(0)
    })

    it("can't be hurt", () => {
        const roamer = makeEnemy(2, 1, AiType.random)
        roamer.moveProgress = 1
        const state = coop([roamer])
        takeOut(state.players[0])
        roamer.pos = vec2(1, 1)
        roamer.lastPos = vec2(1, 1)
        expect(checkEnd(state)).toBeNull()
        expect(state.players[0].health).toBe(MAX_HEALTH)
    })

    it("isn't chased: enemies go after the player in play", () => {
        // The chaser is 2 cells from player 1 (out) and 8 from player 2.
        const chaser = makeEnemy(3, 1, AiType.chase)
        chaser.moveProgress = 1
        const state = coop([chaser])
        takeOut(state.players[0])
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
        takeOut(state.players[0])
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

    // Both players out.
    function nobodyIn(state: GameState) {
        takeOut(state.players[0])
        takeOut(state.players[1])
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
        // The game is lost, but step still moves the boss on.
        for (let i = 0; i < TICK_RATE * 2.5; i++) {
            step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        }
        expect(boss.pos).toEqual(vec2(5, 1))
    })

    it("goes back to the players once one is in play again", () => {
        const chaser = makeEnemy(4, 1, AiType.chase)
        chaser.moveProgress = 1
        const state = makeState(room, [vec2(1, 1), vec2(6, 2)], [chaser], {
            mode: "coop",
        })
        state.spawns = { ...state.spawns, enemies: [vec2(6, 1)] }
        takeOut(state.players[1])
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(chaser.pos).toEqual(vec2(3, 1))
    })
})

describe("ticksUntilCaught in co-op", () => {
    it("notices a player going out for good", () => {
        const chaser = makeEnemy(3, 1, AiType.chase)
        chaser.moveProgress = 1
        const state = coop([chaser], { health: 1 })
        expect(ticksUntilCaught(state)).toBeGreaterThan(0)
        expect(state.players[0].out).toBe(true)
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
    // it and an enemy beyond: whatever the breath does, player 2 isn't
    // hurt, only panicked (KDA-316, see panic.test.ts), and once the panic
    // is over it walks on through whatever the breath left behind.
    it.each(ANIMAL_IDS)("never hurt the partner: %s", (animal) => {
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
        // It fired (the Boar's Rush bumps into the partner, and panics it).
        expect(p1.breather.energy).toBeLessThan(p1.breather.breath.maxEnergy)
        expect(panicked(p2)).toBe(true)
        expect(p2.character.pos).toEqual(vec2(2, 1))
        expect(p2.character.lastPos).toEqual(vec2(2, 1))
        expect(p2.out).toBe(false)
        expect(p2.score).toBe(0)
        expect(p2.breather.energy).toBe(40)
        expect(p2.breather.cooldown).toBe(0)
        expect(p2.breather.facing).toEqual(west)
        expect(state.ice[1][2]).toBe(false)
        expect(p2.health).toBe(MAX_HEALTH)
        // Player 2 walks on through the breath's cells once it calms down.
        run(state, [IDLE, IDLE], PANIC_SECONDS * TICK_RATE)
        run(state, [IDLE, hold(east)], MOVE)
        expect(p2.character.pos).toEqual(vec2(3, 1))
        expect(p2.health).toBe(MAX_HEALTH)
    })
})
