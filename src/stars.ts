import { START_LIVES, TICK_RATE } from "./constants"

// Star rating for a stage clear, and how clear times are shown.
//
// A clear earns 1 to 3 stars:
// - one for clearing the stage at all,
// - one for losing no lives on the way,
// - one for a clear time at or under the stage's par time (Level.parTime).
// No DOM access: the stage clear screen and stage select show the result.

export type Stars = 1 | 2 | 3

// The rating of one clear: which stars were earned, and the clear time.
export type ClearRating = {
    // Ticks played (GameState.ticks), TICK_RATE per second.
    ticks: number
    // The level's par time, in seconds.
    parTime: number
    noLivesLost: boolean
    underPar: boolean
    stars: Stars
}

// Rate a won game. `game` is the finished game's clear time and lives left,
// `parTime` the level's, in seconds. Reaching the par time exactly still
// counts as under par. Par is rounded to whole ticks, since e.g. 16.4 * 60
// is 983.9999999999999 in floating point, which would miss a 984-tick clear.
export function rateClear(
    game: { ticks: number; lives: number },
    parTime: number
): ClearRating {
    const noLivesLost = game.lives >= START_LIVES
    const underPar = game.ticks <= Math.round(parTime * TICK_RATE)
    const stars = (1 + Number(noLivesLost) + Number(underPar)) as Stars
    return { ticks: game.ticks, parTime, noLivesLost, underPar, stars }
}

// The three stars of a rating in order, each with its label and whether it
// was earned, e.g. "Under par (1:00)".
export function starList(
    rating: ClearRating
): { label: string; earned: boolean }[] {
    return [
        { label: "Cleared", earned: true },
        { label: "No lives lost", earned: rating.noLivesLost },
        {
            label: `Under par (${formatSeconds(rating.parTime)})`,
            earned: rating.underPar,
        },
    ]
}

// Stars as text: earned ones filled, the rest hollow, e.g. "★★☆".
export function starText(stars: number): string {
    const earned = Math.min(Math.max(stars, 0), 3)
    return "★".repeat(earned) + "☆".repeat(3 - earned)
}

// A clear time in ticks as m:ss.s, rounded up to the tenth so it never reads
// better than it was: 3600 ticks is "1:00.0", 3601 is "1:00.1". So with a
// par time in whole tenths of a second, a time shown at or under par always
// earned the star.
export function formatTicks(ticks: number): string {
    const tenths = Math.ceil((ticks * 10) / TICK_RATE)
    const minutes = Math.floor(tenths / 600)
    const seconds = Math.floor((tenths % 600) / 10)
    return `${minutes}:${pad2(seconds)}.${tenths % 10}`
}

// Seconds as m:ss, with tenths only when there are any: 60 is "1:00", 45.5
// is "0:45.5". For par times.
export function formatSeconds(totalSeconds: number): string {
    const tenths = Math.round(totalSeconds * 10)
    const minutes = Math.floor(tenths / 600)
    const seconds = Math.floor((tenths % 600) / 10)
    const rest = tenths % 10 === 0 ? "" : `.${tenths % 10}`
    return `${minutes}:${pad2(seconds)}${rest}`
}

function pad2(n: number): string {
    return String(n).padStart(2, "0")
}
