import { ENEMY_SPEED } from "./constants"

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

// How fast enemies go at each difficulty (KDA-290, with the user;
// placeholders to tune at preview): every enemy's speed from its level (or
// its default), a Splitter's halves included, times this, but never above
// ENEMY_SPEED_CAP. The boss keeps its level's speed, and the Tengu has its
// own (TENGU_SPEED, KDA-296).
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

// How fast the Tengu (the wanderer, AiType.random) goes at each difficulty
// (KDA-296, with the user; placeholders to tune at preview): its own
// speeds instead of ENEMY_SPEED_SCALE's, from a little under the players
// at Easy up to them (PLAYER_SPEED 4) at Super Hard. Not capped at
// ENEMY_SPEED_CAP: that cap is so a chase can be outrun, and the Tengu
// doesn't chase, it wanders, so a fast one is a hazard to dodge.
export const TENGU_SPEED: Readonly<Record<Difficulty, number>> = {
    easy: 3.5,
    medium: 3.65,
    hard: 3.8,
    superHard: 4,
}

// A Tengu's speed at `difficulty`, from its level's `speed` cells/s (its
// default, ENEMY_SPEED, if the level leaves it out). Our call: a level's
// speed counts as a share of the default, as stage 9's 2.25 is a little
// above it, so TENGU_SPEED times speed / ENEMY_SPEED. A level can still
// make its Tengus a little slower or faster than the usual ones, and
// leaving it out gives TENGU_SPEED exactly. No stage sets one today.
export function tenguSpeed(speed: number, difficulty: Difficulty): number {
    return (TENGU_SPEED[difficulty] * speed) / ENEMY_SPEED
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
