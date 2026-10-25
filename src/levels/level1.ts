import type { LevelData } from "../level"

// The original hard-coded 9x9 maze.
export const level1: LevelData = {
    name: "Level 1",
    map: [
        "####.####",
        "#...P...#",
        "#.#.#.#.#",
        "#.#.#.#.#",
        ".E..#..E.",
        "#.#...#.#",
        "#.#####.#",
        "#.......#",
        "####.####",
    ],
    enemies: [
        { ai: "random", speed: 1 },
        { ai: "chase", speed: 1 },
    ],
}
