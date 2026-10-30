import { describe, expect, it } from "vite-plus/test"
import { MAX_ENEMIES } from "./constants"
import {
    DEFAULT_DIFFICULTY,
    DIFFICULTIES,
    DIFFICULTY_LABELS,
    difficultyDescription,
    ENEMY_COUNT,
    isDifficulty,
    MAP_SIZE,
    MAP_SIZES,
} from "./difficulty"
import { createGameState } from "./game"
import { parseLevel, sameForBoth, type LevelData } from "./level"
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
