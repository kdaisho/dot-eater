import type { LevelData } from "../level"

// Wrap-around tunnels on every edge: three rows wrap left to right and four
// columns wrap top to bottom, so running off one side is the main way to
// escape. Introduces the ambusher, which aims a few cells ahead of the player
// in a straight line without wrapping: heading into a tunnel, it aims at the
// near mouth, not the far side, so the tunnel shakes it off. Left-right
// symmetric, with no dead ends. The enemies start in a pen in the middle that
// opens upwards, away from the player at the bottom, and move at the default
// (half the player's) speed.
export const stage2: LevelData = {
    name: "Wrap maze",
    map: [
        "##.#.#######.#.##",
        "#...............#",
        "#.###.#.#.#.###.#",
        "..#.....#.....#..",
        "#.#.###.#.###.#.#",
        "#.....#.E.#.....#",
        "#.###.#.#.#.###.#",
        "......#E.E#......",
        "#.###.#####.###.#",
        "#...............#",
        "#.###.#.#.#.###.#",
        "..#...#...#...#..",
        "#.#.###.#.###.#.#",
        "#.......P.......#",
        "##.#.#######.#.##",
    ],
    enemies: [{ ai: "ambusher" }, { ai: "chase" }, { ai: "random" }],
}
