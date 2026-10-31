import type { LevelData } from "../level"

// Haunted halls: long straight halls run the width of the map, joined by
// short shafts through the wall bands between them, so there is always
// another way round. Phantoms drift straight through the walls at the
// player, slowly, while breathers (KDA-291) and chasers hold the halls and
// shafts, so a wall is no hiding place: the player has to keep moving. The halls give line breaths
// (Dragon, Owl) room to work. No tunnels (a phantom doesn't use them, so
// one would make it trivial to shake off) and no ice. Left-right symmetric
// walls, no dead ends.
export const stage6: LevelData = {
    name: "Haunted halls",
    medium: {
        parTime: 75,
        map: [
            "#####################",
            "#E........E........E#",
            "#.####.###.###.####.#",
            "#.####.###.###.####.#",
            "#...................#",
            "#.#.####.###.####.#.#",
            "#...####.###.####..E#",
            "#.#.####.###.####.#.#",
            "#...................#",
            "#.#.####.###.####.#.#",
            "#...####.###.####...#",
            "#.#.####.###.####.#.#",
            "#...................#",
            "#.####.###.###.####.#",
            "#.####.###.###.####.#",
            "#........PQ.........#",
            "#####################",
        ],
        enemies: [
            { ai: "phantom" },
            { ai: "breather" },
            { ai: "phantom" },
            { ai: "chase" },
        ],
    },
    large: {
        parTime: 110,
        map: [
            "#############################",
            "#E............E............E#",
            "#.#####.######.######.#####.#",
            "#.#####E######.######E#####.#",
            "#.#####.######.######.#####.#",
            "#...........................#",
            "#.#.######.#######.######.#.#",
            "#...######....E....######...#",
            "#E#.######.#######.######.#E#",
            "#.#.######.#######.######.#.#",
            "#...........................#",
            "#.#.######.#######.######.#.#",
            "#.#.######.#######.######.#.#",
            "#...######.........######...#",
            "#.#.######.#######.######.#.#",
            "#...........................#",
            "#.#####.######.######.#####.#",
            "#.#####.######.######.#####.#",
            "#.#####.######.######.#####.#",
            "#............PQ.............#",
            "#############################",
        ],
        enemies: [
            // Hard: three phantoms, two breathers (KDA-291) and a chaser;
            // Super Hard adds an ambusher and a second chaser.
            { ai: "phantom" },
            { ai: "breather" },
            { ai: "phantom" },
            { ai: "chase" },
            { ai: "breather" },
            { ai: "phantom" },
            { ai: "ambusher" },
            { ai: "chase" },
        ],
    },
}
