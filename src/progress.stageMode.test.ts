import { describe, expect, it, vi } from "vite-plus/test"
import {
    emptyProgress,
    isPlayable,
    isUnlocked,
    loadProgress,
    markCleared,
    parseProgress,
    PROGRESS_KEY,
    recordClear,
    serializeProgress,
    stageSlots,
    STAGE_COUNT,
} from "./progress"

// Stage mode with story-only unlocks (KDA-272): a stage mode clear records
// stars and bests but unlocks nothing; only story progress does, and the
// `cleared` flags saves already have still count.

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

const clear = { difficulty: "hard", stars: 2, ticks: 900 } as const
const stageMode = { unlocks: false }
const storyMode = { unlocks: true }

describe("recordClear in stage mode", () => {
    it("records the stars and bests, but unlocks nothing", () => {
        const storage = memoryStorage()
        const next = recordClear(emptyProgress(), storage, 0, clear, stageMode)
        expect(next.stages[0]).toEqual({
            cleared: false,
            byDifficulty: { hard: { stars: 2, bestTime: 900 } },
        })
        expect(isUnlocked(next, 1)).toBe(false)
        expect(loadProgress(storage)).toEqual(next)
    })

    it("leaves a stage story mode cleared cleared", () => {
        const storage = memoryStorage()
        const story = recordClear(emptyProgress(), storage, 0, clear, storyMode)
        const next = recordClear(
            story,
            storage,
            0,
            { ...clear, stars: 3 },
            stageMode
        )
        expect(next.stages[0].cleared).toBe(true)
        expect(next.stages[0].byDifficulty?.hard?.stars).toBe(3)
        expect(isUnlocked(next, 1)).toBe(true)
    })

    it("doesn't open the stage after the furthest one reached", () => {
        // Story mode reached stage 2; stage mode clears it.
        const reached = markCleared(emptyProgress(), 0)
        const next = recordClear(reached, undefined, 1, clear, stageMode)
        expect(isUnlocked(next, 1)).toBe(true)
        expect(isUnlocked(next, 2)).toBe(false)
    })

    it("saves nothing when nothing improves", () => {
        const storage = memoryStorage()
        const p = recordClear(emptyProgress(), storage, 0, clear, stageMode)
        storage.setItem.mockClear()
        recordClear(p, storage, 0, { ...clear, ticks: 1000 }, stageMode)
        expect(storage.setItem).not.toHaveBeenCalled()
    })

    it("unlocks in story mode, as before", () => {
        const next = recordClear(
            emptyProgress(),
            undefined,
            0,
            clear,
            storyMode
        )
        expect(next.stages[0].cleared).toBe(true)
        expect(isUnlocked(next, 1)).toBe(true)
    })
})

describe("stage select's slots", () => {
    it("keep the unlocks of a save from before story mode", () => {
        const old = parseProgress(
            JSON.stringify({
                version: 1,
                stages: [
                    { cleared: true, stars: 3, bestTime: 600 },
                    { cleared: true },
                ],
            })
        )
        expect(stageSlots(old, ["A", "B", "C", "D"], "medium")).toEqual([
            { kind: "open", name: "A", stars: 3, bestTime: 600 },
            { kind: "open", name: "B" },
            { kind: "open", name: "C" },
            { kind: "locked", name: "D" },
            ...Array(STAGE_COUNT - 4).fill({ kind: "comingSoon" }),
        ])
        expect(isPlayable(old, 4, 2)).toBe(true)
        expect(isPlayable(old, 4, 3)).toBe(false)
    })

    it("show a stage mode clear's bests on a stage that stays uncleared", () => {
        const storage = memoryStorage({
            [PROGRESS_KEY]: serializeProgress(markCleared(emptyProgress(), 0)),
        })
        const p = recordClear(
            loadProgress(storage),
            storage,
            1,
            clear,
            stageMode
        )
        expect(stageSlots(p, ["A", "B", "C"], "hard").slice(0, 3)).toEqual([
            { kind: "open", name: "A" },
            { kind: "open", name: "B", stars: 2, bestTime: 900 },
            { kind: "locked", name: "C" },
        ])
    })

    it("read Coming soon past the stages built, whatever is cleared", () => {
        let p = emptyProgress()
        for (let i = 0; i < STAGE_COUNT; i++) p = markCleared(p, i)
        const slots = stageSlots(p, ["A", "B"], "medium")
        expect(slots.slice(2)).toEqual(
            Array(STAGE_COUNT - 2).fill({ kind: "comingSoon" })
        )
        expect(isPlayable(p, 2, 2)).toBe(false)
    })
})
