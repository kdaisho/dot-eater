import type { LevelData } from "../level"

// Fog: the player only sees a few cells around themselves. Introduces the
// phantom, which drifts through walls straight at the player, so it can turn
// up from any side. There are no wrap tunnels: the phantom doesn't use them,
// so a tunnel would make it trivial to escape. Left-right symmetric with no
// dead ends and short walls with many crossings, so the player is never
// cornered in the dark and always has a way round what comes out of it.
// The enemies start at the top, far from the players at the bottom.
//
// The medium map (21x17) is the old maze grown a little. Its enemies are
// the phantom in a top corner, a chaser and a breather (KDA-291) along the
// top, and (from Medium) an interceptor (KDA-292) just below them. The
// large map (29x21) is wider and taller in the same style, with eight
// enemies: the phantom, an interceptor and the breather, a second
// interceptor, then a patroller circling the middle of the maze (a route
// the player can learn but not see) and a second breather (Hard), then a
// third interceptor and a second phantom on the right edge, across the map
// from the first in the top left (Super Hard).
//
// The light's radius is 4 cells on both maps (the rules are shared): half a
// cell more than the old one-map stage had, so with more enemies coming
// from more sides, and the large map's longer corridors, an enemy coming
// out of the dark still gives the player a moment to turn or punch.
export const stage4: LevelData = {
    name: "Fog",
    medium: {
        parTime: 115,
        map: [
            "#####################",
            "#E........E........E#",
            "#.##.#.###.###.#.##.#",
            "#....#...#E#...#....#",
            "##.#.#.#.#.#.#.#.#.##",
            "#..#...#.....#...#..#",
            "#.###.###.#.###.###.#",
            "#.....#.......#.....#",
            "#.#.#.#.##.##.#.#.#.#",
            "#...#...........#...#",
            "##.##.###.#.###.##.##",
            "#..#.............#..#",
            "#..#.#.#.#.#.#.#.#..#",
            "#..#...#.....#...#..#",
            "#.##.#.##.#.##.#.##.#",
            "#.........PQ........#",
            "#####################",
        ],
        enemies: [
            { ai: "phantom" },
            { ai: "chase" },
            { ai: "breather" },
            { ai: "interceptor" },
        ],
    },
    large: {
        parTime: 192,
        map: [
            "#############################",
            "#E............E............E#",
            "#.##.#.###.###.###.###.#.##.#",
            "#....#E..#...#E#...#..E#....#",
            "##.#.#.#.#.#.#.#.#.#.#.#.#.##",
            "#..#...#...#.....#...#...#..#",
            "#.###.###.###.#.###.###.###.#",
            "#E....#.....#...#.....#....E#",
            "#.#.#.#.###.#.#.#.###.#.#.#.#",
            "#...#.........#.........#...#",
            "##.##.###.#.#.#.#.#.###.##.##",
            "#..#...#.............#...#..#",
            "#..#.#.#.#.#.###.#.#.#.#.#..#",
            "#..#...#...#.....#...#...#..#",
            "#.###.###.###.#.###.###.###.#",
            "#.....#.....#...#.....#.....#",
            "#.#.#.#.###.#.#.#.###.#.#.#.#",
            "#...#...#...........#...#...#",
            "#.###.#.#.###.#.###.#.#.###.#",
            "#.............PQ............#",
            "#############################",
        ],
        enemies: [
            { ai: "phantom" },
            { ai: "interceptor" },
            { ai: "breather" },
            { ai: "interceptor" },
            {
                ai: "patroller",
                route: [
                    [9, 9],
                    [19, 9],
                    [19, 13],
                    [9, 13],
                ],
            },
            { ai: "breather" },
            { ai: "interceptor" },
            { ai: "phantom" },
        ],
    },
    rules: { fog: { radius: 4 } },
}
