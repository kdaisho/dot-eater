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

// How well enemies guard against the punch at each difficulty (KDA-288,
// with the user; placeholders to tune at preview; see guard.ts): the
// chance each enemy is a guarder as it comes into play, and the range its
// skill (the chance it blocks a quick punch) is drawn from, evenly. Any
// enemy type can be one. No skill is above GUARD_CAP.
export type GuardOdds = {
    chance: number
    min: number
    max: number
}

export const GUARD: Readonly<Record<Difficulty, GuardOdds>> = {
    easy: { chance: 0.25, min: 0.2, max: 0.5 },
    medium: { chance: 0.4, min: 0.3, max: 0.7 },
    hard: { chance: 0.6, min: 0.4, max: 0.85 },
    superHard: { chance: 0.75, min: 0.5, max: 0.85 },
}

export const GUARD_CAP = 0.85

export function isDifficulty(value: unknown): value is Difficulty {
    return DIFFICULTIES.includes(value as Difficulty)
}

// Each difficulty's name, as difficulty select, the HUD and the end screens
// show it.
export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
    superHard: "Super Hard",
}

// What a difficulty plays like, from the tables above, so it never
// disagrees with them: e.g. "3 enemies, medium maze". At most this many
// come out; a map that lists fewer brings out all of its own.
export function difficultyDescription(difficulty: Difficulty): string {
    return `${ENEMY_COUNT[difficulty]} enemies, ${MAP_SIZE[difficulty]} maze`
}
