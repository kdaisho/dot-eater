import type { LevelData } from "../level"

// Patrol base: a grid of rooms joined by one-cell doors, inside a corridor
// that runs all round the base. Patrollers walk fixed beats: one round the
// outer corridor, others along a row of rooms or (on the large map) a loop
// round the middle of the base, so the player learns their timing and slips
// past behind them. Breathers (KDA-291) and an ambusher start on the doors
// between rooms, and chasers inside the rooms. Every inner wall is one cell thick, so the Boar can open
// a shortcut into the next room, and a punch shoves a guard back out of a
// doorway. Every room has at least two doors, so there is always another way
// round. No tunnels, ice or fog. Left-right symmetric walls, no dead ends.
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
            { ai: "breather" },
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
            { ai: "breather" },
            // Back and forth through the top row of rooms, from its spawn
            // at the right-hand end. Going by the door in the centre wall
            // keeps it in the rooms: from end to end the outer corridor is
            // shorter.
            {
                ai: "patroller",
                route: [
                    [14, 4],
                    [3, 4],
                    [14, 4],
                    [25, 4],
                ],
            },
            // A loop round the middle of the base: up through the middle
            // rooms right of the centre wall (stepping out into the
            // right-hand rooms where there is no door straight up), through
            // the top rooms' door in the centre wall, down the left side the
            // same way, and back along the bottom corridor, past the
            // player's start.
            {
                ai: "patroller",
                route: [
                    [11, 17],
                    [17, 17],
                    [17, 3],
                    [11, 3],
                ],
            },
            { ai: "breather" },
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
