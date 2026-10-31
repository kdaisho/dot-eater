import type { LevelData } from "../level"

// Wrap-around tunnels on every edge, so running off one side is the main way
// to escape. The medium map (21x17) has three rows that wrap left to right
// and four columns that wrap top to bottom; the large one (29x21) has five
// rows and six columns. Introduces the ambusher, which aims a few cells ahead
// of the player along their heading; with tunnels on every side, that cell is
// often across the map from where the ambusher waits, so it has to be
// outrun. The ambusher comes in first, then a chaser and a breather
// (KDA-291); the fourth is a second ambusher, and the large map adds a
// second breather, a second chaser, a third ambusher and a wanderer. Left-right
// symmetric, with no dead ends: rows of small blocks with a corridor right
// across the map between each band. The enemies start in a pen in the middle
// that opens upwards, away from the player at the bottom, and move at the
// default (half the player's) speed.
export const stage2: LevelData = {
    name: "Wrap maze",
    medium: {
        parTime: 95,
        map: [
            "###.##.#######.##.###",
            "#...................#",
            "#.##.##.#####.##.##.#",
            "..........#..........",
            "#.##.##.#.#.#.##.##.#",
            "#...................#",
            "#.##.##.#.#.#.##.##.#",
            "#.##.##.#E.E#.##.##.#",
            "........#.#.#........",
            "#.##.##.#E.E#.##.##.#",
            "#.##.##.#####.##.##.#",
            "#...................#",
            "#.##.##.#.#.#.##.##.#",
            "..........#..........",
            "#.##.##.#####.##.##.#",
            "#.........PQ........#",
            "###.##.#######.##.###",
        ],
        enemies: [
            { ai: "ambusher" },
            { ai: "chase" },
            { ai: "breather" },
            { ai: "ambusher" },
        ],
    },
    large: {
        parTime: 150,
        map: [
            "###.###.###.#####.###.###.###",
            "#...........................#",
            "#.###.###.###.#.###.###.###.#",
            "......#.......#.......#......",
            "###.###.###.#####.###.###.###",
            "#...........................#",
            "#.###.###.###.#.###.###.###.#",
            "....#.........#.........#....",
            "###.###.####.###.####.###.###",
            "###.###.####.E.E.####.###.###",
            "........####E###E####........",
            "###.###.####EE.EE####.###.###",
            "###.###.#############.###.###",
            "....#.........#.........#....",
            "#.###.###.###.#.###.###.###.#",
            "#...........................#",
            "###.###.###.#####.###.###.###",
            "......#.......#.......#......",
            "#.###.###.###.#.###.###.###.#",
            "#.............PQ............#",
            "###.###.###.#####.###.###.###",
        ],
        enemies: [
            { ai: "ambusher" },
            { ai: "chase" },
            { ai: "breather" },
            { ai: "ambusher" },
            { ai: "breather" },
            { ai: "chase" },
            { ai: "ambusher" },
            { ai: "random" },
        ],
    },
}
