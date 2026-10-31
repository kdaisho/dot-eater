import type { LevelData } from "../level"

// Wrap-around tunnels on every edge, so running off one side is the main way
// to escape. The medium map (21x17) has three rows that wrap left to right
// and four columns that wrap top to bottom; the large one (29x21) has five
// rows and six columns. Introduces the ambusher, which aims a few cells ahead
// of the player along their heading; with tunnels on every side, that cell is
// often across the map from where the ambusher waits, so it has to be
// outrun. The ambusher comes in first, then a chaser and a wanderer; the
// fourth is an interceptor on the medium map and a second ambusher on the
// large one, which adds interceptors and a third ambusher. Left-right
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
            { ai: "random" },
            { ai: "interceptor" },
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
            { ai: "random" },
            { ai: "ambusher" },
            { ai: "interceptor" },
            { ai: "interceptor" },
            { ai: "ambusher" },
            { ai: "interceptor" },
        ],
    },
}
