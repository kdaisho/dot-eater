import type { LevelData } from "../level"

// Boss lair: a big 2x2 boss (🐙, see boss.ts) roams a walled arena in the
// middle, between two rows of pillars, along lanes at least 2 cells wide.
// It chases the player but only goes where it fits, so the 1-wide corridor
// round the arena, and the three 1-wide doors into it, are safe from it;
// there a Splitter and a chaser hunt instead, starting in the top corners.
// The arena holds most of the dots, so the player has to go in, and breathes
// at the boss from the doors and lanes: the stage is cleared once every dot
// is eaten and the boss is defeated. The player starts at the bottom, far
// from everything, behind the arena's one wall without a door. No tunnels
// and no ice (the boss uses neither), no dead ends, left-right symmetric
// walls.
export const stage5: LevelData = {
    name: "Boss lair",
    parTime: 90,
    map: [
        "#################",
        "#E.............E#",
        "#.######.######.#",
        "#.#...........#.#",
        "#.#...........#.#",
        "#.#..##...##..#.#",
        "#.#...........#.#",
        "#......B........#",
        "#.#...........#.#",
        "#.#..##...##..#.#",
        "#.#...........#.#",
        "#.#...........#.#",
        "#.#############.#",
        "#.......PQ......#",
        "#################",
    ],
    enemies: [{ ai: "splitter" }, { ai: "chase" }],
    boss: {},
}
