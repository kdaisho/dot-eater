// How hard a game is: which of its stage's two maps it is played on and how
// many of the map's enemies come out (see parseLevel in level.ts), and how
// strong they and the boss are (see createGameState in game.ts). The
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

// Raised for every difficulty in KDA-290 (with the user, placeholders too).
export const GUARD: Readonly<Record<Difficulty, GuardOdds>> = {
    easy: { chance: 0.35, min: 0.25, max: 0.55 },
    medium: { chance: 0.55, min: 0.4, max: 0.75 },
    hard: { chance: 0.75, min: 0.55, max: 0.85 },
    superHard: { chance: 0.95, min: 0.7, max: 0.85 },
}

export const GUARD_CAP = 0.85

// How fast enemies go at each difficulty (KDA-290, with the user;
// placeholders to tune at preview): every enemy's speed from its level (or
// its default), a Splitter's halves included, times this, but never above
// ENEMY_SPEED_CAP. The boss keeps its level's speed.
export const ENEMY_SPEED_SCALE: Readonly<Record<Difficulty, number>> = {
    easy: 1.1,
    medium: 1.25,
    hard: 1.4,
    superHard: 1.65,
}

// Just under the slowest character (the Boar, 3.5 cells/s), so every
// character can still outrun a straight chase.
export const ENEMY_SPEED_CAP = 3.4

// An enemy's speed of `speed` cells/s (its level's) at `difficulty`.
export function enemySpeed(speed: number, difficulty: Difficulty): number {
    return Math.min(speed * ENEMY_SPEED_SCALE[difficulty], ENEMY_SPEED_CAP)
}

// How the punch's knockback decays (see knockLevel in punch.ts): how far
// each landed punch in a row knocks an enemy back, in cells (the first a
// full cell, then less each time, the last for every hit after), and how
// it recovers: a step after a lull of `lull` seconds with no landed punch,
// then another every `recover` seconds, back to a full cell.
export type KnockDecay = {
    steps: readonly number[]
    lull: number
    recover: number
}

// The knockback's decay (KDA-288, with the user; placeholders to tune at
// preview) at every difficulty but Super Hard, and in a game with none.
export const USUAL_KNOCK: KnockDecay = {
    steps: [1, 0.7, 0.5, 0.3, 0],
    lull: 2,
    recover: 0.5,
}

// At each difficulty (KDA-290, with the user; placeholders): Super Hard's
// decays faster and recovers slower.
export const KNOCK_DECAY: Readonly<Record<Difficulty, KnockDecay>> = {
    easy: USUAL_KNOCK,
    medium: USUAL_KNOCK,
    hard: USUAL_KNOCK,
    superHard: { steps: [1, 0.5, 0.2, 0], lull: 3, recover: 0.75 },
}

// How long a defeated enemy stays gone at each difficulty, as a share of
// RESPAWN_DELAY (KDA-290, with the user; placeholders): Super Hard's come
// back sooner.
export const RESPAWN_SCALE: Readonly<Record<Difficulty, number>> = {
    easy: 1,
    medium: 1,
    hard: 1,
    superHard: 0.6,
}

// How often the boss breathes at each difficulty, as a share of its level's
// `every` (KDA-290, with the user; placeholders): Super Hard's breathes more
// often. Its wind-up stays the level's (at least 0.75 s on every boss
// stage, time to see it coming).
export const BOSS_BREATH_SCALE: Readonly<Record<Difficulty, number>> = {
    easy: 1,
    medium: 1,
    hard: 1,
    superHard: 0.75,
}

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
// come out; a map that lists fewer brings out all of its own. It leaves the
// enemies' speed out (KDA-290): "4 faster enemies, medium maze" wraps on a
// phone.
export function difficultyDescription(difficulty: Difficulty): string {
    return `${ENEMY_COUNT[difficulty]} enemies, ${MAP_SIZE[difficulty]} maze`
}
