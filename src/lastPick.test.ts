import { describe, expect, it, vi } from "vite-plus/test"
import {
    isAnimalId,
    LAST_PICK_KEY,
    loadLastPick,
    parseLastPick,
    saveLastPick,
    type PickStorage,
} from "./lastPick"
import { PROGRESS_KEY } from "./progress"
import { ANIMAL_IDS, AnimalId, DEFAULT_ANIMAL } from "./roster"

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
const throwing: PickStorage = {
    getItem: () => {
        throw new Error("SecurityError")
    },
    setItem: () => {
        throw new Error("QuotaExceededError")
    },
}

describe("LAST_PICK_KEY", () => {
    it("is its own versioned key, apart from progress", () => {
        expect(LAST_PICK_KEY).toBe("dot-eater:character:v1")
        expect(LAST_PICK_KEY).not.toBe(PROGRESS_KEY)
    })
})

describe("isAnimalId", () => {
    it("accepts every roster id", () => {
        for (const id of ANIMAL_IDS) expect(isAnimalId(id)).toBe(true)
    })

    it.each([null, undefined, "", "fly", "Dragon", " dragon", "toString", 1])(
        "rejects %j",
        (value) => {
            expect(isAnimalId(value)).toBe(false)
        }
    )
})

describe("parseLastPick", () => {
    it("reads back a saved id", () => {
        for (const id of ANIMAL_IDS) expect(parseLastPick(id)).toBe(id)
    })

    it.each([null, "", "fly", "PENGUIN", '"owl"', "__proto__"])(
        "falls back to the Dragon on %j",
        (raw) => {
            expect(parseLastPick(raw)).toBe(DEFAULT_ANIMAL)
            expect(DEFAULT_ANIMAL).toBe(AnimalId.dragon)
        }
    )
})

describe("loadLastPick", () => {
    it("loads what saveLastPick wrote", () => {
        const storage = memoryStorage()
        expect(saveLastPick(storage, AnimalId.skunk)).toBe(true)
        expect(storage.data.get(LAST_PICK_KEY)).toBe("skunk")
        expect(loadLastPick(storage)).toBe(AnimalId.skunk)
    })

    it("gives the default with nothing saved", () => {
        expect(loadLastPick(memoryStorage())).toBe(DEFAULT_ANIMAL)
    })

    it("gives the default for an unknown saved value", () => {
        const storage = memoryStorage({ [LAST_PICK_KEY]: "unicorn" })
        expect(loadLastPick(storage)).toBe(DEFAULT_ANIMAL)
    })

    it("gives the default with no storage or storage that throws", () => {
        expect(loadLastPick(undefined)).toBe(DEFAULT_ANIMAL)
        expect(loadLastPick(throwing)).toBe(DEFAULT_ANIMAL)
    })
})

describe("saveLastPick", () => {
    it("reports failure instead of throwing", () => {
        expect(saveLastPick(undefined, AnimalId.owl)).toBe(false)
        expect(saveLastPick(throwing, AnimalId.owl)).toBe(false)
    })

    it("writes only its own key", () => {
        const storage = memoryStorage({ [PROGRESS_KEY]: "saved" })
        saveLastPick(storage, AnimalId.boar)
        expect(storage.setItem).toHaveBeenCalledTimes(1)
        expect(storage.data.get(PROGRESS_KEY)).toBe("saved")
    })
})
