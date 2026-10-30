// How hard a game is: which of its stage's two maps it is played on and how
// many of the map's enemies come out (see parseLevel in level.ts). The
// tables are starting values, to tune after playtesting.

export type Difficulty = "easy" | "medium" | "hard" | "superHard"

// Easiest first.
export const DIFFICULTIES: readonly Difficulty[] = [
    "easy",
    "medium",
    "hard",
    "superHard",
]

// What a game is played at until the player picks a difficulty: today's
// game.
export const DEFAULT_DIFFICULTY: Difficulty = "medium"

// The two maps every stage has (see LevelData): a medium one, around 21x17,
// and a large one, around 29x21.
export type MapSize = "medium" | "large"
export const MAP_SIZES: readonly MapSize[] = ["medium", "large"]

// How many enemies come out at each difficulty: the first this many of the
// map's list, or all of them if it lists fewer. At most MAX_ENEMIES.
export const ENEMY_COUNT: Readonly<Record<Difficulty, number>> = {
    easy: 3,
    medium: 4,
    hard: 6,
    superHard: 8,
}

// The map each difficulty is played on.
export const MAP_SIZE: Readonly<Record<Difficulty, MapSize>> = {
    easy: "medium",
    medium: "medium",
    hard: "large",
    superHard: "large",
}
