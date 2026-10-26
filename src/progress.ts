// Saved progress: which stages have been cleared, and so which are open.
//
// There is no DOM access here: storage is passed in (window.localStorage in
// main), so the rules are tested without a browser. Every storage access is
// wrapped in try/catch: storage can be missing, blocked (private modes,
// sandboxed iframes) or full, and none of that may break the game. A save
// that can't be read, or that has an unknown version, is ignored and
// progress starts fresh; there are no migrations.

// Stage select always shows this many slots, real stages or not.
export const STAGE_COUNT = 5

// Versioned, so a future save shape can live beside this one under a new key.
export const PROGRESS_KEY = "dot-eater:progress:v1"
export const PROGRESS_VERSION = 1

// One entry per stage slot. Per-stage records (best score, stars) can be
// added here as optional fields without a version bump.
export type StageProgress = { cleared: boolean }

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
// with more is cut short.
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
    const saved = stages as StageProgress[]
    return {
        version: PROGRESS_VERSION,
        stages: Array.from({ length: STAGE_COUNT }, (_, i) => ({
            cleared: saved[i]?.cleared ?? false,
        })),
    }
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

// What one stage select slot shows.
export type StageSlot =
    | { kind: "open"; name: string }
    | { kind: "locked"; name: string }
    // No level exists for this slot yet.
    | { kind: "comingSoon" }

// The STAGE_COUNT slots of stage select, given the real stages' names.
export function stageSlots(
    progress: Progress,
    names: readonly string[]
): StageSlot[] {
    return Array.from({ length: STAGE_COUNT }, (_, i): StageSlot => {
        if (i >= names.length) return { kind: "comingSoon" }
        const name = names[i]
        return isUnlocked(progress, i)
            ? { kind: "open", name }
            : { kind: "locked", name }
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}
