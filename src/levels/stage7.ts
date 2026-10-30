import type { LevelData } from "../level"

// Patrol base: a grid of rooms joined by one-cell doors, inside a corridor
// that runs all round the base. Patrollers walk fixed beats: one round the
// outer corridor, others through a row or a column of rooms, so the player
// learns their timing and slips past behind them. Ambushers start on the
// doors between rooms, and chasers inside the rooms. Every inner wall is one
// cell thick, so the Boar can open a shortcut into the next room, and a punch
// shoves a guard back out of a doorway. Every room has at least two doors,
// so there is always another way round. No tunnels, ice or fog. Left-right
// symmetric walls, no dead ends.
export const stage7: LevelData = {
    name: "Patrol base",
    medium: {
        parTime: 80,
        map: [
            "#####################",
            "#         E         #",
            "# ##.###########.## #",
            "# #....#.....#....# #",
            "# #....E.........E# #",
            "# #E...#.....#....# #",
            "# ########.######## #",
            "# #....#.....#....# #",
            "# ........#........ #",
            "# #....#.....#....# #",
            "# ##.#####.#####.## #",
            "# #....#.....#....# #",
            "# #...............# #",
            "# #....#.....#....# #",
            "# ##.#####.#####.## #",
            "#        PQ         #",
            "#####################",
        ],
        enemies: [
            // Round the outer corridor, clockwise.
            {
                ai: "patroller",
                route: [
                    [19, 1],
                    [19, 15],
                    [1, 15],
                    [1, 1],
                ],
            },
            { ai: "ambusher" },
            // Back and forth through the top row of rooms.
            {
                ai: "patroller",
                route: [
                    [3, 4],
                    [17, 4],
                ],
            },
            { ai: "chase" },
        ],
    },
    large: {
        parTime: 125,
        map: [
            "#############################",
            "#             E             #",
            "# ###.#################.### #",
            "# #.....#.....#.....#.....# #",
            "# #.###.E.###...###...###E# #",
            "# #.....#..E..#.....#..E..# #",
            "# #########.#####.######### #",
            "# #.....#.....#.....#.....# #",
            "# ..###....#..#..#..E.###.. #",
            "# #.....#.....#.....#.....# #",
            "# ###.#################.### #",
            "# #.....#.....#.....#.....# #",
            "# #E###....#.....#....###.# #",
            "# #.....#.....#.....#.....# #",
            "# #########.#####.######### #",
            "# #.....#.....#.....#.....# #",
            "# ..###...###.#.###...###E. #",
            "# #.....#.....#.....#.....# #",
            "# #########.#####.######### #",
            "#            PQ             #",
            "#############################",
        ],
        enemies: [
            // Round the outer corridor, clockwise.
            {
                ai: "patroller",
                route: [
                    [27, 1],
                    [27, 19],
                    [1, 19],
                    [1, 1],
                ],
            },
            { ai: "ambusher" },
            // Back and forth through the top row of rooms.
            {
                ai: "patroller",
                route: [
                    [3, 4],
                    [25, 4],
                ],
            },
            // Down one middle column of rooms and up the other.
            {
                ai: "patroller",
                route: [
                    [11, 17],
                    [17, 17],
                    [17, 3],
                    [11, 3],
                ],
            },
            { ai: "chase" },
            { ai: "ambusher" },
            // Back and forth through the third row of rooms.
            {
                ai: "patroller",
                route: [
                    [25, 12],
                    [3, 12],
                ],
            },
            { ai: "chase" },
        ],
    },
}
