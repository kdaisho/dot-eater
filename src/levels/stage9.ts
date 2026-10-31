import type { LevelData } from "../level"

// Gauntlet: the final exam before the last boss, and the hardest dot stage.
// Between them its maps have every enemy type: the large map a chaser, an
// ambusher, a wanderer, a patroller and interceptors (Hard), and a
// Splitter (Super Hard); the medium map a chaser, an ambusher and the
// phantom, three different ones even at Easy, and an interceptor (Medium).
// The interceptors leave Super Hard no room for the phantom. The chasers and
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
        // Easy: a chaser, an ambusher and the phantom; Medium adds an
        // interceptor.
        enemies: [
            { ai: "chase", speed: 2.25 },
            { ai: "ambusher", speed: 2.25 },
            { ai: "phantom" },
            { ai: "interceptor" },
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
        // Hard: a chaser, an ambusher, a wanderer, an interceptor, the
        // patroller circling the arena and a second interceptor; Super Hard
        // adds the Splitter and a third interceptor.
        enemies: [
            { ai: "chase", speed: 2.25 },
            { ai: "ambusher", speed: 2.25 },
            { ai: "random" },
            { ai: "interceptor" },
            {
                ai: "patroller",
                route: [
                    [7, 5],
                    [21, 5],
                    [21, 15],
                    [7, 15],
                ],
            },
            { ai: "interceptor" },
            { ai: "splitter" },
            { ai: "interceptor" },
        ],
    },
}
