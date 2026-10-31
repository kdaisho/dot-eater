import { describe, expect, it } from "vite-plus/test"
import { addStatus, defeatEnemy, inPlay } from "./breath"
import { AiType, ENEMY_IDS, TICK_RATE } from "./constants"
import { DIFFICULTIES, GUARD, GUARD_CAP } from "./difficulty"
import type { GameEvent } from "./events"
import { createGameState, drawnPos, IDLE, step, type GameState } from "./game"
import {
    blockChance,
    GUARD_STANCE,
    guardFactor,
    inStance,
    QUICK_PUNCH,
    rollGuard,
    rollGuards,
    SLOW_GUARD,
    SLOW_PUNCH,
    tickStances,
} from "./guard"
import { stages } from "./levels"
import { punch } from "./punch"
import { createSplitter, splitSplitter } from "./splitter"
import {
    makeBoss,
    makeEnemy,
    makeState,
    seededRandom,
    textMap,
} from "./test/helpers"
import { vec2 } from "./vec2"

// The guard against the punch (KDA-288).

const TICK = 1 / TICK_RATE

function ofType<T extends GameEvent["type"]>(state: GameState, type: T) {
    return state.events.filter(
        (e): e is Extract<GameEvent, { type: T }> => e.type === type
    )
}

// A random source that always gives `value`, and counts its draws.
function counting(value: number) {
    const random = () => {
        random.draws++
        return value
    }
    random.draws = 0
    return random
}

// An open room, with a dot shut away below so the game isn't won.
const room = textMap([
    "#########",
    "#       #",
    "#       #",
    "#       #",
    "#########",
    "#.#######",
]).map

describe("the guard's odds", () => {
    it("are a chance of a guarder and a skill range per difficulty", () => {
        expect(GUARD).toEqual({
            easy: { chance: 0.35, min: 0.25, max: 0.55 },
            medium: { chance: 0.55, min: 0.4, max: 0.75 },
            hard: { chance: 0.75, min: 0.55, max: 0.85 },
            superHard: { chance: 0.95, min: 0.7, max: 0.85 },
        })
        expect(GUARD_CAP).toBe(0.85)
        for (const d of DIFFICULTIES) {
            expect(GUARD[d].max).toBeLessThanOrEqual(GUARD_CAP)
        }
    })
})

describe("rollGuard", () => {
    it("makes a guarder at each difficulty's chance, with a skill in its range", () => {
        for (const d of DIFFICULTIES) {
            const odds = GUARD[d]
            const random = seededRandom(7)
            const skills = Array.from({ length: 4000 }, () =>
                rollGuard(odds, random)
            )
            const guarders = skills.filter((s) => s > 0)
            expect(guarders.length / skills.length).toBeCloseTo(odds.chance, 1)
            expect(Math.min(...guarders)).toBeGreaterThanOrEqual(odds.min)
            expect(Math.max(...guarders)).toBeLessThanOrEqual(odds.max)
            // Spread evenly over the range: the mean is its middle.
            const mean = guarders.reduce((a, b) => a + b, 0) / guarders.length
            expect(mean).toBeCloseTo((odds.min + odds.max) / 2, 1)
        }
    })

    it("is the same for the same seed", () => {
        const roll = () => {
            const random = seededRandom(42)
            return Array.from({ length: 20 }, () =>
                rollGuard(GUARD.hard, random)
            )
        }
        expect(roll()).toEqual(roll())
    })

    it("draws once, scaling the draw under the chance into the range", () => {
        const random = counting(0.14)
        // 0.14 is 0.4 of the way to easy's 0.35: 0.25 + 0.4 * 0.3.
        expect(rollGuard(GUARD.easy, random)).toBeCloseTo(0.37)
        expect(random.draws).toBe(1)
        expect(rollGuard(GUARD.easy, () => 0.35)).toBe(0)
        expect(rollGuard(GUARD.easy, () => 0)).toBeCloseTo(0.25)
    })

    it("never goes over the cap", () => {
        const odds = { chance: 1, min: 0.5, max: 1 }
        expect(rollGuard(odds, () => 0.99)).toBe(GUARD_CAP)
    })
})

describe("rollGuards", () => {
    it("rolls each enemy in play once, in slot order", () => {
        const enemies = [makeEnemy(1, 1), makeEnemy(2, 1), makeEnemy(3, 1)]
        const state = makeState(room, { x: 5, y: 1 }, enemies)
        state.guard = GUARD.superHard
        enemies[1].respawnIn = 1
        const values = [0.1, 0.97]
        rollGuards(state, () => values.shift()!)
        expect(enemies[0].guard).toBeGreaterThan(0)
        expect(enemies[1].guard).toBeNull()
        expect(enemies[2].guard).toBe(0)
        // Already rolled: no more draws.
        const random = counting(0)
        rollGuards(state, random)
        expect(random.draws).toBe(0)
    })

    it("rolls nothing, and draws nothing, on a game without odds", () => {
        const enemy = makeEnemy(1, 1)
        const state = makeState(room, { x: 5, y: 1 }, [enemy])
        const random = counting(0)
        rollGuards(state, random)
        expect(random.draws).toBe(0)
        expect(enemy.guard).toBeNull()
    })

    it("rolls a Splitter's spare slot only once it is in play", () => {
        const [main, spare] = createSplitter(
            [ENEMY_IDS[0], ENEMY_IDS[1]],
            vec2(1, 1)
        )
        const state = makeState(room, { x: 5, y: 1 }, [main, spare])
        state.guard = GUARD.hard
        rollGuards(state, counting(0.9))
        expect(main.guard).toBe(0)
        expect(inPlay(spare)).toBe(false)
        expect(spare.guard).toBeNull()
    })

    it("rolls every enemy on a game's first tick, at the game's difficulty", () => {
        const level = stages[0].hard
        const state = createGameState(level, "dragon", "solo", "hard")
        expect(state.guard).toBe(GUARD.hard)
        step(state, TICK, IDLE, seededRandom(3))
        for (const enemy of state.enemies.filter(inPlay)) {
            expect(enemy.guard).not.toBeNull()
        }
        // Without a difficulty, no guard.
        const plain = createGameState(level, "dragon", "solo")
        step(plain, TICK, IDLE, seededRandom(3))
        expect(plain.guard).toBeNull()
        expect(plain.enemies.every((e) => e.guard === null)).toBe(true)
    })

    it("keeps a seeded game the same every time", () => {
        const play = () => {
            const state = createGameState(stages[0].medium, "dragon", "solo")
            state.guard = GUARD.medium
            const random = seededRandom(11)
            for (let i = 0; i < 3 * TICK_RATE; i++) {
                step(state, TICK, IDLE, random)
            }
            return state.enemies.map((e) => [e.guard, e.pos])
        }
        expect(play()).toEqual(play())
    })
})

describe("the block's chance", () => {
    it("is the whole skill for quick punches and a quarter for slow ones", () => {
        expect(QUICK_PUNCH).toBe(0.2)
        expect(SLOW_PUNCH).toBe(0.6)
        expect(SLOW_GUARD).toBe(0.25)
        expect(guardFactor(0)).toBe(1)
        expect(guardFactor(0.2)).toBe(1)
        expect(guardFactor(0.6)).toBe(0.25)
        expect(guardFactor(2)).toBe(0.25)
    })

    it("falls linearly in between", () => {
        expect(guardFactor(0.4)).toBeCloseTo(0.625)
        expect(guardFactor(0.3)).toBeCloseTo(0.8125)
        expect(blockChance(0.8, 0.4)).toBeCloseTo(0.5)
    })

    it("counts a player's first punch as slow", () => {
        expect(guardFactor(Infinity)).toBe(SLOW_GUARD)
        const state = makeState(room, { x: 2, y: 1 }, [])
        expect(state.players[0].sincePunch).toBe(Infinity)
    })
})

describe("a blocked punch", () => {
    // A guarder resting a cell ahead of the player.
    function setup(skill = GUARD_CAP) {
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.guard = skill
        const state = makeState(room, { x: 2, y: 1 }, [enemy], {
            health: 100,
        })
        return { enemy, state, player: state.players[0] }
    }

    it("doesn't move the enemy, count towards its decay or start its lull", () => {
        const { enemy, state, player } = setup()
        enemy.knocks = 1
        enemy.sinceKnock = 1.5
        punch(state, player, () => 0)
        expect(enemy.pos).toEqual(vec2(3, 1))
        expect(enemy.lastPos).toEqual(vec2(3, 1))
        expect(enemy.knockTurn).toBeNull()
        expect(enemy.turnsBack).toBe(false)
        expect(enemy.knocks).toBe(1)
        expect(enemy.sinceKnock).toBe(1.5)
        // Not harmless: it can catch the player on this tick.
        expect(enemy.statuses).toEqual([])
    })

    it("reports a punchBlocked in place of its punchHit", () => {
        const { state, player } = setup()
        punch(state, player, () => 0)
        expect(ofType(state, "punchHit")).toEqual([])
        expect(ofType(state, "punchBlocked")).toEqual([
            {
                type: "punchBlocked",
                player: 0,
                at: vec2(3, 1),
                facing: vec2(1, 0),
                enemy: 0,
            },
        ])
    })

    it("blocks a quick punch the first punch's chance doesn't", () => {
        const { enemy, state } = setup()
        // Above the slow chance (0.85 * 0.25), below the quick one.
        const random = () => 0.5
        const press = { held: [], pressed: vec2(0, 0), punch: true }
        step(state, TICK, press, random)
        expect(ofType(state, "punchHit")).toHaveLength(1)
        enemy.pos = vec2(3, 1)
        enemy.lastPos = vec2(3, 1)
        enemy.moveProgress = 0
        enemy.knockTurn = null
        step(state, TICK, press, random)
        expect(ofType(state, "punchBlocked")).toHaveLength(1)
        expect(enemy.pos).toEqual(vec2(3, 1))
    })

    it("counts the time since the player's previous punch in game ticks", () => {
        const { state, player } = setup()
        punch(state, player)
        expect(player.sincePunch).toBe(0)
        for (let i = 0; i < 12; i++) step(state, TICK, IDLE, () => 0.99)
        expect(player.sincePunch).toBeCloseTo(0.2)
    })

    it("draws once for each guarder in reach, and never for others", () => {
        const { enemy, state, player } = setup(0)
        const random = counting(0)
        punch(state, player, random)
        expect(random.draws).toBe(0)
        enemy.guard = 0.5
        enemy.pos = vec2(3, 1)
        enemy.lastPos = vec2(3, 1)
        punch(state, player, random)
        expect(random.draws).toBe(1)
    })

    it("never happens to a held enemy", () => {
        const { enemy, state, player } = setup()
        addStatus(enemy, { name: "test.freeze", holds: true }, 5)
        const random = counting(0)
        punch(state, player, random)
        expect(random.draws).toBe(0)
        expect(ofType(state, "punchHit")).toHaveLength(1)
        expect(ofType(state, "punchBlocked")).toEqual([])
    })

    it("never happens to the boss or the other player in versus", () => {
        const { map } = textMap([
            "##########",
            "#        #",
            "#        #",
            "#        #",
            "##########",
            "#.########",
        ])
        const state = makeState(map, [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
        ])
        state.mode = "versus"
        state.boss = makeBoss(2, 1)
        const random = counting(0)
        punch(state, state.players[0], random)
        expect(random.draws).toBe(0)
        expect(ofType(state, "punchHit").map((e) => e.target)).toEqual([
            "boss",
            "player",
        ])
    })
})

// The guard stance (KDA-293): a block holds the enemy still for a moment.
describe("the guard stance", () => {
    const PUNCH = { held: [], pressed: vec2(0, 0), punch: true }
    // Blocks every punch (and every AI draw is 0).
    const BLOCK = () => 0
    // Blocks none.
    const LAND = () => 0.99
    // A guarder ready to move a cell ahead of the player, who has health
    // to spare for its catches.
    function setup() {
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.guard = GUARD_CAP
        enemy.moveProgress = 1
        const state = makeState(room, { x: 2, y: 1 }, [enemy], {
            health: 100,
        })
        return { enemy, state, player: state.players[0] }
    }
    const STANCE_TICKS = Math.round(GUARD_STANCE * TICK_RATE)

    it("lasts 0.4 s from a block", () => {
        expect(GUARD_STANCE).toBe(0.4)
        const { enemy, state, player } = setup()
        expect(inStance(enemy)).toBe(false)
        punch(state, player, BLOCK)
        expect(enemy.stance).toBe(GUARD_STANCE)
        expect(inStance(enemy)).toBe(true)
    })

    it("holds a ready enemy still until it is over, then lets it move", () => {
        const { enemy, state } = setup()
        // The block's own tick and the rest of the stance: no move.
        step(state, TICK, PUNCH, BLOCK)
        expect(ofType(state, "punchBlocked")).toHaveLength(1)
        for (let i = 1; i < STANCE_TICKS; i++) {
            step(state, TICK, IDLE, BLOCK)
            expect(enemy.pos, `tick ${i}`).toEqual(vec2(3, 1))
            expect(enemy.heldFor).toBe(0)
        }
        expect(inStance(enemy)).toBe(true)
        step(state, TICK, IDLE, BLOCK)
        expect(inStance(enemy)).toBe(false)
        // Over: the chaser goes for the player.
        expect(enemy.pos).toEqual(vec2(2, 1))
    })

    it("doesn't hold an enemy that wasn't blocked", () => {
        const { enemy, state } = setup()
        enemy.guard = 0
        step(state, TICK, IDLE, BLOCK)
        expect(enemy.pos).toEqual(vec2(2, 1))
    })

    it("is counted in game time, at each tick's start", () => {
        const { enemy, state } = setup()
        enemy.stance = GUARD_STANCE
        tickStances(state, 0.1)
        expect(enemy.stance).toBeCloseTo(0.3)
        tickStances(state, 0.3)
        expect(enemy.stance).toBe(0)
        tickStances(state, 0.1)
        expect(enemy.stance).toBe(0)
    })

    it("starts over on a block during it", () => {
        const { enemy, state } = setup()
        step(state, TICK, PUNCH, BLOCK)
        for (let i = 1; i < STANCE_TICKS / 2; i++) {
            step(state, TICK, IDLE, BLOCK)
        }
        step(state, TICK, PUNCH, BLOCK)
        expect(ofType(state, "punchBlocked")).toHaveLength(1)
        expect(enemy.stance).toBe(GUARD_STANCE)
        // Held a whole stance from the second block.
        for (let i = 1; i < STANCE_TICKS; i++) {
            step(state, TICK, IDLE, BLOCK)
            expect(enemy.pos).toEqual(vec2(3, 1))
        }
        step(state, TICK, IDLE, BLOCK)
        expect(enemy.pos).toEqual(vec2(2, 1))
    })

    it("pins a guarder that is mashed, never knocking it back", () => {
        const { enemy, state } = setup()
        for (let i = 0; i < TICK_RATE * 2; i++) {
            step(state, TICK, i % 6 === 0 ? PUNCH : IDLE, BLOCK)
            expect(enemy.pos).toEqual(vec2(3, 1))
        }
        expect(enemy.knocks).toBe(0)
    })

    it("ends when a punch lands, which knocks it back as usual", () => {
        const { enemy, state, player } = setup()
        punch(state, player, BLOCK)
        punch(state, player, LAND)
        expect(ofType(state, "punchHit")).toHaveLength(1)
        expect(inStance(enemy)).toBe(false)
        expect(enemy.pos).toEqual(vec2(4, 1))
        expect(enemy.knocks).toBe(1)
    })

    // Our call: a landed hit ends it even on a held enemy, which a hit
    // doesn't move.
    it("ends on a held enemy's hit too", () => {
        const { enemy, state, player } = setup()
        punch(state, player, BLOCK)
        addStatus(enemy, { name: "test.freeze", holds: true }, 5)
        punch(state, player, BLOCK)
        expect(ofType(state, "punchHit")).toHaveLength(1)
        expect(inStance(enemy)).toBe(false)
    })

    it("is cleared by a defeat, and so gone once the enemy is back", () => {
        const { enemy, state, player } = setup()
        punch(state, player, BLOCK)
        defeatEnemy(state, enemy)
        expect(enemy.stance).toBe(0)
    })

    it("is cleared from both halves of a split Splitter", () => {
        const [main, spare] = createSplitter(
            [ENEMY_IDS[0], ENEMY_IDS[1]],
            vec2(3, 1)
        )
        const state = makeState(room, { x: 1, y: 1 }, [main, spare])
        main.stance = GUARD_STANCE
        spare.stance = GUARD_STANCE
        splitSplitter(state, 0)
        expect(main.stance).toBe(0)
        expect(spare.stance).toBe(0)
    })

    it("finishes the glide it is in, with no jump, then holds", () => {
        const { enemy, state } = setup()
        // Just out of its cell, gliding away from the player, quick enough
        // to finish well inside the stance.
        enemy.lastPos = vec2(3, 1)
        enemy.pos = vec2(4, 1)
        enemy.moveProgress = 0.05
        enemy.speed = 6
        const cols = state.cells[0].length
        const rows = state.cells.length
        const drawn = () => drawnPos(enemy, cols, rows)
        let was = drawn().x
        step(state, TICK, PUNCH, BLOCK)
        expect(ofType(state, "punchBlocked")).toHaveLength(1)
        const xs = [drawn().x]
        for (let i = 1; i < STANCE_TICKS; i++) {
            step(state, TICK, IDLE, BLOCK)
            xs.push(drawn().x)
        }
        for (const x of xs) {
            // On along its glide, never more than a tick's worth at once.
            expect(x).toBeGreaterThanOrEqual(was - 1e-9)
            expect(x - was).toBeLessThanOrEqual(enemy.speed * TICK + 1e-9)
            expect(drawn().y).toBe(1)
            was = x
        }
        // It got there, and stayed.
        expect(xs.at(-1)).toBeCloseTo(4)
        expect(enemy.pos).toEqual(vec2(4, 1))
        expect(xs.filter((x) => Math.abs(x - 4) < 1e-9).length).toBeGreaterThan(
            STANCE_TICKS / 2
        )
        // Then it moves on.
        step(state, TICK, IDLE, BLOCK)
        expect(enemy.pos).not.toEqual(vec2(4, 1))
    })

    it("freezes with the game: nothing but a step counts it down", () => {
        const { enemy, state, player } = setup()
        punch(state, player, BLOCK)
        // No steps (the game is paused): still a whole stance.
        expect(enemy.stance).toBe(GUARD_STANCE)
        step(state, TICK, IDLE, BLOCK)
        expect(enemy.stance).toBeCloseTo(GUARD_STANCE - TICK)
    })
})
