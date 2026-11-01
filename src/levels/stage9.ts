import type { LevelData } from "../level"

// Gauntlet: the final exam before the last boss, and the hardest dot stage.
// Between its maps it has every enemy type but the wanderer: the medium map
// a chaser, an ambusher and a breather (KDA-291), three different ones
// even at Easy, and an interceptor (KDA-292); the large map two
// interceptors, two breathers, the phantom and a patroller (Hard), then a
// Splitter and a third interceptor (Super Hard). The interceptors leave no
// room for all eight at one difficulty. The hunters (the chaser, the
// ambusher and the large map's first two interceptors) are a little
// faster here than anywhere else (2.25 cells per
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
        // an interceptor (KDA-292).
        enemies: [
            { ai: "chase", speed: 2.25 },
            { ai: "ambusher", speed: 2.25 },
            { ai: "breather" },
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
        // Hard: the hunters (two interceptors, KDA-292), two breathers
        // (KDA-291), the phantom and the patroller circling the arena;
        // Super Hard adds the Splitter and a third interceptor, starting in
        // the side passages.
        enemies: [
            { ai: "interceptor", speed: 2.25 },
            { ai: "interceptor", speed: 2.25 },
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
            { ai: "interceptor" },
        ],
    },
}
