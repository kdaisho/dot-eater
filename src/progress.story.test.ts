import { describe, expect, it, vi } from "vite-plus/test"
import {
    emptyProgress,
    furthestStage,
    loadProgress,
    markCleared,
    mergeProgress,
    parseProgress,
    PROGRESS_KEY,
    recordClear,
    recordStoryBest,
    serializeProgress,
    STAGE_COUNT,
    type Progress,
} from "./progress"

// Story mode's progress (KDA-271): the furthest stage reached, from the
// `cleared` flags every save already has, and the best story score per
// difficulty, an optional field of the version 1 save.

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

function clearedTo(count: number): Progress {
    let progress = emptyProgress()
    for (let i = 0; i < count; i++) progress = markCleared(progress, i)
    return progress
}

const parse = (data: Record<string, unknown>) =>
    parseProgress(JSON.stringify({ version: 1, stages: [], ...data }))

describe("furthestStage", () => {
    it("is stage 1 with nothing cleared", () => {
        expect(furthestStage(emptyProgress())).toBe(0)
    })

    it("is the stage after the last one cleared", () => {
        expect(furthestStage(clearedTo(1))).toBe(1)
        expect(furthestStage(clearedTo(3))).toBe(3)
    })

    it("stays on the last slot once every stage is cleared", () => {
        expect(furthestStage(clearedTo(STAGE_COUNT))).toBe(STAGE_COUNT - 1)
    })

    it("counts a save from before story mode as story progress", () => {
        // A version 1 save, as stage mode wrote it.
        const old = parseProgress(
            JSON.stringify({
                version: 1,
                stages: [
                    { cleared: true, stars: 2, bestTime: 900 },
                    { cleared: true },
                    { cleared: false },
                ],
            })
        )
        expect(furthestStage(old)).toBe(2)
    })
})

describe("story bests in the save", () => {
    it("are left out of empty progress and of saves without them", () => {
        expect(emptyProgress()).not.toHaveProperty("storyBests")
        expect(parse({})).not.toHaveProperty("storyBests")
    })

    it("are read back as saved", () => {
        const progress = { ...emptyProgress(), storyBests: { hard: 1200 } }
        expect(parseProgress(serializeProgress(progress))).toEqual(progress)
    })

    it("drop a malformed score on its own, keeping unknown keys", () => {
        const parsed = parse({
            storyBests: {
                easy: 10,
                medium: -1,
                hard: 2.5,
                superHard: "100",
                future: { any: "thing" },
            },
        })
        expect(parsed.storyBests).toEqual({
            easy: 10,
            future: { any: "thing" },
        })
    })

    it("are dropped when they aren't an object, and the rest still counts", () => {
        const parsed = parse({
            stages: [{ cleared: true }],
            storyBests: [1, 2],
        })
        expect(parsed).not.toHaveProperty("storyBests")
        expect(parsed.stages[0].cleared).toBe(true)
    })

    it("merge to the higher of each difficulty's", () => {
        const mine = { ...emptyProgress(), storyBests: { easy: 50, hard: 10 } }
        const saved = {
            ...emptyProgress(),
            storyBests: { hard: 30, superHard: 5 },
        }
        expect(mergeProgress(mine, saved).storyBests).toEqual({
            easy: 50,
            hard: 30,
            superHard: 5,
        })
    })

    it("merge with only one side's", () => {
        const mine = { ...emptyProgress(), storyBests: { easy: 50 } }
        expect(mergeProgress(mine, emptyProgress()).storyBests).toEqual({
            easy: 50,
        })
        expect(mergeProgress(emptyProgress(), mine).storyBests).toEqual({
            easy: 50,
        })
        expect(
            mergeProgress(emptyProgress(), emptyProgress())
        ).not.toHaveProperty("storyBests")
    })

    it("survive recording a clear", () => {
        const storage = memoryStorage()
        const progress = { ...emptyProgress(), storyBests: { easy: 70 } }
        const next = recordClear(progress, storage, 0, {
            difficulty: "easy",
            stars: 3,
            ticks: 600,
        })
        expect(next.storyBests).toEqual({ easy: 70 })
        expect(loadProgress(storage).storyBests).toEqual({ easy: 70 })
    })
})

describe("recordStoryBest", () => {
    it("saves a first best at the difficulty", () => {
        const storage = memoryStorage()
        const next = recordStoryBest(emptyProgress(), storage, "hard", 1500)
        expect(next.storyBests).toEqual({ hard: 1500 })
        expect(loadProgress(storage)).toEqual(next)
    })

    it("keeps each difficulty's apart", () => {
        const storage = memoryStorage()
        let progress = recordStoryBest(emptyProgress(), storage, "hard", 1500)
        progress = recordStoryBest(progress, storage, "easy", 300)
        expect(progress.storyBests).toEqual({ hard: 1500, easy: 300 })
    })

    it("only improves: a lower or equal run total saves nothing", () => {
        const storage = memoryStorage()
        const best = recordStoryBest(emptyProgress(), storage, "hard", 1500)
        storage.setItem.mockClear()
        expect(recordStoryBest(best, storage, "hard", 1400)).toEqual(best)
        expect(recordStoryBest(best, storage, "hard", 1500)).toEqual(best)
        expect(storage.setItem).not.toHaveBeenCalled()
        expect(recordStoryBest(best, storage, "hard", 1501).storyBests).toEqual(
            { hard: 1501 }
        )
    })

    it("records a score of 0, but not a score a save couldn't hold", () => {
        const storage = memoryStorage()
        expect(
            recordStoryBest(emptyProgress(), storage, "easy", 0).storyBests
        ).toEqual({ easy: 0 })
        const fresh = memoryStorage()
        for (const bad of [-1, 1.5, Number.NaN]) {
            const next = recordStoryBest(emptyProgress(), fresh, "easy", bad)
            expect(next).not.toHaveProperty("storyBests")
        }
        expect(fresh.setItem).not.toHaveBeenCalled()
    })

    it("merges what another tab saved since, keeping the better", () => {
        const other = { ...clearedTo(2), storyBests: { hard: 2000, easy: 10 } }
        const storage = memoryStorage({
            [PROGRESS_KEY]: serializeProgress(other),
        })
        const next = recordStoryBest(emptyProgress(), storage, "easy", 400)
        expect(next.storyBests).toEqual({ hard: 2000, easy: 400 })
        expect(next.stages[1].cleared).toBe(true)
        expect(loadProgress(storage)).toEqual(next)
    })

    it("doesn't lose this tab's better best to another tab's lower one", () => {
        const storage = memoryStorage({
            [PROGRESS_KEY]: serializeProgress({
                ...emptyProgress(),
                storyBests: { hard: 100 },
            }),
        })
        const mine = { ...emptyProgress(), storyBests: { hard: 900 } }
        const next = recordStoryBest(mine, storage, "hard", 500)
        expect(next.storyBests).toEqual({ hard: 900 })
        expect(loadProgress(storage).storyBests).toEqual({ hard: 900 })
    })

    it("still records in memory with no storage", () => {
        const next = recordStoryBest(emptyProgress(), undefined, "hard", 1)
        expect(next.storyBests).toEqual({ hard: 1 })
    })
})
