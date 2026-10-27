import type { LevelData } from "../level"

// The tutorial stage: a larger maze in the spirit of the original 9x9 one.
// Left-right symmetric, with a wrap tunnel through the middle row and no dead
// ends. The enemies start in the middle, well away from the player at the
// bottom, and move at the default (half the player's) speed.
export const stage1: LevelData = {
    name: "Classic",
    parTime: 60,
    map: [
        "#################",
        "#.......#.......#",
        "#.##.##.#.##.##.#",
        "#...............#",
        "#.##.#.###.#.##.#",
        "#....#.E.E.#....#",
        "####.###.###.####",
        ".....#.....#.....",
        "####.#.###.#.####",
        "#...............#",
        "#.##.###.###.##.#",
        "#....#.....#....#",
        "#.##.#.###.#.##.#",
        "#.......PQ......#",
        "#################",
    ],
    enemies: [{ ai: "random" }, { ai: "chase" }],
}
