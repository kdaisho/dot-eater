import type { LevelData } from "../level"

// Frozen fog: stage 3's ice under stage 4's fog. The maze is a grid of
// small ice rooms ("~", or ":" with a dot) between normal-floor corridors,
// so the floor is always a safe way round, but the ice holds dots too.
// A slide carries the player up to 6 cells (posts in every room stop it
// sooner) and the light reaches 4, so a long slide commits the player to a
// line without seeing its end. It never goes far into the dark: every slide ends
// at most two cells past the light, on floor or against a post, and never
// next to an enemy spawn. The large map adds a frozen river across the
// middle, three rows of ice with staggered posts. Every enemy slides too,
// except the phantom, which drifts through walls and ignores the ice. A
// Penguin player walks on the ice as on floor, so this is its stage. No wrap
// tunnels (the phantom doesn't use them) and no dead ends, so the player is
// never cornered in the dark. Walls and ice are mirrored left to right. The
// enemies start in the top rows, the player at the bottom in the middle.
export const stage8: LevelData = {
    name: "Frozen fog",
    medium: {
        parTime: 110,
        map: [
            "#####################",
            "#E.................E#",
            "#.##.####.#.####.##.#",
            "#......E.....E......#",
            "#.###.##.###.##.###.#",
            "#...................#",
            "#.:~:~:.:~:~:.:~:~:.#",
            "#.~#~~:.~#~#~.:~~#~.#",
            "#.:~:#:.:~:~:.:#:~:.#",
            "#...................#",
            "#.~:~:~.~:~:~.~:~:~.#",
            "#.:~~#:.:~#~:.:#~~:.#",
            "#.~:~:~.~:~:~.~:~:~.#",
            "#...................#",
            "#.##.##.##.##.##.##.#",
            "#.........PQ........#",
            "#####################",
        ],
        // Easy: a chaser, a wanderer and the phantom; Medium adds the
        // ambusher.
        enemies: [
            { ai: "chase" },
            { ai: "random" },
            { ai: "phantom" },
            { ai: "ambusher" },
        ],
    },
    large: {
        parTime: 220,
        map: [
            "#############################",
            "#E....E....E.....E....E....E#",
            "#.##.####.####.####.####.##.#",
            "#........E.........E........#",
            "#.####.####.#####.####.####.#",
            "#...........................#",
            "#.:~:~.~:~:.:~:~:.:~:~.~:~:.#",
            "#.~#~:.:~#~.~#~#~.~#~:.:~#~.#",
            "#.:~~:.~:~:.:~:~:.:~:~.:~~:.#",
            "#...........................#",
            "#~:~:#:~:~:#:~:~:#:~:~:#:~:~#",
            "#:#:~:~:#:~:~:#:~:~:#:~:~:#:#",
            "#~:~#~:~:~#~:~#~:~#~:~:~#~:~#",
            "#...........................#",
            "#.~:~:.:~:~.~:~:~.~:~:.:~:~.#",
            "#.:~~#.~#~:.:~#~:.:~#~.#~~:.#",
            "#.~:~:.:~:~.~:~:~.~:~:.:~:~.#",
            "#...........................#",
            "#.##.###.###.#.#.###.###.##.#",
            "#.............PQ............#",
            "#############################",
        ],
        // Hard: the medium map's four, a patroller circling the upper rooms
        // and a second chaser; Super Hard adds a Splitter and a second
        // wanderer.
        enemies: [
            { ai: "chase" },
            { ai: "random" },
            { ai: "phantom" },
            { ai: "ambusher" },
            {
                ai: "patroller",
                route: [
                    [6, 5],
                    [22, 5],
                    [22, 9],
                    [6, 9],
                ],
            },
            { ai: "chase" },
            { ai: "splitter" },
            { ai: "random" },
        ],
    },
    rules: { fog: { radius: 4 } },
}
