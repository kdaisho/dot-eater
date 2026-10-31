import type { LevelData } from "../level"

// Ice rink: anything that steps onto ice ("~", or ":" with a dot) keeps
// sliding until a wall stops it or it reaches normal floor, enemies too
// (but not a Penguin player, which walks on ice, nor a phantom). The middle
// of each map is a rink with wall posts to stop against, so getting around
// it takes planning: many dots can only be passed over mid-slide, from the
// right post. The middle row is an ice lane through a wrap tunnel, with
// normal floor at the centre: a slide along it goes off one edge, in at the
// other and carries on to the centre, past whatever is in the way. The
// normal-floor ring round the rink is the safe way round, but patrollers
// walk it. Left-right symmetric, with no dead ends, the enemies at the top
// and the players at the bottom.
//
// The medium map (21x17) is the old rink grown a little: a 13x9 rink, the
// ring, and a corridor above and below. Its enemies are a patroller going
// clockwise round the ring, a chaser, a wanderer and (from Medium) an
// interceptor.
// The large map (29x21) has a 17x13 rink and, either side of the ring, a
// pair of side corridors with crossings, room to dodge eight enemies: the
// medium map's first three, a second ring patroller going anticlockwise,
// two interceptors (Hard), then a patroller sweeping straight down the
// rink's centre column and back, and a third interceptor (Super Hard).
//
// The Penguin walks the rink like floor: the dots others can only pass over
// mid-slide are easy pickings for it, and the enemies that follow it onto
// the rink slide and can't turn. But it still has to cross the ring, and
// sliding enemies (the sweeper above all) come at it across the rink in
// straight lines.
export const stage3: LevelData = {
    name: "Ice rink",
    medium: {
        parTime: 115,
        map: [
            "#####################",
            "#E........E........E#",
            "#.###.###.#.###.###.#",
            "#.........E.........#",
            "#.##~~~~:::::~~~~##.#",
            "#...:#~~~:::~~~#:...#",
            "###.::~#~~:~~#~::.###",
            "###.~::::#:#::::~.###",
            "::::::::::.::::::::::",
            "###.~::::#:#::::~.###",
            "###.::~#~~:~~#~::.###",
            "#...:#~~~:::~~~#:...#",
            "#.##~~~~:::::~~~~##.#",
            "#...................#",
            "#.###.###.#.###.###.#",
            "#.........PQ........#",
            "#####################",
        ],
        enemies: [
            {
                ai: "patroller",
                route: [
                    [3, 3],
                    [17, 3],
                    [17, 13],
                    [3, 13],
                ],
            },
            { ai: "chase" },
            { ai: "random" },
            { ai: "interceptor" },
        ],
    },
    large: {
        parTime: 200,
        map: [
            "#############################",
            "#E............E............E#",
            "#.###.#####.#####.#####.###.#",
            "#.....E.......E.......E.....#",
            "#.#.#.~~::~~~~:~~~~::~~.#.#.#",
            "#.#.#.~:#::~~~:~~~::#:~.#.#.#",
            "#.#.#.::~~~~#~:~#~~~~::.#.#.#",
            "#E....~~~~#:::~:::#~~~~....E#",
            "###.#.~#~~:::~~~:::~~#~.#.###",
            "###.#.::::::~#:#~::::::.#.###",
            "::::::::::::::.::::::::::::::",
            "###.#.::::::~#:#~::::::.#.###",
            "###.#.~#~~:::~~~:::~~#~.#.###",
            "#.....~~~~#:::~:::#~~~~.....#",
            "#.#.#.::~~~~#~:~#~~~~::.#.#.#",
            "#.#.#.~:#::~~~:~~~::#:~.#.#.#",
            "#.#.#.~~::~~~~:~~~~::~~.#.#.#",
            "#...........................#",
            "#.###.#####.#####.#####.###.#",
            "#.............PQ............#",
            "#############################",
        ],
        enemies: [
            {
                ai: "patroller",
                route: [
                    [5, 3],
                    [23, 3],
                    [23, 17],
                    [5, 17],
                ],
            },
            { ai: "chase" },
            { ai: "random" },
            {
                ai: "patroller",
                route: [
                    [23, 3],
                    [5, 3],
                    [5, 17],
                    [23, 17],
                ],
            },
            { ai: "interceptor" },
            { ai: "interceptor" },
            {
                ai: "patroller",
                route: [
                    [14, 3],
                    [14, 17],
                ],
            },
            { ai: "interceptor" },
        ],
    },
}
