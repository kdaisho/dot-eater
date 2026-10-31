import type { LevelData } from "../level"

// Gauntlet: the final exam before the last boss, and the hardest dot stage.
// The large map has every enemy type (a chaser, an ambusher, a breather, the
// phantom, a patroller, a Splitter and a wanderer), all seven at Super Hard,
// with a second breather (KDA-291); the medium map has four of them, three
// different ones even at Easy. The chasers and
// ambushers are a little faster here than anywhere else (2.25 cells per
// second, against the default 2). The maze mixes open rooms (the top
// corners, where the enemies start, and a pillared arena in the middle, where
// a Splitter's halves have room to spread) with tight 1-wide corridors (the
// twisting side passages and the bends at the bottom, by the player's start)
// with no room to dodge. Wrap tunnels run left to right through the top,
// middle and bottom rows; the phantom doesn't use them, so they are the way
// to shake it off. No ice and no fog: the exam is the enemies. No dead ends,
// and the walls are mirrored left to right. The player starts at the bottom
// in the middle, far from every enemy.
export const stage9: LevelData = {
    name: "Gauntlet",
    medium: {
        parTime: 100,
        map: [
            "#####################",
            ".E.................E.",
            "#.......#####.......#",
            "#..#E#..#...#..#E#..#",
            "#.......#.#.#.......#",
            "#...................#",
            "#.#.###.......###.#.#",
            "#.#.#....#.#....#.#.#",
            "..#.#.#.......#.#.#..",
            "#...#.#..#.#..#.#...#",
            "#.###.#.......#.###.#",
            "#...................#",
            "#.#.###.#.#.#.###.#.#",
            "#.#...#.#...#.#...#.#",
            "#.###.#.#####.#.###.#",
            "..........PQ.........",
            "#####################",
        ],
        // Easy: a chaser, an ambusher and a breather (KDA-291); Medium adds
        // the Splitter.
        enemies: [
            { ai: "chase", speed: 2.25 },
            { ai: "ambusher", speed: 2.25 },
            { ai: "breather" },
            { ai: "splitter" },
        ],
    },
    large: {
        parTime: 180,
        map: [
            "#############################",
            ".E.........................E.",
            "#.......#.##.#.#.##.#.......#",
            "#..#E#..#..#..E..#..#..#E#..#",
            "#.......##.#.#.#.#.##.......#",
            "#...........................#",
            "#.#.###.......E.......###.#.#",
            "#.#.#.....#.......#.....#.#.#",
            "#.#.E.#.......#.......#.E.#.#",
            "#.###.#...............#.###.#",
            "..........#.......#..........",
            "#.###.#...............#.###.#",
            "#.#...#.......#.......#...#.#",
            "#.#.#.....#.......#.....#.#.#",
            "#.#.###...............###.#.#",
            "#...........................#",
            "#.#.###.#.##.....##.#.###.#.#",
            "#.#...#.#..#.#.#.#..#.#...#.#",
            "#.###.#.##.#.#.#.#.##.#.###.#",
            "..............PQ.............",
            "#############################",
        ],
        // Hard: the hunters, two breathers (KDA-291), the phantom and the
        // patroller circling the arena; Super Hard adds the Splitter and a
        // wanderer, starting in the side passages, for all seven types.
        enemies: [
            { ai: "chase", speed: 2.25 },
            { ai: "ambusher", speed: 2.25 },
            { ai: "breather" },
            { ai: "phantom" },
            {
                ai: "patroller",
                route: [
                    [7, 5],
                    [21, 5],
                    [21, 15],
                    [7, 15],
                ],
            },
            { ai: "breather" },
            { ai: "splitter" },
            { ai: "random" },
        ],
    },
}
