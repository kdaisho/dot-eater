import { describe, expect, it, vi } from "vite-plus/test"
import type { Difficulty } from "./difficulty"
import {
    bestsAt,
    emptyProgress,
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
    stageSlots,
    type Progress,
    type StageProgress,
} from "./progress"

// Stars and bests per difficulty (KDA-265), kept in the version 1 save:
// `byDifficulty` beside the top-level bests, which are Medium's.

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

const run = (difficulty: Difficulty, stars: number, ticks: number) => ({
    difficulty,
    stars,
    ticks,
})

// Progress with stage 0 as given.
const withStage0 = (stage: StageProgress): Progress => {
    const p = emptyProgress()
    return { ...p, stages: [stage, ...p.stages.slice(1)] }
}

// Parse a save whose only stage is `stage`, and return that stage.
const parseStage0 = (stage: Record<string, unknown>) =>
    parseProgress(JSON.stringify({ version: 1, stages: [stage] })).stages[0]

describe("recordBests at a difficulty", () => {
    it("keeps a difficulty other than Medium's apart, out of the top level", () => {
        const p = recordBests(
            markCleared(emptyProgress(), 0),
            0,
            run("hard", 2, 900)
        )
        expect(p.stages[0]).toEqual({
            cleared: true,
            byDifficulty: { hard: { stars: 2, bestTime: 900 } },
        })
    })

    it("writes Medium's into both byDifficulty and the top level", () => {
        const p = recordBests(
            markCleared(emptyProgress(), 0),
            0,
            run("medium", 3, 1200)
        )
        expect(p.stages[0]).toEqual({
            cleared: true,
            stars: 3,
            bestTime: 1200,
            byDifficulty: { medium: { stars: 3, bestTime: 1200 } },
        })
    })

    it("improves each difficulty's bests against its own only", () => {
        let p = markCleared(emptyProgress(), 0)
        p = recordBests(p, 0, run("easy", 3, 600))
        // Fewer stars and slower than Easy's, but Hard's first.
        p = recordBests(p, 0, run("hard", 1, 2400))
        expect(p.stages[0].byDifficulty).toEqual({
            easy: { stars: 3, bestTime: 600 },
            hard: { stars: 1, bestTime: 2400 },
        })
        const same = recordBests(p, 0, run("hard", 1, 3000))
        expect(same).toBe(p)
        p = recordBests(p, 0, run("hard", 2, 3000))
        expect(bestsAt(p.stages[0], "hard")).toEqual({
            stars: 2,
            bestTime: 2400,
        })
        expect(bestsAt(p.stages[0], "easy")).toEqual({
            stars: 3,
            bestTime: 600,
        })
        expect(bestsAt(p.stages[0], "superHard")).toEqual({})
    })

    it("ignores a clear at a difficulty it doesn't know", () => {
        const p = markCleared(emptyProgress(), 0)
        const odd = {
            stars: 3,
            ticks: 60,
            difficulty: "nightmare" as Difficulty,
        }
        expect(recordBests(p, 0, odd)).toBe(p)
    })
})

describe("a save from before difficulties", () => {
    // What builds before KDA-265 wrote: bests at the top only.
    const old = { cleared: true, stars: 2, bestTime: 1500 }

    it("counts as Medium's bests, and no other difficulty's", () => {
        const stage = parseStage0(old)
        expect(bestsAt(stage, "medium")).toEqual({ stars: 2, bestTime: 1500 })
        expect(bestsAt(stage, "easy")).toEqual({})
        expect(bestsAt(stage, "hard")).toEqual({})
    })

    it("has a Medium clear improve on it, writing both places", () => {
        const p = withStage0(parseStage0(old))
        // More stars but slower: the old time stays the best.
        expect(recordBests(p, 0, run("medium", 3, 2000)).stages[0]).toEqual({
            cleared: true,
            stars: 3,
            bestTime: 1500,
            byDifficulty: { medium: { stars: 3, bestTime: 1500 } },
        })
        // Worse on both: nothing to save.
        expect(recordBests(p, 0, run("medium", 1, 2000))).toBe(p)
    })

    it("is left alone by a clear at another difficulty", () => {
        const p = withStage0(parseStage0(old))
        expect(recordBests(p, 0, run("easy", 3, 300)).stages[0]).toEqual({
            ...old,
            byDifficulty: { easy: { stars: 3, bestTime: 300 } },
        })
    })

    // An older build only knows the top level, and may improve it after a
    // newer one wrote byDifficulty.medium.
    it("reads Medium as the better of the top level and its own record", () => {
        const stage = parseStage0({
            cleared: true,
            stars: 3,
            bestTime: 1000,
            byDifficulty: { medium: { stars: 2, bestTime: 1200 } },
        })
        expect(bestsAt(stage, "medium")).toEqual({ stars: 3, bestTime: 1000 })
        const p = withStage0(stage)
        expect(recordBests(p, 0, run("medium", 3, 1100))).toBe(p)
    })
})

describe("parseProgress: byDifficulty", () => {
    it("reads each difficulty's bests back", () => {
        const p = recordBests(
            recordBests(
                markCleared(emptyProgress(), 0),
                0,
                run("hard", 2, 900)
            ),
            0,
            run("medium", 1, 1800)
        )
        expect(parseProgress(serializeProgress(p))).toEqual(p)
    })

    it("drops malformed bests within it, keeping the rest", () => {
        expect(
            parseStage0({
                cleared: true,
                byDifficulty: {
                    easy: { stars: 4, bestTime: 90 },
                    hard: { stars: 2, bestTime: "fast", note: "x" },
                    superHard: "lots",
                },
            })
        ).toEqual({
            cleared: true,
            byDifficulty: {
                easy: { bestTime: 90 },
                hard: { stars: 2, note: "x" },
            },
        })
    })

    it.each([null, "hard", 3, [{ stars: 2 }]])(
        "drops a byDifficulty of %j, keeping the stage",
        (byDifficulty) => {
            expect(
                parseStage0({ cleared: true, stars: 1, byDifficulty })
            ).toEqual({ cleared: true, stars: 1 })
        }
    )

    it("keeps entries for difficulties it doesn't know through a save", () => {
        const raw = JSON.stringify({
            version: 1,
            stages: [
                {
                    cleared: true,
                    byDifficulty: { nightmare: { stars: 9 } },
                },
            ],
        })
        const p = recordBests(parseProgress(raw), 0, run("easy", 2, 600))
        expect(JSON.parse(serializeProgress(p)).stages[0].byDifficulty).toEqual(
            { nightmare: { stars: 9 }, easy: { stars: 2, bestTime: 600 } }
        )
    })
})

describe("mergeProgress: byDifficulty", () => {
    const stage = (byDifficulty: NonNullable<StageProgress["byDifficulty"]>) =>
        withStage0({ cleared: true, byDifficulty })

    it("keeps the better of each difficulty's bests from either side", () => {
        const mine = stage({
            easy: { stars: 3, bestTime: 900 },
            hard: { stars: 1 },
        })
        const saved = stage({
            easy: { stars: 2, bestTime: 600 },
            superHard: { stars: 2, bestTime: 4000 },
        })
        expect(mergeProgress(mine, saved).stages[0].byDifficulty).toEqual({
            easy: { stars: 3, bestTime: 600 },
            hard: { stars: 1 },
            superHard: { stars: 2, bestTime: 4000 },
        })
    })

    it("leaves byDifficulty out when neither side has it", () => {
        const plain = withStage0({ cleared: true, stars: 2 })
        expect(mergeProgress(plain, plain).stages[0]).toEqual({
            cleared: true,
            stars: 2,
        })
    })

    it("keeps another tab's better bests when recording a clear", () => {
        const storage = memoryStorage()
        saveProgress(storage, stage({ hard: { stars: 3, bestTime: 800 } }))
        const mine = stage({ hard: { stars: 1, bestTime: 700 } })
        const next = recordClear(mine, storage, 0, run("easy", 1, 5000))
        const expected = {
            hard: { stars: 3, bestTime: 700 },
            easy: { stars: 1, bestTime: 5000 },
        }
        expect(next.stages[0].byDifficulty).toEqual(expected)
        expect(loadProgress(storage).stages[0].byDifficulty).toEqual(expected)
    })
})

describe("unlocks across difficulties", () => {
    it.each(["easy", "hard", "superHard"] as const)(
        "opens the next stage on a clear at %s, as at Medium",
        (difficulty) => {
            const storage = memoryStorage()
            const p = recordClear(
                emptyProgress(),
                storage,
                0,
                run(difficulty, 1, 60)
            )
            expect(isUnlocked(p, 1)).toBe(true)
            expect(isUnlocked(loadProgress(storage), 1)).toBe(true)
        }
    )

    it("doesn't save again when a clear improves nothing", () => {
        const storage = memoryStorage()
        const p = recordClear(emptyProgress(), storage, 0, run("hard", 3, 600))
        storage.setItem.mockClear()
        recordClear(p, storage, 0, run("hard", 2, 900))
        expect(storage.setItem).not.toHaveBeenCalled()
        expect(storage.data.get(PROGRESS_KEY)).toBeDefined()
    })
})

describe("stageSlots at a difficulty", () => {
    const names = ["A", "B", "C"]
    let p = markCleared(markCleared(emptyProgress(), 0), 1)
    p = recordBests(p, 0, run("hard", 3, 1234))
    p = recordBests(p, 0, run("medium", 1, 4000))
    p = recordBests(p, 1, run("easy", 2, 999))

    it("shows each cleared stage's bests at that difficulty only", () => {
        expect(stageSlots(p, names, "hard").slice(0, 3)).toEqual([
            { kind: "open", name: "A", stars: 3, bestTime: 1234 },
            { kind: "open", name: "B" },
            { kind: "open", name: "C" },
        ])
        expect(stageSlots(p, names, "easy").slice(0, 2)).toEqual([
            { kind: "open", name: "A" },
            { kind: "open", name: "B", stars: 2, bestTime: 999 },
        ])
        expect(stageSlots(p, names, "medium")[0]).toEqual({
            kind: "open",
            name: "A",
            stars: 1,
            bestTime: 4000,
        })
    })

    it("shows an old save's bests at Medium", () => {
        const old = withStage0({ cleared: true, stars: 2, bestTime: 600 })
        expect(stageSlots(old, names, "medium")[0]).toEqual({
            kind: "open",
            name: "A",
            stars: 2,
            bestTime: 600,
        })
        expect(stageSlots(old, names, "superHard")[0]).toEqual({
            kind: "open",
            name: "A",
        })
    })
})
