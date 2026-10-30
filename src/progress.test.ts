import { describe, expect, it, vi } from "vite-plus/test"
import {
    emptyProgress,
    isPlayable,
    isUnlocked,
    loadProgress,
    markCleared,
    mergeProgress,
    parseProgress,
    PROGRESS_KEY,
    recordBests,
    recordClear,
    saveProgress,
    serializeProgress,
    STAGE_COUNT,
    stageSlots,
    type Bests,
    type ClearRecord,
    type Progress,
    type ProgressStorage,
    type StageProgress,
} from "./progress"
import type { Difficulty } from "./difficulty"

// An in-memory Storage stand-in.
function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial))
    return {
        data,
        getItem: vi.fn((key: string) => data.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
            data.set(key, value)
        }),
    }
}

// Storage whose every access throws, like a blocked localStorage.
const throwing: ProgressStorage = {
    getItem: () => {
        throw new Error("SecurityError")
    },
    setItem: () => {
        throw new Error("QuotaExceededError")
    },
}

const cleared = (...indices: number[]): Progress =>
    indices.reduce(markCleared, emptyProgress())

const clearedFlags = (p: Progress) => p.stages.map((s) => s.cleared)

// A clear to record: 2 stars in 30 s on Medium, unless told otherwise.
const run = (
    stars = 2,
    ticks = 1800,
    difficulty: Difficulty = "medium"
): ClearRecord => ({ difficulty, stars, ticks })

// How a story mode clear is recorded: it unlocks the next stage.
const unlocking = { unlocks: true }

// A cleared stage with these bests on Medium, as recordBests writes them:
// in byDifficulty and at the top (see StageProgress).
const medium = (bests: Bests): StageProgress => ({
    cleared: true,
    ...bests,
    byDifficulty: { medium: bests },
})

// Progress whose stage 0 is cleared with these bests.
const withStage0 = (bests: { stars?: number; bestTime?: number }): Progress => {
    const p = cleared(0)
    return {
        ...p,
        stages: [{ ...p.stages[0], ...bests }, ...p.stages.slice(1)],
    }
}

// Parse a save whose only stage is `stage`, and return that stage.
const parseStage0 = (stage: Record<string, unknown>) =>
    parseProgress(JSON.stringify({ version: 1, stages: [stage] })).stages[0]

describe("emptyProgress", () => {
    it("has STAGE_COUNT uncleared stages and the current version", () => {
        const p = emptyProgress()
        expect(p.version).toBe(1)
        expect(p.stages).toHaveLength(STAGE_COUNT)
        expect(p.stages.every((s) => !s.cleared)).toBe(true)
    })

    it("uses a versioned key", () => {
        expect(PROGRESS_KEY).toBe("dot-eater:progress:v1")
    })
})

describe("parseProgress", () => {
    it("reads back what serializeProgress wrote", () => {
        const p = cleared(0, 1)
        expect(parseProgress(serializeProgress(p))).toEqual(p)
    })

    it.each([
        ["nothing saved", null],
        ["bad JSON", "{not json"],
        ["an empty string", ""],
        ["a number", "42"],
        ["null", "null"],
        ["an array", "[]"],
        ["no version", JSON.stringify({ stages: [{ cleared: true }] })],
        [
            "an unknown version",
            JSON.stringify({ version: 2, stages: [{ cleared: true }] }),
        ],
        [
            "a version as a string",
            JSON.stringify({ version: "1", stages: [{ cleared: true }] }),
        ],
        ["no stages", JSON.stringify({ version: 1 })],
        ["stages not a list", JSON.stringify({ version: 1, stages: {} })],
        [
            "a stage that isn't an object",
            JSON.stringify({ version: 1, stages: [true] }),
        ],
        [
            "a stage without a boolean cleared",
            JSON.stringify({ version: 1, stages: [{ cleared: "yes" }] }),
        ],
    ])("gives empty progress for %s", (_, raw) => {
        expect(parseProgress(raw)).toEqual(emptyProgress())
    })

    it("pads a save with fewer stages and cuts one with more", () => {
        const short = JSON.stringify({
            version: 1,
            stages: [{ cleared: true }],
        })
        expect(clearedFlags(parseProgress(short))).toEqual([
            true,
            ...Array<boolean>(STAGE_COUNT - 1).fill(false),
        ])
        const long = JSON.stringify({
            version: 1,
            stages: Array.from({ length: STAGE_COUNT + 3 }, () => ({
                cleared: true,
            })),
        })
        expect(parseProgress(long).stages).toHaveLength(STAGE_COUNT)
    })

    it("accepts extra fields, so later per-stage records need no new version", () => {
        const raw = JSON.stringify({
            version: 1,
            stages: [{ cleared: true, best: 340, stars: 2 }],
            extra: "ignored",
        })
        expect(clearedFlags(parseProgress(raw))[0]).toBe(true)
    })

    it("keeps a stage's extra fields through a clear and a save", () => {
        const raw = JSON.stringify({
            version: 1,
            stages: [{ cleared: true, best: 340, stars: 2 }],
        })
        const next = markCleared(parseProgress(raw), 1)
        const saved = JSON.parse(serializeProgress(next))
        expect(saved.stages[0]).toEqual({ cleared: true, best: 340, stars: 2 })
        expect(saved.stages[1]).toEqual({ cleared: true })
    })
})

describe("parseProgress: bests", () => {
    it("reads valid stars and best time", () => {
        expect(
            parseStage0({ cleared: true, stars: 3, bestTime: 1234 })
        ).toEqual({ cleared: true, stars: 3, bestTime: 1234 })
        expect(parseStage0({ cleared: true, stars: 1, bestTime: 1 })).toEqual({
            cleared: true,
            stars: 1,
            bestTime: 1,
        })
    })

    it("leaves out bests a save doesn't have", () => {
        expect(parseStage0({ cleared: true })).toEqual({ cleared: true })
        expect(parseStage0({ cleared: true, stars: 2 })).toEqual({
            cleared: true,
            stars: 2,
        })
        expect(parseStage0({ cleared: true, bestTime: 90 })).toEqual({
            cleared: true,
            bestTime: 90,
        })
    })

    it.each([0, 4, 1.5, -1, "3", null, true, [2], Infinity])(
        "drops stars of %j, keeping the rest of the stage",
        (stars) => {
            expect(parseStage0({ cleared: true, stars, bestTime: 90 })).toEqual(
                { cleared: true, bestTime: 90 }
            )
        }
    )

    it.each([0, -60, 12.5, "90", null, false, {}, Infinity, NaN])(
        "drops a bestTime of %j, keeping the rest of the stage",
        (bestTime) => {
            expect(parseStage0({ cleared: true, stars: 2, bestTime })).toEqual({
                cleared: true,
                stars: 2,
            })
        }
    )

    it("keeps the other stages and extra fields when one best is malformed", () => {
        const raw = JSON.stringify({
            version: 1,
            stages: [
                { cleared: true, stars: "lots", note: "x" },
                { cleared: true, stars: 3, bestTime: 600 },
            ],
        })
        const { stages } = parseProgress(raw)
        expect(stages[0]).toEqual({ cleared: true, note: "x" })
        expect(stages[1]).toEqual({ cleared: true, stars: 3, bestTime: 600 })
    })
})

describe("mergeProgress", () => {
    it("keeps a stage cleared in either copy", () => {
        expect(clearedFlags(mergeProgress(cleared(0), cleared(2)))).toEqual([
            true,
            false,
            true,
            false,
            false,
        ])
    })
})

describe("mergeProgress: bests", () => {
    const merged = (
        mine: { stars?: number; bestTime?: number },
        saved: { stars?: number; bestTime?: number }
    ) => mergeProgress(withStage0(mine), withStage0(saved)).stages[0]

    it("keeps the most stars and the fastest time, from either side", () => {
        expect(
            merged({ stars: 3, bestTime: 900 }, { stars: 2, bestTime: 600 })
        ).toEqual({ cleared: true, stars: 3, bestTime: 600 })
        expect(
            merged({ stars: 1, bestTime: 600 }, { stars: 2, bestTime: 900 })
        ).toEqual({ cleared: true, stars: 2, bestTime: 600 })
    })

    it("takes a best only one side has", () => {
        expect(merged({ stars: 2 }, { bestTime: 700 })).toEqual({
            cleared: true,
            stars: 2,
            bestTime: 700,
        })
        expect(merged({}, {})).toEqual({ cleared: true })
    })
})

describe("recordBests", () => {
    it("records the first clear's stars and time", () => {
        expect(recordBests(cleared(0), 0, run(2, 1800)).stages[0]).toEqual(
            medium({ stars: 2, bestTime: 1800 })
        )
    })

    it("improves each best on its own", () => {
        const start = withStage0({ stars: 2, bestTime: 1800 })
        // More stars, but slower: only the stars change.
        expect(recordBests(start, 0, run(3, 2400)).stages[0]).toEqual(
            medium({ stars: 3, bestTime: 1800 })
        )
        // Faster, but fewer stars: only the time changes.
        expect(recordBests(start, 0, run(1, 1200)).stages[0]).toEqual(
            medium({ stars: 2, bestTime: 1200 })
        )
    })

    it("never makes a best worse, returning the same object", () => {
        const start = withStage0({ stars: 3, bestTime: 1200 })
        expect(recordBests(start, 0, run(1, 5000))).toBe(start)
        // Equal is no improvement either.
        expect(recordBests(start, 0, run(3, 1200))).toBe(start)
    })

    it("ignores stars or a time a save couldn't hold", () => {
        const p = withStage0({ stars: 1, bestTime: 900 })
        expect(recordBests(p, 0, run(4, 0))).toBe(p)
        expect(recordBests(p, 0, run(2, 0.5)).stages[0]).toEqual(
            medium({ stars: 2, bestTime: 900 })
        )
        expect(recordBests(cleared(0), 0, run(3, 0)).stages[0]).toEqual(
            medium({ stars: 3 })
        )
    })

    it("ignores slots outside the stage list", () => {
        const p = cleared(0)
        expect(recordBests(p, -1, run())).toBe(p)
        expect(recordBests(p, STAGE_COUNT, run())).toBe(p)
    })

    it("keeps a stage's other fields", () => {
        const p = withStage0({ stars: 1 })
        const withNote = {
            ...p,
            stages: [{ ...p.stages[0], note: "x" }, ...p.stages.slice(1)],
        }
        expect(recordBests(withNote, 0, run(2, 60)).stages[0]).toEqual({
            ...medium({ stars: 2, bestTime: 60 }),
            note: "x",
        })
    })
})

describe("recordClear", () => {
    it("saves the clear, unlocking the next stage", () => {
        const storage = memoryStorage()
        const next = recordClear(emptyProgress(), storage, 0, run(), unlocking)
        expect(isUnlocked(next, 1)).toBe(true)
        expect(loadProgress(storage)).toEqual(next)
    })

    // Regression: a tab with stale progress used to save it over clears made
    // in another tab since, locking those stages again.
    it("keeps clears another tab saved since this one loaded", () => {
        const storage = memoryStorage()
        saveProgress(storage, cleared(0, 1))
        const next = recordClear(emptyProgress(), storage, 0, run(), unlocking)
        expect(clearedFlags(loadProgress(storage)).slice(0, 2)).toEqual([
            true,
            true,
        ])
        expect(isUnlocked(next, 2)).toBe(true)
    })

    it("saves the clear's stars and time as the stage's bests", () => {
        const storage = memoryStorage()
        recordClear(emptyProgress(), storage, 0, run(2, 1800), unlocking)
        expect(loadProgress(storage).stages[0]).toEqual(
            medium({ stars: 2, bestTime: 1800 })
        )
    })

    it("only improves the saved bests", () => {
        const storage = memoryStorage()
        let p = recordClear(
            emptyProgress(),
            storage,
            0,
            run(3, 1800),
            unlocking
        )
        p = recordClear(p, storage, 0, run(1, 1200), unlocking)
        p = recordClear(p, storage, 0, run(2, 3000), unlocking)
        expect(p.stages[0]).toEqual(medium({ stars: 3, bestTime: 1200 }))
        expect(loadProgress(storage)).toEqual(p)
    })

    it("doesn't save when nothing improves", () => {
        const storage = memoryStorage()
        const p = recordClear(
            emptyProgress(),
            storage,
            0,
            run(3, 600),
            unlocking
        )
        storage.setItem.mockClear()
        recordClear(p, storage, 0, run(2, 900), unlocking)
        expect(storage.setItem).not.toHaveBeenCalled()
    })

    // Regression guard: the merge with storage used to take another tab's
    // fields as they were, so a stale tab's worse bests could replace this
    // tab's better ones, and the other way round.
    it("keeps the better bests of this tab and another tab", () => {
        const storage = memoryStorage()
        // This tab: 3 stars, slow. The other tab saved 2 stars, fast.
        const mine = withStage0({ stars: 3, bestTime: 3000 })
        saveProgress(storage, withStage0({ stars: 2, bestTime: 1000 }))
        const next = recordClear(mine, storage, 0, run(1, 2000), unlocking)
        const best = { cleared: true, stars: 3, bestTime: 1000 }
        expect(next.stages[0]).toEqual(best)
        expect(loadProgress(storage).stages[0]).toEqual(best)
    })

    it("still records the clear in memory when storage is unusable", () => {
        expect(
            isUnlocked(
                recordClear(emptyProgress(), throwing, 0, run(), unlocking),
                1
            )
        ).toBe(true)
        expect(
            isUnlocked(
                recordClear(cleared(0), undefined, 1, run(), unlocking),
                2
            )
        ).toBe(true)
    })
})

describe("loadProgress", () => {
    it("loads what saveProgress saved", () => {
        const storage = memoryStorage()
        const p = cleared(0)
        expect(saveProgress(storage, p)).toBe(true)
        expect(storage.setItem).toHaveBeenCalledWith(
            PROGRESS_KEY,
            expect.any(String)
        )
        expect(loadProgress(storage)).toEqual(p)
    })

    it("starts fresh with nothing saved", () => {
        expect(loadProgress(memoryStorage())).toEqual(emptyProgress())
    })

    it("starts fresh from a malformed save", () => {
        const storage = memoryStorage({ [PROGRESS_KEY]: "{oops" })
        expect(loadProgress(storage)).toEqual(emptyProgress())
    })

    it("starts fresh when storage throws", () => {
        expect(() => loadProgress(throwing)).not.toThrow()
        expect(loadProgress(throwing)).toEqual(emptyProgress())
    })

    it("starts fresh with no storage at all", () => {
        expect(loadProgress(undefined)).toEqual(emptyProgress())
    })
})

describe("saveProgress", () => {
    it("reports failure instead of throwing when storage throws", () => {
        expect(saveProgress(throwing, cleared(0))).toBe(false)
    })

    it("reports failure with no storage", () => {
        expect(saveProgress(undefined, cleared(0))).toBe(false)
    })
})

describe("isUnlocked", () => {
    it("opens only stage 1 with nothing cleared", () => {
        const p = emptyProgress()
        expect(isUnlocked(p, 0)).toBe(true)
        for (let i = 1; i < STAGE_COUNT; i++)
            expect(isUnlocked(p, i)).toBe(false)
    })

    it("opens each stage once the one before it is cleared", () => {
        let p = emptyProgress()
        for (let i = 0; i < STAGE_COUNT - 1; i++) {
            expect(isUnlocked(p, i + 1)).toBe(false)
            p = markCleared(p, i)
            expect(isUnlocked(p, i + 1)).toBe(true)
        }
    })

    it("doesn't open a stage because a later one is cleared", () => {
        expect(isUnlocked(cleared(2), 2)).toBe(false)
        expect(isUnlocked(cleared(2), 3)).toBe(true)
    })

    it("never opens a slot outside the stage list", () => {
        const p = cleared(0, 1, 2, 3, 4)
        expect(isUnlocked(p, -1)).toBe(false)
        expect(isUnlocked(p, STAGE_COUNT)).toBe(false)
        expect(isUnlocked(p, 0.5)).toBe(false)
    })
})

describe("markCleared", () => {
    it("clears one stage without changing the original", () => {
        const before = emptyProgress()
        const after = markCleared(before, 1)
        expect(clearedFlags(after)).toEqual(
            Array.from({ length: STAGE_COUNT }, (_, i) => i === 1)
        )
        expect(clearedFlags(before).some(Boolean)).toBe(false)
    })

    it("returns the same object when nothing changes", () => {
        const p = cleared(0)
        expect(markCleared(p, 0)).toBe(p)
        expect(markCleared(p, -1)).toBe(p)
        expect(markCleared(p, STAGE_COUNT)).toBe(p)
    })
})

describe("stageSlots", () => {
    it("shows STAGE_COUNT slots: open, locked, then coming soon", () => {
        expect(stageSlots(cleared(0), ["A", "B", "C"], "medium")).toEqual([
            { kind: "open", name: "A" },
            { kind: "open", name: "B" },
            { kind: "locked", name: "C" },
            { kind: "comingSoon" },
            { kind: "comingSoon" },
        ])
    })

    it("shows an open stage's bests, cleared or not, and a locked one's none", () => {
        const p = recordBests(
            recordBests(
                recordBests(cleared(0), 0, run(3, 1234)),
                1,
                run(2, 999)
            ),
            2,
            run(1, 500)
        )
        // Stage 2 has bests but isn't cleared, as a stage mode clear leaves
        // it (KDA-272); stage 3 is locked (e.g. an odd save).
        expect(stageSlots(p, ["A", "B", "C"], "medium").slice(0, 3)).toEqual([
            { kind: "open", name: "A", stars: 3, bestTime: 1234 },
            { kind: "open", name: "B", stars: 2, bestTime: 999 },
            { kind: "locked", name: "C" },
        ])
    })

    it("shows only STAGE_COUNT slots when there are more levels", () => {
        const names = Array.from({ length: STAGE_COUNT + 2 }, (_, i) => `${i}`)
        expect(stageSlots(emptyProgress(), names, "medium")).toHaveLength(
            STAGE_COUNT
        )
    })
})

describe("isPlayable", () => {
    it("needs the stage both unlocked and backed by a level", () => {
        const p = cleared(0, 1)
        expect(isPlayable(p, 2, 0)).toBe(true)
        expect(isPlayable(p, 2, 1)).toBe(true)
        // Unlocked, but no level yet.
        expect(isPlayable(p, 2, 2)).toBe(false)
        // A level, but locked.
        expect(isPlayable(emptyProgress(), 2, 1)).toBe(false)
    })
})
