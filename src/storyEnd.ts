// The story end card (KDA-323): after a story run clears the last stage,
// a gold card in the end roll's style comes up over the frozen maze. ALL
// CLEAR pops up in block letters between two party poppers, which fire
// pixel confetti; then its lines type in: the difficulty, the run total
// and the best. It holds STORY_END.hold seconds after the last letter,
// then the end roll starts by itself; there is nothing to press. Its
// timeline is here, drawn by storyEndView.ts. No DOM access.

import { DIFFICULTY_LABELS, type Difficulty } from "./difficulty"

// What the card shows.
export type StoryEndCard = {
    difficulty: Difficulty
    runTotal: number
    // The best story score at the difficulty, this run's included; left
    // out when there is none to show (a 2-player run records nothing).
    best?: number
}

// The timeline, in seconds of the card.
export const STORY_END = {
    // The card springs up from below.
    rise: 0.35,
    // ALL CLEAR's letters pop up one by one over this span.
    titleFrom: 0.3,
    titleFor: 0.6,
    // The poppers show and fire their confetti.
    poppers: 0.9,
    // The lines type in from here, each this long after the first,
    // `typing` letters a second.
    linesFrom: 1,
    lineDelays: [0, 0.15, 0.5],
    typing: 40,
    // How long the card holds after its last letter, before the end roll.
    hold: 3,
} as const

// The card's lines, in the pixel font's upper case.
export function storyEndLines(card: StoryEndCard): string[] {
    return [
        DIFFICULTY_LABELS[card.difficulty].toUpperCase(),
        `RUN TOTAL ${card.runTotal}`,
        ...(card.best === undefined ? [] : [`BEST ${card.best}`]),
    ]
}

// When line `index` starts typing.
export const lineStart = (index: number) =>
    STORY_END.linesFrom + (STORY_END.lineDelays[index] ?? 0)

// Line `line` (the `index`th) as typed `t` seconds into the card.
export function typedLine(line: string, index: number, t: number): string {
    // The epsilon absorbs float drift, so the last letter is there at
    // storyEndTyped.
    const letters = Math.floor((t - lineStart(index)) * STORY_END.typing + 1e-9)
    return line.slice(0, Math.max(0, letters))
}

// When the card's last letter appears.
export function storyEndTyped(lines: readonly string[]): number {
    return Math.max(
        STORY_END.poppers,
        ...lines.map((l, i) => lineStart(i) + l.length / STORY_END.typing)
    )
}

// How long the card shows before the end roll starts.
export function storyEndSeconds(card: StoryEndCard): number {
    return storyEndTyped(storyEndLines(card)) + STORY_END.hold
}
