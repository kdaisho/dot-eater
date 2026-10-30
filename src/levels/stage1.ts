import type { LevelData } from "../level"

// The tutorial stage: a plain open maze in the spirit of the original 9x9
// one. Both maps are left-right symmetric, with a wrap tunnel through the
// middle row and no dead ends: long straight corridors to breathe down, and
// small loops everywhere to dodge round. The medium map (21x17) is today's
// classic layout grown a little; the large one (29x21) adds a second band
// of blocks above and below, small loops at the sides of the tunnel, and a
// corridor right across the map above and below the middle. The enemies
// start in a ring round a wall block in the middle, left by one exit at the
// top and one at the bottom on the large map, well away from the player at
// the bottom, and move at the default (half the player's) speed. The first
// three in are two wanderers and a chaser; an ambusher joins as the fourth,
// and the large map adds more chasers and a second ambusher.
export const stage1: LevelData = {
    name: "Classic",
    medium: {
        parTime: 80,
        map: [
            "#####################",
            "#.........#.........#",
            "#.###.###.#.###.###.#",
            "#...................#",
            "#.###.#.#####.#.###.#",
            "#.....#...#...#.....#",
            "#####.###.#.###.#####",
            "#####.#..E.E..#.#####",
            "......#.#####.#......",
            "#####.#..E.E..#.#####",
            "#####.#.#####.#.#####",
            "#.........#.........#",
            "#.###.###.#.###.###.#",
            "#.....#.......#.....#",
            "#.###.#.#####.#.###.#",
            "#.........PQ........#",
            "#####################",
        ],
        enemies: [
            { ai: "random" },
            { ai: "chase" },
            { ai: "random" },
            { ai: "ambusher" },
        ],
    },
    large: {
        parTime: 140,
        map: [
            "#############################",
            "#.............#.............#",
            "#.###.#####.#.#.#.#####.###.#",
            "#...........................#",
            "#.###.#.#####.#.#####.#.###.#",
            "#.....#.....#...#.....#.....#",
            "#####.#####.#####.#####.#####",
            "#...#...................#...#",
            "#.#.#.########.########.#.#.#",
            "#.#.#.###.E.E...E.E.###.#.#.#",
            "......###.#########.###......",
            "#.#.#.###.E.E...E.E.###.#.#.#",
            "#.#.#.########.########.#.#.#",
            "#...#...................#...#",
            "#####.#####.#####.#####.#####",
            "#.....#.....#...#.....#.....#",
            "#.###.#.#####.#.#####.#.###.#",
            "#...........................#",
            "#.###.#####.#.#.#.#####.###.#",
            "#.............PQ............#",
            "#############################",
        ],
        enemies: [
            { ai: "random" },
            { ai: "chase" },
            { ai: "random" },
            { ai: "ambusher" },
            { ai: "chase" },
            { ai: "random" },
            { ai: "ambusher" },
            { ai: "chase" },
        ],
    },
}
