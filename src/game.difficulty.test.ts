import { describe, expect, it } from "vite-plus/test"
import { defeatEnemy, inPlay } from "./breath"
import {
    AiType,
    BOSS_BREATH_EVERY,
    BOSS_SPEED,
    ENEMY_SPEED,
    PHANTOM_SPEED,
    RESPAWN_DELAY,
    SPLITTER_HALF_SPEED,
    TICK_RATE,
} from "./constants"
import {
    DIFFICULTIES,
    ENEMY_SPEED_CAP,
    enemySpeed,
    KNOCK_DECAY,
    USUAL_KNOCK,
} from "./difficulty"
import { createGameState, IDLE, step } from "./game"
import { stages } from "./levels"
import { makeEnemy, makeState, seededRandom, textMap } from "./test/helpers"

// What a game's difficulty does to its enemies and boss (KDA-290; the
// numbers are placeholders to tune at preview).

const TICK = 1 / TICK_RATE

const stage5 = stages[4]
const stage9 = stages[8]
const stage10 = stages[9]

describe("createGameState at a difficulty", () => {
    it("speeds up every enemy by the difficulty, and not the boss", () => {
        for (const d of DIFFICULTIES) {
            const level = stage10[d]
            const game = createGameState(level, "dragon", "solo", d)
            // Its enemies are at their defaults: a phantom's and the
            // Splitters' (the spare slot at its halves') among them.
            for (const enemy of game.enemies) {
                const base =
                    enemy.ai === AiType.phantom
                        ? PHANTOM_SPEED
                        : enemy.part?.slot === "spare"
                          ? SPLITTER_HALF_SPEED
                          : ENEMY_SPEED
                expect(enemy.speed).toBeCloseTo(enemySpeed(base, d))
            }
            expect(game.boss!.speed).toBe(BOSS_SPEED)
        }
    })

    it("caps stage 9's faster enemies on Super Hard", () => {
        const level = stage9.superHard
        const plain = createGameState(level).enemies
        const game = createGameState(level, "dragon", "solo", "superHard")
        expect(plain.filter((e) => e.speed === 2.25).length).toBeGreaterThan(0)
        game.enemies.forEach((enemy, i) => {
            const speed = plain[i].speed
            expect(enemy.speed).toBe(enemySpeed(speed, "superHard"))
            if (speed === 2.25) expect(enemy.speed).toBe(ENEMY_SPEED_CAP)
            expect(enemy.speed).toBeLessThanOrEqual(ENEMY_SPEED_CAP)
        })
    })

    it("speeds up a Splitter whole and split, and whole again", () => {
        const game = createGameState(
            stage10.superHard,
            "dragon",
            "solo",
            "superHard"
        )
        const i = game.enemies.findIndex((e) => e.part?.slot === "main")
        const [main, spare] = [game.enemies[i], game.enemies[i + 1]]
        const whole = enemySpeed(ENEMY_SPEED, "superHard")
        const half = enemySpeed(SPLITTER_HALF_SPEED, "superHard")
        expect(half).toBe(ENEMY_SPEED_CAP)
        expect(main.speed).toBeCloseTo(whole)
        // Halves are still faster than the whole.
        expect(half).toBeGreaterThan(whole)
        defeatEnemy(game, main)
        expect(main.speed).toBe(half)
        expect(spare.speed).toBe(half)
        defeatEnemy(game, main)
        defeatEnemy(game, spare)
        expect(main.speed).toBeCloseTo(whole)
        // Back whole after Super Hard's shorter wait.
        expect(main.respawnIn).toBeCloseTo(RESPAWN_DELAY * 0.6)
    })

    it("uses the difficulty's knockback decay and respawn wait", () => {
        for (const d of DIFFICULTIES) {
            const game = createGameState(stage5[d], "dragon", "solo", d)
            expect(game.knock).toBe(KNOCK_DECAY[d])
        }
        const respawn = (d: (typeof DIFFICULTIES)[number]) =>
            createGameState(stage5[d], "dragon", "solo", d).respawnDelay
        expect(respawn("easy")).toBe(RESPAWN_DELAY)
        expect(respawn("medium")).toBe(RESPAWN_DELAY)
        expect(respawn("hard")).toBe(RESPAWN_DELAY)
        expect(respawn("superHard")).toBeCloseTo(3)
    })

    it("has the boss breathe at 0.75 of its every on Super Hard, with its wind-up kept", () => {
        const ticks = (seconds: number) => Math.round(seconds * TICK_RATE)
        for (const [stage, every] of [
            [stage5, BOSS_BREATH_EVERY],
            [stage10, 2.5],
        ] as const) {
            const plain = createGameState(stage.superHard).boss!.breath
            expect(plain.every).toBe(ticks(every))
            for (const d of DIFFICULTIES) {
                const { breath } = createGameState(
                    stage[d],
                    "dragon",
                    "solo",
                    d
                ).boss!
                const scaled = d === "superHard" ? every * 0.75 : every
                expect(breath.every).toBe(ticks(scaled))
                // The first breath's grace period too.
                expect(breath.cooldown).toBe(breath.every)
                expect(breath.windUp).toBe(plain.windUp)
                // Time to see it coming and step aside.
                expect(breath.windUp).toBeGreaterThanOrEqual(0.75 * TICK_RATE)
                expect(breath.every).toBeGreaterThan(breath.windUp)
            }
        }
    })

    // Seeded tests that pass no difficulty play as before.
    it("leaves everything as the level has it without a difficulty", () => {
        const level = stage9.superHard
        const game = createGameState(level)
        const speeds = game.enemies.map((e) => e.speed)
        // The chaser and ambusher at the level's 2.25, the rest at their
        // defaults: a breather, a phantom, a patroller, a second breather
        // (KDA-291), a Splitter and its spare slot, and a random.
        expect(speeds).toEqual([
            2.25,
            2.25,
            ENEMY_SPEED,
            PHANTOM_SPEED,
            ENEMY_SPEED,
            ENEMY_SPEED,
            ENEMY_SPEED,
            SPLITTER_HALF_SPEED,
            ENEMY_SPEED,
        ])
        expect(game.enemies).toHaveLength(level.enemies.length + 1)
        expect(game.knock).toBe(USUAL_KNOCK)
        expect(game.respawnDelay).toBe(RESPAWN_DELAY)
        const { breath } = createGameState(stage10.superHard).boss!
        expect(breath.every).toBe(Math.round(2.5 * TICK_RATE))
    })
})

describe("a defeated enemy on Super Hard", () => {
    // An open room, with a dot shut away below so the game isn't won.
    const room = textMap([
        "#########",
        "#       #",
        "#       #",
        "#########",
        "#.#######",
    ]).map

    it("comes back after 60% of the usual wait", () => {
        const enemy = makeEnemy(6, 1)
        const state = makeState(room, { x: 1, y: 1 }, [enemy], {
            health: 100,
        })
        state.respawnDelay = createGameState(
            stage5.superHard,
            "dragon",
            "solo",
            "superHard"
        ).respawnDelay
        defeatEnemy(state, enemy)
        expect(enemy.respawnIn).toBeCloseTo(3)
        const random = seededRandom(1)
        const ticks = Math.round(3 * TICK_RATE)
        for (let i = 0; i < ticks - 1; i++) {
            step(state, TICK, IDLE, random)
            expect(inPlay(enemy)).toBe(false)
        }
        step(state, TICK, IDLE, random)
        expect(inPlay(enemy)).toBe(true)
    })
})
