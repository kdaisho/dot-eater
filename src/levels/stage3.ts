import { sameForBoth, type LevelData } from "../level"

// Ice rink: anything that steps onto ice ("~", or ":" with a dot) keeps
// sliding until a wall stops it or it reaches normal floor, enemies too
// (but not a Penguin player, which walks on ice, nor a phantom). The
// middle of the map is a rink with wall posts to stop against, so getting
// around it takes planning: some dots can only be passed over mid-slide, from
// the right post. The middle row is an ice lane through a wrap tunnel: a
// slide along it goes off one edge, in at the other and carries on to the
// centre, past whatever is in the way. The normal-floor ring around the rink
// is the safe way round. Left-right symmetric, with no dead ends. Two
// wanderers and a chaser start at the top, away from the player at the
// bottom, at the default (half the player's) speed.
export const stage3: LevelData = {
    name: "Ice rink",
    // One map for both sizes until the stage is remade.
    ...sameForBoth({
        parTime: 80,
        map: [
            "#################",
            "#E......#......E#",
            "#.##.##.#.##.##.#",
            "#.......E.......#",
            "#.##~~~:::~~~##.#",
            "#...~#~:::~#~...#",
            "###.:::#:#:::.###",
            "::::::::.::::::::",
            "###.:::#:#:::.###",
            "#...~#~:::~#~...#",
            "#.##~~~:::~~~##.#",
            "#...............#",
            "#.##.##.#.##.##.#",
            "#.......PQ......#",
            "#################",
        ],
        enemies: [{ ai: "chase" }, { ai: "random" }, { ai: "random" }],
    }),
}
