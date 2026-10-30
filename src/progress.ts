// Saved progress: which stages have been cleared, and so which are open.
//
// There is no DOM access here: storage is passed in (window.localStorage in
// main), so the rules are tested without a browser. Every storage access is
// wrapped in try/catch: storage can be missing, blocked (private modes,
// sandboxed iframes) or full, and none of that may break the game. A save
// that can't be read, or that has an unknown version, is ignored and
// progress starts fresh; there are no migrations.

import {
    DEFAULT_DIFFICULTY,
    DIFFICULTIES,
    isDifficulty,
    type Difficulty,
} from "./difficulty"

// Stage select always shows this many slots, real stages or not.
export const STAGE_COUNT = 10

// Versioned, so a future save shape can live beside this one under a new key.
export const PROGRESS_KEY = "dot-eater:progress:v1"
export const PROGRESS_VERSION = 1

// A stage's bests at one difficulty. They are kept separately: the best
// stars may come from a slower run than the best time.
export type Bests = {
    // The most stars any clear earned (1 to 3; see stars.ts).
    stars?: number
    // The fastest clear, in game ticks (TICK_RATE, 60, per second): a whole
    // number from 1. Ticks rather than seconds, so it is exact.
    bestTime?: number
}

// The difficulty saves from before difficulties (KDA-265) count as: their
// bests, at the top of a stage, are this difficulty's (see StageProgress).
export const LEGACY_DIFFICULTY: Difficulty = DEFAULT_DIFFICULTY

// One entry per stage slot. Per-stage records are optional fields, added
// without a version bump. Clearing a stage at any difficulty clears it, so
// unlocks are shared; the bests are kept per difficulty, in `byDifficulty`.
// The top-level `stars` and `bestTime` are Medium's (LEGACY_DIFFICULTY):
// what saves from before difficulties hold, and what older builds read and
// write. So Medium's bests are written into both, and read as the better of
// the two (see bestsAt), since an older build may have improved the
// top-level ones since.
export type StageProgress = Bests & {
    cleared: boolean
    byDifficulty?: Partial<Record<Difficulty, Bests>>
}

// A clear to record: the difficulty it was played at, its stars and its
// clear time in ticks.
export type ClearRecord = {
    difficulty: Difficulty
    stars: number
    ticks: number
}

export type Progress = {
    version: typeof PROGRESS_VERSION
    // Exactly STAGE_COUNT entries, in stage order.
    stages: readonly StageProgress[]
}

// The part of the Web Storage API this module uses.
export type ProgressStorage = Pick<Storage, "getItem" | "setItem">

export function emptyProgress(): Progress {
    return {
        version: PROGRESS_VERSION,
        stages: Array.from({ length: STAGE_COUNT }, () => ({ cleared: false })),
    }
}

// Read a saved string. Anything that isn't a valid version-1 save (null,
// bad JSON, another version, a wrong shape) gives empty progress. A save
// with fewer stages than STAGE_COUNT is padded with uncleared ones, and one
// with more is cut short. Fields a stage has besides `cleared` are kept, so
// a save written by a later build loses nothing when this one saves it back.
// A malformed `stars` or `bestTime` is dropped on its own, at the top or in
// `byDifficulty`; the rest of the save still counts. So is a `byDifficulty`
// that isn't an object, or a difficulty's entry in it that isn't one;
// entries under keys that aren't difficulties are kept as they are.
export function parseProgress(raw: string | null): Progress {
    if (raw === null) return emptyProgress()
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        return emptyProgress()
    }
    if (!isRecord(data) || data.version !== PROGRESS_VERSION) {
        return emptyProgress()
    }
    const { stages } = data
    if (!Array.isArray(stages)) return emptyProgress()
    if (!stages.every((s) => isRecord(s) && typeof s.cleared === "boolean")) {
        return emptyProgress()
    }
    const saved = stages as Record<string, unknown>[]
    return {
        version: PROGRESS_VERSION,
        stages: Array.from({ length: STAGE_COUNT }, (_, i) =>
            saved[i] ? parseStage(saved[i]) : { cleared: false }
        ),
    }
}

// One saved stage, already known to have a boolean `cleared`.
function parseStage(saved: Record<string, unknown>): StageProgress {
    const { byDifficulty, ...stage } = saved
    const records = parseByDifficulty(byDifficulty)
    return {
        ...parseBests(stage),
        cleared: saved.cleared as boolean,
        ...(records ? { byDifficulty: records } : {}),
    }
}

// Saved bests, a malformed `stars` or `bestTime` dropped, other fields kept.
function parseBests(saved: Record<string, unknown>): Bests {
    const { stars, bestTime, ...rest } = saved
    return {
        ...rest,
        ...(isStars(stars) ? { stars } : {}),
        ...(isTicks(bestTime) ? { bestTime } : {}),
    }
}

function parseByDifficulty(
    saved: unknown
): StageProgress["byDifficulty"] | undefined {
    if (!isRecord(saved)) return undefined
    // Built with fromEntries, which makes every key an own field: assigning
    // a saved "__proto__" key would set the object's prototype instead, and
    // its fields would read as inherited bests.
    return Object.fromEntries(
        Object.entries(saved).flatMap(([key, value]) => {
            if (!isDifficulty(key)) return [[key, value]]
            return isRecord(value) ? [[key, parseBests(value)]] : []
        })
    )
}

function isStars(value: unknown): value is number {
    return (
        Number.isInteger(value) &&
        (value as number) >= 1 &&
        (value as number) <= 3
    )
}

function isTicks(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 1
}

// Combine two copies of progress, e.g. this tab's and what another tab has
// saved since, keeping the better of each record: a stage cleared in either
// stays cleared, and the bests are the most stars and the fastest time of
// either, at each difficulty. Other per-stage fields come from `saved` where
// it has them.
export function mergeProgress(mine: Progress, saved: Progress): Progress {
    return {
        version: PROGRESS_VERSION,
        stages: mine.stages.map((s, i) => {
            const other = saved.stages[i]
            const byDifficulty = mergeByDifficulty(
                s.byDifficulty,
                other.byDifficulty
            )
            return withBests(
                {
                    ...s,
                    ...other,
                    cleared: s.cleared || other.cleared,
                    ...(byDifficulty ? { byDifficulty } : {}),
                },
                s,
                other
            )
        }),
    }
}

// Two stages' bests by difficulty, the better of each; other entries come
// from `saved` where it has them.
function mergeByDifficulty(
    mine: StageProgress["byDifficulty"],
    saved: StageProgress["byDifficulty"]
): StageProgress["byDifficulty"] | undefined {
    if (!mine && !saved) return undefined
    const merged = { ...mine, ...saved }
    for (const difficulty of DIFFICULTIES) {
        const a = mine?.[difficulty]
        const b = saved?.[difficulty]
        if (a || b) {
            merged[difficulty] = withBests({ ...a, ...b }, a ?? {}, b ?? {})
        }
    }
    return merged
}

// `target` with the most stars and fastest time found in `records` (fields
// a record lacks are skipped; a best no record has is left out).
function withBests<T extends Bests>(
    target: T,
    ...records: readonly MaybeBests[]
): T {
    const { stars: _s, bestTime: _t, ...rest } = target
    return { ...rest, ...bestOf(...records) } as T
}

// Bests that may say outright that they have none.
type MaybeBests = { [K in keyof Bests]?: Bests[K] | undefined }

// The most stars and the fastest time found in `records`, each left out if
// no record has it.
function bestOf(...records: readonly MaybeBests[]): Bests {
    const stars = best(
        records.map((r) => r.stars),
        Math.max
    )
    const bestTime = best(
        records.map((r) => r.bestTime),
        Math.min
    )
    return {
        ...(stars === undefined ? {} : { stars }),
        ...(bestTime === undefined ? {} : { bestTime }),
    }
}

// A stage's bests at `difficulty`. Medium's are the better of its own and
// the top-level ones (see StageProgress), so a save from before
// difficulties counts as Medium.
export function bestsAt(stage: StageProgress, difficulty: Difficulty): Bests {
    const own = stage.byDifficulty?.[difficulty] ?? {}
    return difficulty === LEGACY_DIFFICULTY ? bestOf(own, stage) : bestOf(own)
}

function best(
    values: readonly (number | undefined)[],
    pick: (...n: number[]) => number
): number | undefined {
    const known = values.filter((v): v is number => v !== undefined)
    return known.length === 0 ? undefined : pick(...known)
}

export function serializeProgress(progress: Progress): string {
    return JSON.stringify(progress)
}

// Load progress from storage; empty progress when there is no storage, it
// throws, or what it holds can't be used.
export function loadProgress(storage: ProgressStorage | undefined): Progress {
    try {
        return parseProgress(storage?.getItem(PROGRESS_KEY) ?? null)
    } catch {
        return emptyProgress()
    }
}

// Save progress; returns whether it was written. Failure is silent: the
// game goes on with progress kept in memory for this session.
export function saveProgress(
    storage: ProgressStorage | undefined,
    progress: Progress
): boolean {
    if (!storage) return false
    try {
        storage.setItem(PROGRESS_KEY, serializeProgress(progress))
        return true
    } catch {
        return false
    }
}

// Stage 1 is always open; each later stage opens once the one before it is
// cleared. Slots outside 0..STAGE_COUNT-1 are never open.
export function isUnlocked(progress: Progress, index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= STAGE_COUNT) {
        return false
    }
    return index === 0 || progress.stages[index - 1].cleared
}

// Mark a stage cleared, which unlocks the next. Returns the same object when
// nothing changes (already cleared, or not a stage slot), so callers can
// skip the save.
export function markCleared(progress: Progress, index: number): Progress {
    const stage = progress.stages[index]
    if (!Number.isInteger(index) || !stage || stage.cleared) return progress
    return {
        ...progress,
        stages: progress.stages.map((s, i) =>
            i === index ? { ...s, cleared: true } : s
        ),
    }
}

// Record a clear's stars and time on stage `index` as its bests at the
// clear's difficulty, where they beat what it has there (see bestsAt): more
// stars, or a lower time. Each best improves on its own. Medium's go into
// the top-level bests too (see StageProgress). Returns the same object when
// nothing improves (or `index` isn't a stage slot), so callers can skip the
// save.
export function recordBests(
    progress: Progress,
    index: number,
    clear: ClearRecord
): Progress {
    const stage = progress.stages[index]
    const { difficulty } = clear
    if (!Number.isInteger(index) || !stage || !isDifficulty(difficulty)) {
        return progress
    }
    // Values a save couldn't hold are ignored, as parseProgress would drop
    // them.
    const stars = isStars(clear.stars) ? clear.stars : undefined
    const ticks = isTicks(clear.ticks) ? clear.ticks : undefined
    const current = bestsAt(stage, difficulty)
    const moreStars =
        stars !== undefined &&
        (current.stars === undefined || stars > current.stars)
    const faster =
        ticks !== undefined &&
        (current.bestTime === undefined || ticks < current.bestTime)
    if (!moreStars && !faster) return progress
    const bests = bestOf(current, { stars, bestTime: ticks })
    const own = stage.byDifficulty?.[difficulty] ?? {}
    const recorded: StageProgress = {
        ...stage,
        byDifficulty: {
            ...stage.byDifficulty,
            [difficulty]: withBests(own, bests),
        },
    }
    const next =
        difficulty === LEGACY_DIFFICULTY ? withBests(recorded, bests) : recorded
    return {
        ...progress,
        stages: progress.stages.map((s, i) => (i === index ? next : s)),
    }
}

// A win: mark stage `index` cleared, which unlocks the next (whatever the
// difficulty), record the clear's stars and time as bests at its difficulty
// where they improve, and save unless storage already holds exactly that
// (in any key order). Storage is read again first and merged (see
// mergeProgress), so clears and bests another tab saved since this one
// loaded aren't overwritten, and this tab's better bests aren't lost either.
// Returns the new progress.
export function recordClear(
    progress: Progress,
    storage: ProgressStorage | undefined,
    index: number,
    clear: ClearRecord
): Progress {
    const stored = loadProgress(storage)
    const latest = mergeProgress(progress, stored)
    const next = recordBests(markCleared(latest, index), index, clear)
    if (!sameData(next, stored)) {
        saveProgress(storage, next)
    }
    return next
}

// What one stage select slot shows.
export type StageSlot =
    // A cleared stage also shows its bests at the difficulty stage select
    // shows (see bestsAt).
    | { kind: "open"; name: string; stars?: number; bestTime?: number }
    | { kind: "locked"; name: string }
    // No level exists for this slot yet.
    | { kind: "comingSoon" }

// The STAGE_COUNT slots of stage select, given the real stages' names, with
// the bests at `difficulty`.
export function stageSlots(
    progress: Progress,
    names: readonly string[],
    difficulty: Difficulty
): StageSlot[] {
    return Array.from({ length: STAGE_COUNT }, (_, i): StageSlot => {
        if (i >= names.length) return { kind: "comingSoon" }
        const name = names[i]
        if (!isUnlocked(progress, i)) return { kind: "locked", name }
        const stage = progress.stages[i]
        if (!stage.cleared) return { kind: "open", name }
        return { kind: "open", name, ...bestsAt(stage, difficulty) }
    })
}

// Whether stage `index` can be started: it is unlocked and has a level.
export function isPlayable(
    progress: Progress,
    levelCount: number,
    index: number
): boolean {
    return index < levelCount && isUnlocked(progress, index)
}

// Whether two JSON values hold the same data, whatever order their objects'
// keys are in (a merge or a parse may order them differently).
function sameData(a: unknown, b: unknown): boolean {
    return JSON.stringify(sortedKeys(a)) === JSON.stringify(sortedKeys(b))
}

function sortedKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortedKeys)
    if (!isRecord(value)) return value
    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map((key) => [key, sortedKeys(value[key])])
    )
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}
