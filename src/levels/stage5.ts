import type { LevelData } from "../level"

// Boss lair, the mid-game boss: a big 2x2 boss (🐙, see boss.ts) roams a
// walled arena in the middle, round 2x2 pillars and a bar, along lanes at
// least 3 cells wide (the bar splits the middle one), so beside the 2-wide
// boss there is always a cell its breath misses. A 1-wide corridor runs
// all round the arena, where the boss doesn't fit, so its touch never
// reaches there; the minions (chasers, ambushers and dot-dropping
// Splitters) start there and hunt the player everywhere. Single-cell
// doors through the arena's 1-thick wall lead in, with the corridor
// running straight past each, so a player in a door gets out of a breath
// in two moves (out and to the side), and one in the corridor in one.
//
// Every dot is in the arena: the corridor has only the spawns' dots and
// what the Splitters drop as they go (KDA-270), which never regrows. So
// the player can breathe at the boss from a door, but has to go into its
// reach to fill the meter. Pillars give cover from its breath (KDA-268, the
// gentle default tuning), and anywhere a player can get out of any breath
// in 2 moves without touching the boss, inside its 0.9 s wind-up (54
// ticks) even when it is just gliding into a struck cell as the wind-up
// starts and has that glide to finish first (KDA-286): clear in 40 ticks,
// 45 as the slower Boar. (The medium map is 21x19, two rows taller than
// the other stages', for 3-tall top and bottom lanes: at 21x17 they were 2
// tall, with cells 3 moves out that a player gliding in left a tick too
// late.) The stage is cleared once the boss is defeated (KDA-267); eaten
// dots grow back after 10 s (KDA-269). The players start at the bottom,
// between two doors and out of every line the boss can breathe along; the
// boss starts at the top, the minions in the corridor's far corners and
// sides. No tunnels and no ice (the boss uses neither), no dead ends,
// left-right symmetric walls.
//
// The boss is the same on both maps (default speed and breath): the large
// map is harder through its bigger arena and more enemies, as every
// stage's is.
export const stage5: LevelData = {
    name: "Boss lair",
    medium: {
        parTime: 60,
        map: [
            "#####################",
            "#E                 E#",
            "# #### ####### #### #",
            "# #......B........# #",
            "# #...............# #",
            "# #...............# #",
            "#E#...##.....##...#E#",
            "# #...##.....##...# #",
            "# #...............# #",
            "#  ......###......  #",
            "# #...............# #",
            "# #...##.....##...# #",
            "# #...##.....##...# #",
            "# #...............# #",
            "# #...............# #",
            "# #...............# #",
            "# #### ####### #### #",
            "#        PQ         #",
            "#####################",
        ],
        enemies: [
            { ai: "splitter" },
            { ai: "splitter" },
            { ai: "chase" },
            { ai: "interceptor" },
        ],
    },
    large: {
        parTime: 75,
        map: [
            "#############################",
            "#E        E       E        E#",
            "# ###### ########### ###### #",
            "# #..........B............# #",
            "# #.......................# #",
            "# #.......................# #",
            "# #...##...##...##...##...# #",
            "#  ...##...##...##...##...  #",
            "# #.......................# #",
            "# #.......................# #",
            "#E#..........###..........#E#",
            "# #.......................# #",
            "# #.......................# #",
            "#  ...##...##...##...##...  #",
            "# #...##...##...##...##...# #",
            "#E#.......................#E#",
            "# #.......................# #",
            "# #.......................# #",
            "# ###### ########### ###### #",
            "#            PQ             #",
            "#############################",
        ],
        enemies: [
            { ai: "splitter" },
            { ai: "chase" },
            { ai: "ambusher" },
            { ai: "splitter" },
            { ai: "interceptor" },
            { ai: "interceptor" },
            { ai: "splitter" },
            { ai: "interceptor" },
        ],
    },
    boss: {},
    // Dots are the breaths' ammunition here, and keep coming back: eaten
    // ones grow back (KDA-269) and the Splitters drop more (KDA-270).
    rules: { regrowDots: { seconds: 10 }, splitterDrops: true },
}
