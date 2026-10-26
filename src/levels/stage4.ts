import type { LevelData } from "../level"

// Fog: the player only sees a few cells around themselves. Introduces the
// phantom, which drifts through walls straight at the player, so it can turn
// up from any side. There are no wrap tunnels: the phantom doesn't use them,
// so a tunnel would make it trivial to escape. Left-right symmetric with no
// dead ends, so the player is never cornered in the dark. The enemies start
// at the top, far from the player at the bottom: the phantom in one corner, a
// chaser in the other and a wanderer in the middle.
export const stage4: LevelData = {
    name: "Fog",
    map: [
        "#################",
        "#E.............E#",
        "#.##.#.#.#.#.##.#",
        "#....#..E..#....#",
        "##.#.###.###.#.##",
        "#..#.........#..#",
        "#.###.##.##.###.#",
        "#.....#...#.....#",
        "#.###.#.#.#.###.#",
        "#...............#",
        "##.#.###.###.#.##",
        "#..#..##.##..#..#",
        "#.###.##.##.###.#",
        "#.......P.......#",
        "#################",
    ],
    enemies: [{ ai: "phantom" }, { ai: "chase" }, { ai: "random" }],
    rules: { fog: { radius: 3.5 } },
}
