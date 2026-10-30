import type { LevelData } from "../level"

// Final boss, the last stage of story mode: stage 5's boss fight, harder.
// The boss (🐙, see boss.ts) has 18 health, not 12, and breathes every
// 2.5 s, not 4, out to 9 cells, not 6, for 35, not 30; its wind-up is a
// little shorter (0.8 s, not 0.9). 18 is a multiple of 6, so every
// character needs the same 450 energy (90 dots) to bring it down.
//
// Its arena is bigger than stage 5's and more open: four 2x2 pillars on the
// medium map and six on the large, every lane at least 3 cells wide. The
// boss is 2 wide, so beside it in a lane there is always a cell its breath
// misses: anywhere a player can stand, it can get out of any breath in 2
// moves without touching the boss (30 ticks, inside the shorter wind-up's
// 48). The doors are single cells
// through the arena's 1-thick wall with the corridor running straight past
// (2 moves out, as on stage 5). There are fewer safe places: the corridor
// only runs down the sides and along the bottom (the arena's top is the
// map's edge), and the doors at the top corners open right where the boss
// starts. Every dot is in the arena; Splitters among the minions drop more
// in the corridor (KDA-270), and eaten dots grow back after 8 s (KDA-269),
// sooner than stage 5's, as the fight takes more of them. A phantom joins
// from Medium: it drifts through walls, so the corridor is no hiding place.
// The players start at the bottom, between two doors and out of every line
// the boss breathes along, far from the boss and the minions. No tunnels
// and no ice (the boss uses neither), no dead ends, left-right symmetric
// walls.
//
// Not in levels/index.ts yet: it is stage 10, index 9, once stages 6-9 are
// in.
export const stage10: LevelData = {
    name: "Final boss",
    medium: {
        parTime: 85,
        map: [
            "#######################",
            "#E .......B......... E#",
            "# #.................# #",
            "# #.................# #",
            "# #...##.......##...# #",
            "# #...##.......##...# #",
            "# #.................# #",
            "#  .................  #",
            "# #.................# #",
            "#E#...##.......##...#E#",
            "# #...##.......##...# #",
            "# #.................# #",
            "# #.................# #",
            "# #.................# #",
            "# ###### ##### ###### #",
            "#         PQ          #",
            "#######################",
        ],
        enemies: [
            { ai: "splitter" },
            { ai: "splitter" },
            { ai: "chase" },
            { ai: "phantom" },
        ],
    },
    large: {
        parTime: 100,
        map: [
            "#############################",
            "#E ......E...B.....E...... E#",
            "# #.......................# #",
            "# #.......................# #",
            "# #...##.............##...# #",
            "# #...##.............##...# #",
            "# #.......................# #",
            "#  .......................  #",
            "# #.......................# #",
            "#E#........##...##........#E#",
            "# #........##...##........# #",
            "# #.......................# #",
            "#  .......................  #",
            "# #.......................# #",
            "# #...##.............##...# #",
            "#E#...##.............##...#E#",
            "# #.......................# #",
            "# #.......................# #",
            "# #.......................# #",
            "# ###### ########### ###### #",
            "#            PQ             #",
            "#############################",
        ],
        enemies: [
            { ai: "splitter" },
            { ai: "chase" },
            { ai: "chase" },
            { ai: "splitter" },
            { ai: "ambusher" },
            { ai: "phantom" },
            { ai: "splitter" },
            { ai: "chase" },
        ],
    },
    // The same boss on both maps: the large map is harder by its arena and
    // enemies, as every stage's is.
    boss: {
        health: 18,
        breath: { every: 2.5, windUp: 0.8, range: 9, damage: 35 },
    },
    rules: { regrowDots: { seconds: 8 }, splitterDrops: true },
}
