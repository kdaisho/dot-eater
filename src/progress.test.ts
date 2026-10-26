import { describe, expect, it, vi } from "vite-plus/test"
import {
    emptyProgress,
    isPlayable,
    isUnlocked,
    loadProgress,
    markCleared,
    parseProgress,
    PROGRESS_KEY,
    saveProgress,
    serializeProgress,
    STAGE_COUNT,
    stageSlots,
    type Progress,
    type ProgressStorage,
} from "./progress"

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
        expect(stageSlots(cleared(0), ["A", "B", "C"])).toEqual([
            { kind: "open", name: "A" },
            { kind: "open", name: "B" },
            { kind: "locked", name: "C" },
            { kind: "comingSoon" },
            { kind: "comingSoon" },
        ])
    })

    it("shows only STAGE_COUNT slots when there are more levels", () => {
        const names = Array.from({ length: STAGE_COUNT + 2 }, (_, i) => `${i}`)
        expect(stageSlots(emptyProgress(), names)).toHaveLength(STAGE_COUNT)
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
