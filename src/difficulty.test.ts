import { describe, expect, it } from "vite-plus/test"
import { BREATHS } from "./breaths"
import { MAX_ENEMIES, PLAYER_SPEED } from "./constants"
import {
    BOSS_BREATH_SCALE,
    DEFAULT_DIFFICULTY,
    DIFFICULTIES,
    DIFFICULTY_LABELS,
    difficultyDescription,
    ENEMY_COUNT,
    ENEMY_SPEED_CAP,
    ENEMY_SPEED_SCALE,
    enemySpeed,
    GUARD,
    isDifficulty,
    KNOCK_DECAY,
    MAP_SIZE,
    MAP_SIZES,
    RESPAWN_SCALE,
    USUAL_KNOCK,
} from "./difficulty"
import { createGameState } from "./game"
import { parseLevel, sameForBoth, type LevelData } from "./level"
import { ANIMAL_IDS } from "./roster"
import { vec2 } from "./vec2"

describe("difficulties", () => {
    it("go from Easy to Super Hard, Medium by default", () => {
        expect(DIFFICULTIES).toEqual(["easy", "medium", "hard", "superHard"])
        expect(DEFAULT_DIFFICULTY).toBe("medium")
    })

    it("bring out more enemies the harder they are, up to MAX_ENEMIES", () => {
        const counts = DIFFICULTIES.map((d) => ENEMY_COUNT[d])
        expect(counts).toEqual([...counts].sort((a, b) => a - b))
        expect(new Set(counts).size).toBe(counts.length)
        expect(Math.max(...counts)).toBeLessThanOrEqual(MAX_ENEMIES)
        expect(Math.min(...counts)).toBeGreaterThan(0)
    })

    it("play Easy and Medium on the medium map, Hard and Super Hard on the large", () => {
        expect(MAP_SIZES).toEqual(["medium", "large"])
        expect(DIFFICULTIES.map((d) => MAP_SIZE[d])).toEqual([
            "medium",
            "medium",
            "large",
            "large",
        ])
    })
})

// KDA-290 (with the user; the numbers are placeholders to tune at
// preview): stronger enemies at every difficulty, and Super Hard much
// harder.
describe("how strong enemies are at each difficulty", () => {
    it("speeds them up more the harder it is", () => {
        expect(ENEMY_SPEED_SCALE).toEqual({
            easy: 1.1,
            medium: 1.25,
            hard: 1.4,
            superHard: 1.65,
        })
        const scales = DIFFICULTIES.map((d) => ENEMY_SPEED_SCALE[d])
        expect(new Set(scales).size).toBe(scales.length)
        expect(scales).toEqual([...scales].sort((a, b) => a - b))
    })

    it("scales a level's speed, up to the cap", () => {
        expect(ENEMY_SPEED_CAP).toBe(3.4)
        // The default 2 cells/s, at each difficulty.
        const speeds = [2.2, 2.5, 2.8, 3.3]
        DIFFICULTIES.forEach((d, i) => {
            expect(enemySpeed(2, d)).toBeCloseTo(speeds[i])
        })
        // Stage 9's 2.25 hits the cap on Super Hard.
        expect(enemySpeed(2.25, "hard")).toBeCloseTo(3.15)
        expect(enemySpeed(2.25, "superHard")).toBe(ENEMY_SPEED_CAP)
        expect(enemySpeed(5, "easy")).toBe(ENEMY_SPEED_CAP)
    })

    it("caps them below every character, so each can outrun a chase", () => {
        const slowest = Math.min(
            ...ANIMAL_IDS.map((a) => PLAYER_SPEED * BREATHS[a].speedScale)
        )
        expect(slowest).toBe(3.5)
        expect(ENEMY_SPEED_CAP).toBeLessThan(slowest)
    })

    it("guards better the harder it is, up to the cap", () => {
        for (const key of ["chance", "min", "max"] as const) {
            const values = DIFFICULTIES.map((d) => GUARD[d][key])
            expect(values).toEqual([...values].sort((a, b) => a - b))
        }
    })

    it("decays the knockback faster and recovers it slower on Super Hard", () => {
        expect(USUAL_KNOCK).toEqual({
            steps: [1, 0.7, 0.5, 0.3, 0],
            lull: 2,
            recover: 0.5,
        })
        expect(KNOCK_DECAY.easy).toBe(USUAL_KNOCK)
        expect(KNOCK_DECAY.medium).toBe(USUAL_KNOCK)
        expect(KNOCK_DECAY.hard).toBe(USUAL_KNOCK)
        expect(KNOCK_DECAY.superHard).toEqual({
            steps: [1, 0.5, 0.2, 0],
            lull: 3,
            recover: 0.75,
        })
        // Each starts at a full cell and ends at none.
        for (const d of DIFFICULTIES) {
            const { steps } = KNOCK_DECAY[d]
            expect(steps[0]).toBe(1)
            expect(steps.at(-1)).toBe(0)
            expect(steps).toEqual([...steps].sort((a, b) => b - a))
        }
    })

    it("brings defeated enemies back sooner on Super Hard only", () => {
        expect(RESPAWN_SCALE).toEqual({
            easy: 1,
            medium: 1,
            hard: 1,
            superHard: 0.6,
        })
    })

    it("has the boss breathe more often on Super Hard only", () => {
        expect(BOSS_BREATH_SCALE).toEqual({
            easy: 1,
            medium: 1,
            hard: 1,
            superHard: 0.75,
        })
    })
})

describe("difficulty names and descriptions", () => {
    it("names each difficulty", () => {
        expect(DIFFICULTIES.map((d) => DIFFICULTY_LABELS[d])).toEqual([
            "Easy",
            "Medium",
            "Hard",
            "Super Hard",
        ])
    })

    it("describes each by its enemies and maze, from the tables", () => {
        expect(DIFFICULTIES.map(difficultyDescription)).toEqual([
            "3 enemies, medium maze",
            "4 enemies, medium maze",
            "6 enemies, large maze",
            "8 enemies, large maze",
        ])
        for (const d of DIFFICULTIES) {
            expect(difficultyDescription(d)).toBe(
                `${ENEMY_COUNT[d]} enemies, ${MAP_SIZE[d]} maze`
            )
        }
    })

    it("knows a difficulty from anything else", () => {
        for (const d of DIFFICULTIES) expect(isDifficulty(d)).toBe(true)
        for (const value of ["", "Hard", "nightmare", null, 1, "toString"]) {
            expect(isDifficulty(value)).toBe(false)
        }
    })
})

describe("createGameState at a difficulty", () => {
    // One map with a spawn for every enemy Super Hard brings out.
    const data: LevelData = {
        name: "eight",
        ...sameForBoth({
            parTime: 60,
            map: [
                "##########",
                "#EEEEEEEE#",
                "#........#",
                "#........#",
                "#...P....#",
                "##########",
            ],
            enemies: Array.from({ length: MAX_ENEMIES }, () => ({
                ai: "random" as const,
            })),
        }),
    }

    it.each(DIFFICULTIES)(
        "starts %s with its count of enemies",
        (difficulty) => {
            const game = createGameState(parseLevel(data, difficulty))
            const count = ENEMY_COUNT[difficulty]
            expect(game.enemies).toHaveLength(count)
            expect(game.spawns.enemies).toEqual(
                Array.from({ length: count }, (_, i) => vec2(i + 1, 1))
            )
        }
    )
})
