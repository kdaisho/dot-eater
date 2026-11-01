import { describe, expect, it, vi } from "vite-plus/test"
import {
    ADMIN_KEY,
    adminScreen,
    loadAdmin,
    saveAdmin,
    unlockAll,
} from "./admin"
import { update, type FlowDeps, type TickInput } from "./flow"
import { stages } from "./levels"
import { emptyProgress, isPlayable, markCleared, STAGE_COUNT } from "./progress"
import { difficultySelect, fixedRandom } from "./test/helpers"
import { vec2 } from "./vec2"

// An in-memory Storage stand-in.
function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial))
    return {
        data,
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
        removeItem: (key: string) => void data.delete(key),
    } as unknown as Storage & { data: Map<string, string> }
}

describe("loadAdmin and saveAdmin", () => {
    it("remember debug mode for the passphrase it was turned on with", () => {
        const storage = memoryStorage()
        expect(loadAdmin(storage, "abc")).toBe(false)
        saveAdmin(storage, "abc")
        expect(storage.data.get(ADMIN_KEY)).toBe("abc")
        expect(loadAdmin(storage, "abc")).toBe(true)
        // A new passphrase turns it off.
        expect(loadAdmin(storage, "def")).toBe(false)
        saveAdmin(storage)
        expect(loadAdmin(storage, "abc")).toBe(false)
    })

    it("is never on without a passphrase set", () => {
        const storage = memoryStorage({ [ADMIN_KEY]: "" })
        expect(loadAdmin(storage, "")).toBe(false)
    })

    it("is off, and doesn't throw, when storage is blocked", () => {
        const blocked = {
            getItem: vi.fn(() => {
                throw new Error("SecurityError")
            }),
            setItem: vi.fn(() => {
                throw new Error("SecurityError")
            }),
        } as unknown as Storage
        expect(loadAdmin(blocked, "abc")).toBe(false)
        expect(() => saveAdmin(blocked, "abc")).not.toThrow()
    })
})

describe("unlockAll", () => {
    it("opens every stage, keeping what was played", () => {
        const played = markCleared(emptyProgress(), 0)
        const all = unlockAll(played)
        for (let i = 0; i < STAGE_COUNT; i++)
            expect(isPlayable(all, stages.length, i)).toBe(true)
        expect(all.stages[0]).toBe(played.stages[0])
        expect(all.stages[STAGE_COUNT - 1].cleared).toBe(false)
        // Only a view: the progress given is left alone.
        expect(isPlayable(played, stages.length, 5)).toBe(false)
    })
})

const deps = {
    levels: stages,
    lastDifficulty: "hard",
    lastAnimal: "owl",
} as const

describe("adminScreen", () => {
    it("opens a stage's difficulty select, on the last difficulty", () => {
        expect(adminScreen({ kind: "stage", level: 6 }, deps)).toEqual(
            difficultySelect(6, "hard")
        )
    })

    it("shows the story's ending, which goes on to the end roll", () => {
        const screen = adminScreen({ kind: "storyEnd" }, deps)
        expect(screen).toMatchObject({
            kind: "storyEnd",
            mode: "solo",
            level: STAGE_COUNT - 1,
            difficulty: "hard",
            animals: ["owl"],
            run: { total: 0 },
        })
        const confirm: TickInput = {
            wasPressed: (action) => action === "confirm",
            move: () => ({ held: [], pressed: vec2(0, 0) }),
        }
        const flow: FlowDeps = {
            levels: stages,
            progress: emptyProgress(),
            dt: 1,
            random: fixedRandom(0),
        }
        expect(update(screen, confirm, flow)).toMatchObject({
            kind: "endRoll",
            difficulty: "hard",
        })
    })

    it("plays the end roll from its start", () => {
        expect(adminScreen({ kind: "endRoll" }, deps)).toEqual({
            kind: "endRoll",
            mode: "solo",
            difficulty: "hard",
            elapsed: { seconds: 0 },
        })
    })
})
