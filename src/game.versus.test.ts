import { describe, expect, it } from "vite-plus/test"
import { breathe, type BreathDef } from "./breath"
import { BREATHS } from "./breaths"
import { damageBoss } from "./boss"
import {
    BOSS_DEFEAT_POINTS,
    BOSS_HEALTH,
    PLAYER_RESPAWN_DELAY,
    ENEMY_DAMAGE,
    MAX_HEALTH,
    TICK_RATE,
} from "./constants"
import {
    checkEnd,
    IDLE,
    movePlayer,
    step,
    takeOut,
    type GameState,
    type Mode,
    type MoveInput,
} from "./game"
import { AnimalId } from "./roster"
import {
    fixedRandom,
    makeBoss,
    makeEnemy,
    makeState,
    textMap,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"
import {
    CATCH_DOTS,
    STUN_IMMUNITY_SECONDS,
    STUN_SECONDS,
    stunImmune,
    stunned,
} from "./versus"

// Versus (KDA-222) in the game itself: breaths stun the other player, a
// knockout (health gone) costs dots and a wait, and the game is never
// lost.

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
const west = vec2(-1, 0)
const STUN_TICKS = STUN_SECONDS * TICK_RATE
const IMMUNITY_TICKS = STUN_IMMUNITY_SECONDS * TICK_RATE
const RESPAWN_TICKS = PLAYER_RESPAWN_DELAY * TICK_RATE

const hold = (d: Vec2, breath = false): MoveInput => ({
    held: [d],
    pressed: none,
    breath,
})
const breath: MoveInput = { held: [], pressed: none, breath: true }

// A one-row hall, cells (1, 1) to (11, 1), with a dot in a pocket below so
// the game isn't won. Breakable inner walls sit below the hall.
const hall = textMap([
    "#############",
    "#           #",
    "#############",
    "#.###########",
]).map

// A 2-player game in the hall: player 1 at (1, 1) facing east with a full
// meter, breathing `p1`, and player 2 at `p2At`, by `mode`'s rules.
function duel(
    p1: BreathDef,
    p2At: Vec2,
    { mode = "versus" }: { mode?: Mode } = {}
): GameState {
    const state = makeState(hall, [vec2(1, 1), p2At], [], {
        health: MAX_HEALTH,
        mode,
        breath: [p1, BREATHS[AnimalId.dragon]],
    })
    state.players[0].breather.energy = p1.maxEnergy
    return state
}

function run(state: GameState, moves: readonly MoveInput[], ticks: number) {
    for (let i = 0; i < ticks; i++) {
        const outcome = step(state, TICK, moves, fixedRandom(0))
        if (outcome) return outcome
    }
    return null
}

describe("a breath on the other player in versus", () => {
    const cases: [AnimalId, Vec2][] = [
        [AnimalId.dragon, vec2(6, 1)],
        [AnimalId.penguin, vec2(4, 1)],
        [AnimalId.owl, vec2(6, 1)],
        [AnimalId.skunk, vec2(2, 1)],
        [AnimalId.boar, vec2(2, 1)],
    ]
    for (const [animal, at] of cases) {
        it(`stuns it for ${STUN_SECONDS} s (${animal})`, () => {
            const def = BREATHS[animal]
            const state = duel(def, at)
            expect(breathe(state, state.players[0])).toBe(true)
            const p2 = state.players[1]
            expect(p2.stunnedFor).toBe(STUN_SECONDS)
            expect(stunned(p2)).toBe(true)
            // It costs the breath's normal energy.
            expect(state.players[0].breather.energy).toBe(
                def.maxEnergy - def.cost
            )
            // Nothing else happens to it: not pushed, not out.
            expect(p2.character.pos).toEqual(at)
            expect(p2.out).toBe(false)
        })

        it(`doesn't reach it a cell further off (${animal})`, () => {
            const state = duel(BREATHS[animal], vec2(at.x + 1, at.y))
            breathe(state, state.players[0])
            expect(stunned(state.players[1])).toBe(false)
        })
    }

    it("stuns it on the breather's own cell", () => {
        const state = duel(BREATHS[AnimalId.dragon], vec2(1, 1))
        breathe(state, state.players[0])
        expect(stunned(state.players[1])).toBe(true)
    })

    it("fires even when the hook would refuse (the Boar, no wall)", () => {
        const state = duel(BREATHS[AnimalId.boar], vec2(3, 1))
        // Nothing to break and nobody there: refused, nothing spent.
        expect(breathe(state, state.players[0])).toBe(false)
        state.players[1].character.pos = vec2(2, 1)
        expect(breathe(state, state.players[0])).toBe(true)
        expect(state.players[0].breather.cooldown).toBeGreaterThan(0)
    })

    it("never stuns in co-op or solo", () => {
        for (const mode of ["coop", "solo"] as const) {
            const state = duel(BREATHS[AnimalId.dragon], vec2(3, 1), { mode })
            expect(breathe(state, state.players[0])).toBe(true)
            expect(state.players[1].stunnedFor).toBe(0)
        }
    })

    it("doesn't stun a player already stunned again", () => {
        const state = duel(BREATHS[AnimalId.owl], vec2(3, 1))
        breathe(state, state.players[0])
        // Half a second on, past the Owl's cooldown.
        run(state, [IDLE, IDLE], TICK_RATE / 2)
        const left = state.players[1].stunnedFor
        expect(left).toBeCloseTo(STUN_SECONDS - 0.5)
        expect(breathe(state, state.players[0])).toBe(true)
        expect(state.players[1].stunnedFor).toBe(left)
    })

    it("can stun it again once the stun and its immunity are over", () => {
        const state = duel(BREATHS[AnimalId.owl], vec2(3, 1))
        const [p1, p2] = state.players
        breathe(state, p1)
        run(state, [IDLE, IDLE], STUN_TICKS)
        expect(stunned(p2)).toBe(false)
        expect(stunImmune(p2)).toBe(true)
        breathe(state, p1)
        expect(stunned(p2)).toBe(false)
        run(state, [IDLE, IDLE], IMMUNITY_TICKS)
        expect(stunImmune(p2)).toBe(false)
        p1.breather.energy = p1.breather.breath.maxEnergy
        p1.breather.cooldown = 0
        expect(breathe(state, p1)).toBe(true)
        expect(p2.stunnedFor).toBe(STUN_SECONDS)
    })

    // Regression: with no immunity, an Owl breathing whenever player 2 was
    // free stunned it again on the tick its stun wore off, so it never got
    // away.
    it(`gets ${STUN_IMMUNITY_SECONDS} s free after each stun, however often it is breathed at`, () => {
        // A short hall: player 2, holding away, is stopped by the wall
        // still in the Owl's reach.
        const short = textMap(["#######", "#     #", "#######", "#.#####"]).map
        const state = makeState(short, [vec2(1, 1), vec2(3, 1)], [], {
            mode: "versus",
            breath: [BREATHS[AnimalId.owl], BREATHS[AnimalId.dragon]],
        })
        const [p1, p2] = state.players
        // Each stretch of ticks player 2 spends free between two stuns.
        const free: number[] = []
        let stretch = 0
        let stuns = 0
        for (let i = 0; i < 8 * TICK_RATE; i++) {
            p1.breather.energy = p1.breather.breath.maxEnergy
            const was = stunned(p2)
            const p1Move = { held: [], pressed: none, breath: !was }
            step(state, TICK, [p1Move, hold(east)], fixedRandom(0))
            if (!stunned(p2)) {
                stretch++
            } else if (!was) {
                stuns++
                if (stuns > 1) free.push(stretch)
                stretch = 0
            }
        }
        expect(p2.character.pos).toEqual(vec2(5, 1))
        expect(stuns).toBeGreaterThan(2)
        for (const ticks of free) {
            expect(ticks).toBeGreaterThanOrEqual(IMMUNITY_TICKS)
        }
    })

    it("loses its immunity when it is taken out", () => {
        const state = duel(BREATHS[AnimalId.owl], vec2(3, 1))
        const p2 = state.players[1]
        p2.stunImmuneFor = STUN_IMMUNITY_SECONDS
        takeOut(p2, PLAYER_RESPAWN_DELAY)
        expect(stunImmune(p2)).toBe(false)
    })

    it("doesn't stun from the tiles it leaves behind", () => {
        // The fire burns (2, 1) to (6, 1); player 2 walks into it after.
        const state = duel(BREATHS[AnimalId.dragon], vec2(7, 1))
        breathe(state, state.players[0])
        expect(state.tiles.length).toBeGreaterThan(0)
        run(state, [IDLE, hold(west)], TICK_RATE / 2)
        expect(state.players[1].character.pos.x).toBeLessThan(7)
        expect(stunned(state.players[1])).toBe(false)
    })

    it("doesn't reach a player out of play", () => {
        const state = duel(BREATHS[AnimalId.dragon], vec2(3, 1))
        state.players[1].out = true
        state.players[1].respawnIn = 1
        breathe(state, state.players[0])
        expect(state.players[1].stunnedFor).toBe(0)
    })

    it("stuns through step, before the stunned player's own breath", () => {
        const state = duel(BREATHS[AnimalId.dragon], vec2(3, 1))
        const p2 = state.players[1]
        p2.breather.energy = 100
        p2.breather.facing = west
        step(state, TICK, [breath, breath], fixedRandom(0))
        expect(stunned(p2)).toBe(true)
        expect(p2.breather.energy).toBe(100)
        expect(stunned(state.players[0])).toBe(false)
    })
})

describe("a stunned player", () => {
    function stunnedP2() {
        const state = duel(BREATHS[AnimalId.owl], vec2(3, 1))
        breathe(state, state.players[0])
        return state
    }

    it("doesn't move until the stun is over", () => {
        const state = stunnedP2()
        const p2 = state.players[1]
        run(state, [IDLE, hold(east)], STUN_TICKS - 1)
        expect(p2.character.pos).toEqual(vec2(3, 1))
        run(state, [IDLE, hold(east)], 1)
        expect(p2.character.pos).toEqual(vec2(4, 1))
    })

    it("ignores taps made while stunned", () => {
        const state = stunnedP2()
        const p2 = state.players[1]
        step(state, TICK, [IDLE, { held: [], pressed: east }], fixedRandom(0))
        run(state, [IDLE, IDLE], STUN_TICKS)
        expect(p2.character.pos).toEqual(vec2(3, 1))
    })

    it("finishes the glide it is in", () => {
        const state = duel(BREATHS[AnimalId.owl], vec2(3, 1))
        const p2 = state.players[1].character
        p2.lastPos = vec2(4, 1)
        p2.moveProgress = 0.5
        breathe(state, state.players[0])
        run(state, [IDLE, hold(west)], TICK_RATE / 2)
        expect(p2.moveProgress).toBe(1)
        expect(p2.pos).toEqual(vec2(3, 1))
    })

    // Regression: a stunned player stopped dead mid-slide on the ice.
    it("finishes its slide on ice, then stays put", () => {
        // Ice from (3, 1) to (6, 1), floor either side.
        const { map, ice } = textMap([
            "############",
            "#  ~~~~    #",
            "############",
            "#.##########",
        ])
        const state = makeState(map, [vec2(10, 1), vec2(4, 1)], [], {
            mode: "versus",
            ice,
        })
        const p2 = state.players[1]
        // Sliding east: it just slid from (3, 1) onto (4, 1).
        p2.character.lastPos = vec2(3, 1)
        p2.stunnedFor = STUN_SECONDS
        run(state, [IDLE, hold(west)], STUN_TICKS - 1)
        expect(stunned(p2)).toBe(true)
        expect(p2.character.pos).toEqual(vec2(7, 1))
    })

    it("can't breathe", () => {
        const state = stunnedP2()
        const p2 = state.players[1]
        p2.breather.energy = 100
        run(state, [IDLE, breath], 1)
        expect(p2.breather.energy).toBe(100)
    })

    it("can still be caught, which ends the stun", () => {
        const enemy = makeEnemy(11, 1)
        enemy.speed = 0
        const state = makeState(hall, [vec2(1, 1), vec2(11, 1)], [enemy], {
            mode: "versus",
        })
        state.spawns = { ...state.spawns, enemies: [vec2(6, 1)] }
        state.players[1].stunnedFor = STUN_SECONDS
        expect(step(state, TICK, [IDLE, IDLE], fixedRandom(0))).toBeNull()
        expect(state.players[1].out).toBe(true)
        expect(state.players[1].stunnedFor).toBe(0)
    })
})

describe("a versus knockout", () => {
    // An enemy that never moves, on player 1's spawn, taking its last
    // health (unless it has more).
    function caughtP1(dots: number, health = 1) {
        const enemy = makeEnemy(1, 1)
        enemy.speed = 0
        const state = makeState(hall, [vec2(1, 1), vec2(11, 1)], [enemy], {
            health,
            mode: "versus",
        })
        state.players[0].dots = dots
        const outcome = step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        return { state, enemy, outcome }
    }

    it(`costs ${CATCH_DOTS} dots and takes the player out for a while`, () => {
        const { state, outcome } = caughtP1(12)
        expect(outcome).toBeNull()
        const [p1, p2] = state.players
        expect(p1.health).toBe(0)
        expect(p1.dots).toBe(12 - CATCH_DOTS)
        expect(p1.out).toBe(true)
        expect(p1.respawnIn).toBe(PLAYER_RESPAWN_DELAY)
        expect(p2.out).toBe(false)
    })

    it("with health left only hurts, costing no dots", () => {
        const { state } = caughtP1(12, MAX_HEALTH)
        const p1 = state.players[0]
        expect(p1.health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(p1.dots).toBe(12)
        expect(p1.out).toBe(false)
    })

    it("doesn't take the dots below 0", () => {
        expect(caughtP1(3).state.players[0].dots).toBe(0)
    })

    it("keeps the score", () => {
        const enemy = makeEnemy(1, 1)
        enemy.speed = 0
        const state = makeState(hall, [vec2(1, 1), vec2(11, 1)], [enemy], {
            mode: "versus",
        })
        state.players[0].score = 120
        step(state, TICK, [IDLE, IDLE], fixedRandom(0))
        expect(state.players[0].score).toBe(120)
    })

    it("brings the player back at its spawn after the delay", () => {
        const { state, enemy } = caughtP1(0)
        enemy.pos = vec2(6, 1)
        enemy.lastPos = vec2(6, 1)
        run(state, [IDLE, IDLE], RESPAWN_TICKS - 1)
        expect(state.players[0].out).toBe(true)
        run(state, [IDLE, IDLE], 1)
        expect(state.players[0].out).toBe(false)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        // With full health, and not invulnerable.
        expect(state.players[0].health).toBe(MAX_HEALTH)
        expect(state.players[0].invulnerableFor).toBe(0)
    })

    it("never loses the game, even with both caught over and over", () => {
        const a = makeEnemy(1, 1)
        const b = makeEnemy(11, 1)
        a.speed = 0
        b.speed = 0
        const state = makeState(hall, [vec2(1, 1), vec2(11, 1)], [a, b], {
            mode: "versus",
        })
        // Both spawns stay occupied: they wait to come back, the game goes
        // on.
        expect(run(state, [IDLE, IDLE], RESPAWN_TICKS * 3)).toBeNull()
        for (const p of state.players) {
            expect(p.out).toBe(true)
            expect(p.respawnIn).toBe(0)
        }
    })
})

describe("a versus round's end", () => {
    it("comes when the last dot is eaten, by either player", () => {
        const map = textMap(["#####", "#. .#", "#####"]).map
        const state = makeState(map, [vec2(2, 1), vec2(3, 1)], [], {
            mode: "versus",
        })
        expect(checkEnd(state)).toBeNull()
        movePlayer(state, west, state.players[0])
        expect(checkEnd(state)).toBe("won")
        expect(state.players.map((p) => p.dots)).toEqual([1, 0])
    })

    // Regression: the last dot was checked first, so a catch on that tick
    // cost nothing and the round was scored without it.
    it(`still costs a player knocked out on the last dot's tick ${CATCH_DOTS} dots`, () => {
        const map = textMap(["#######", "#.    #", "#######"]).map
        const enemy = makeEnemy(5, 1)
        enemy.speed = 0
        const state = makeState(map, [vec2(2, 1), vec2(5, 1)], [enemy], {
            mode: "versus",
        })
        state.players[1].dots = 7
        movePlayer(state, west, state.players[0])
        expect(checkEnd(state)).toBe("won")
        expect(state.players.map((p) => p.dots)).toEqual([1, 7 - CATCH_DOTS])
        expect(state.players[1].out).toBe(true)
    })

    it("leaves co-op and solo as they were: the last dot wins, free", () => {
        for (const mode of ["coop", "solo"] as const) {
            const map = textMap(["#######", "#.    #", "#######"]).map
            const enemy = makeEnemy(5, 1)
            enemy.speed = 0
            const state = makeState(map, [vec2(2, 1), vec2(5, 1)], [enemy], {
                mode,
            })
            movePlayer(state, west, state.players[0])
            expect(checkEnd(state)).toBe("won")
            expect(state.players[1].health).toBe(1)
            expect(state.players[1].out).toBe(false)
        }
    })

    it("waits for the boss on a boss stage, which scores but adds no dots", () => {
        const arena = textMap([
            "#######",
            "#     #",
            "#     #",
            "#     #",
            "#######",
        ]).map
        const state = makeState(arena, [vec2(1, 1), vec2(5, 3)], [], {
            mode: "versus",
            boss: makeBoss(3, 1, 0),
        })
        expect(checkEnd(state)).toBeNull()
        damageBoss(state, BOSS_HEALTH, state.players[1])
        expect(checkEnd(state)).toBe("won")
        expect(state.players[1].score).toBe(BOSS_DEFEAT_POINTS)
        expect(state.players[1].dots).toBe(0)
    })
})
