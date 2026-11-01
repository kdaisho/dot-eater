// Debug mode, for checking any stage, the story ending and the end roll
// without playing up to them. The admin panel (adminPanel.ts, opened at
// #admin) turns it on with the passphrase (adminHash.ts); it then stays on
// in this browser until turned off there. While it is on, stage select
// opens every stage and clears aren't saved, so saved progress stays as
// played. No DOM access.

import {
    stageDifficultySelect,
    startLevel,
    type FlowDeps,
    type Screen,
} from "./flow"
import { DEFAULT_DIFFICULTY } from "./difficulty"
import { STAGE_COUNT, type Progress } from "./progress"
import { DEFAULT_ANIMAL } from "./roster"
import { rateClear } from "./stars"

// Where debug mode is remembered: the passphrase's hash it was turned on
// with, so a new passphrase turns it off.
export const ADMIN_KEY = "dot-eater-admin"

// Whether debug mode was turned on in this browser with the passphrase
// whose hash is `hash`. Never without a passphrase set.
export function loadAdmin(storage: Storage | undefined, hash: string): boolean {
    if (hash === "") return false
    try {
        return storage?.getItem(ADMIN_KEY) === hash
    } catch {
        return false
    }
}

// Remember debug mode on (with the passphrase's hash) or forget it.
export function saveAdmin(storage: Storage | undefined, hash?: string): void {
    try {
        if (hash) storage?.setItem(ADMIN_KEY, hash)
        else storage?.removeItem(ADMIN_KEY)
    } catch {
        // Not saved: debug mode lasts this session only.
    }
}

// `progress` with every stage slot unlocked: each one before the last
// counts as cleared. Only for showing and choosing stages, never saved.
export function unlockAll(progress: Progress): Progress {
    return {
        ...progress,
        stages: progress.stages.map((stage, i) =>
            i < STAGE_COUNT - 1 && !stage.cleared
                ? { ...stage, cleared: true }
                : stage
        ),
    }
}

// Where the admin panel jumps to.
export type AdminTarget =
    | { kind: "stage"; level: number }
    | { kind: "storyEnd" }
    | { kind: "endRoll" }

// The screen a jump goes to, for 1 player at the last difficulty picked:
// a stage's difficulty select (then character select, as from stage
// select); the story's ending as if a run had just cleared the last stage,
// which goes on to the end roll; or the end roll itself.
export function adminScreen(
    target: AdminTarget,
    deps: Pick<FlowDeps, "levels" | "lastAnimal" | "lastDifficulty">
): Screen {
    const difficulty = deps.lastDifficulty ?? DEFAULT_DIFFICULTY
    switch (target.kind) {
        case "stage":
            return stageDifficultySelect("solo", target.level, difficulty)
        case "storyEnd": {
            const level = Math.min(STAGE_COUNT, deps.levels.length) - 1
            const run = { total: 0, from: "newStory" } as const
            const playing = startLevel(
                deps.levels,
                level,
                deps.lastAnimal ?? DEFAULT_ANIMAL,
                "solo",
                [],
                difficulty,
                run
            )
            if (playing.kind !== "playing") return playing
            const { animals, game } = playing
            const { parTime } = deps.levels[level][difficulty]
            return {
                kind: "storyEnd",
                mode: "solo",
                level,
                difficulty,
                animals,
                game,
                run,
                rating: rateClear(game, parTime),
                shown: { seconds: 0 },
            }
        }
        case "endRoll":
            return {
                kind: "endRoll",
                mode: "solo",
                difficulty,
                elapsed: { seconds: 0 },
            }
    }
}
