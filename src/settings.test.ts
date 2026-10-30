import { describe, expect, it, vi } from "vite-plus/test"
import { DEFAULT_BINDINGS, rebind } from "./bindings"
import { LAST_PICK_KEY } from "./lastPick"
import { PROGRESS_KEY } from "./progress"
import {
    bindingsOf,
    defaultSettings,
    loadSettings,
    parseSettings,
    saveSettings,
    serializeSettings,
    SETTINGS_KEY,
    shakeEnabled,
    type SettingsStorage,
} from "./settings"

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
const throwing: SettingsStorage = {
    getItem: () => {
        throw new Error("SecurityError")
    },
    setItem: () => {
        throw new Error("QuotaExceededError")
    },
}

const saved = (fields: Record<string, unknown>) =>
    JSON.stringify({ version: 1, ...fields })

describe("SETTINGS_KEY", () => {
    it("is its own versioned key", () => {
        expect(SETTINGS_KEY).toBe("dot-eater:settings:v1")
        expect(SETTINGS_KEY).not.toBe(PROGRESS_KEY)
        expect(SETTINGS_KEY).not.toBe(LAST_PICK_KEY)
    })
})

describe("defaultSettings", () => {
    it("has the agreed defaults", () => {
        expect(defaultSettings()).toEqual({
            version: 1,
            musicVolume: 7,
            effectsVolume: 8,
            muted: false,
            screenShake: null,
            showDpad: false,
            facingGuide: "arrow",
            playersBump: false,
        })
    })
})

describe("parseSettings", () => {
    it("gives the defaults for nothing saved", () => {
        expect(parseSettings(null)).toEqual(defaultSettings())
    })

    it.each([
        ["bad JSON", "{oops"],
        ["another version", JSON.stringify({ version: 2, muted: true })],
        ["no version", JSON.stringify({ muted: true })],
        ["an array", "[1, 2]"],
        ["a number", "7"],
        ["null", "null"],
    ])("gives the defaults for %s", (_, raw) => {
        expect(parseSettings(raw)).toEqual(defaultSettings())
    })

    it("reads a full save", () => {
        const settings = {
            version: 1,
            musicVolume: 0,
            effectsVolume: 10,
            muted: true,
            screenShake: false,
            showDpad: true,
            facingGuide: "aim",
            playersBump: true,
        }
        expect(parseSettings(JSON.stringify(settings))).toEqual(settings)
    })

    it("fills fields a save is missing with their defaults", () => {
        expect(parseSettings(saved({ muted: true }))).toEqual({
            ...defaultSettings(),
            muted: true,
        })
    })

    it.each([
        ["musicVolume", 11],
        ["musicVolume", -1],
        ["musicVolume", 3.5],
        ["musicVolume", "5"],
        ["effectsVolume", 99],
        ["effectsVolume", null],
        ["muted", "yes"],
        ["screenShake", 1],
        ["showDpad", null],
        ["facingGuide", "arrows"],
        ["facingGuide", 1],
        ["facingGuide", null],
        ["playersBump", "bump"],
        ["playersBump", 1],
        ["playersBump", null],
    ])("drops an invalid %s (%j) alone", (field, value) => {
        const parsed = parseSettings(saved({ [field]: value, muted: true }))
        expect(parsed).toEqual({ ...defaultSettings(), muted: true })
    })

    it("keeps an explicit screen shake, on or off, and null", () => {
        expect(parseSettings(saved({ screenShake: true })).screenShake).toBe(
            true
        )
        expect(parseSettings(saved({ screenShake: false })).screenShake).toBe(
            false
        )
        expect(parseSettings(saved({ screenShake: null })).screenShake).toBe(
            null
        )
    })

    it("reads a save from before the Players setting as pass through", () => {
        const older = saved({ musicVolume: 3 })
        expect(JSON.parse(older)).not.toHaveProperty("playersBump")
        expect(parseSettings(older).playersBump).toBe(false)
        expect(parseSettings(saved({ playersBump: true })).playersBump).toBe(
            true
        )
    })

    it("keeps fields it doesn't know, for a later build", () => {
        const later = { up: "KeyI" }
        expect(parseSettings(saved({ later }))).toEqual({
            ...defaultSettings(),
            later,
        })
    })

    describe("bindings", () => {
        const remapped = rebind(DEFAULT_BINDINGS, 0, "breath", "KeyX")

        it("leaves them out when the save has none: the defaults", () => {
            const s = parseSettings(saved({}))
            expect("bindings" in s).toBe(false)
            expect(bindingsOf(s)).toBe(DEFAULT_BINDINGS)
            expect(bindingsOf(defaultSettings())).toBe(DEFAULT_BINDINGS)
        })

        it("round-trips saved bindings", () => {
            const s = { ...defaultSettings(), bindings: remapped }
            const back = parseSettings(serializeSettings(s))
            expect(back).toEqual(s)
            expect(bindingsOf(back).players[0].keys.breath).toBe("KeyX")
        })

        it.each([["nonsense"], [null], [{ players: 3 }], [[1, 2]]])(
            "reads bad bindings %j as the defaults",
            (bindings) => {
                const s = parseSettings(saved({ bindings, musicVolume: 3 }))
                expect(s.bindings).toEqual(DEFAULT_BINDINGS)
                expect(s.musicVolume).toBe(3)
            }
        )

        it("repairs bindings entry by entry", () => {
            const bindings = JSON.parse(JSON.stringify(remapped))
            bindings.players[1].keys.up = "Escape"
            const s = parseSettings(saved({ bindings }))
            expect(bindingsOf(s).players[1].keys.up).toBe("KeyW")
            expect(bindingsOf(s).players[0].keys.breath).toBe("KeyX")
        })
    })
})

describe("shakeEnabled", () => {
    it("follows reduced motion while unset", () => {
        expect(shakeEnabled(defaultSettings(), false)).toBe(true)
        expect(shakeEnabled(defaultSettings(), true)).toBe(false)
    })

    it("follows the setting once set", () => {
        const on = { ...defaultSettings(), screenShake: true }
        const off = { ...defaultSettings(), screenShake: false }
        expect(shakeEnabled(on, true)).toBe(true)
        expect(shakeEnabled(off, false)).toBe(false)
    })
})

describe("loadSettings and saveSettings", () => {
    it("round-trip through storage", () => {
        const storage = memoryStorage()
        const settings = { ...defaultSettings(), musicVolume: 3, muted: true }
        expect(saveSettings(storage, settings)).toBe(true)
        expect(storage.setItem).toHaveBeenCalledWith(
            SETTINGS_KEY,
            JSON.stringify(settings)
        )
        expect(loadSettings(storage)).toEqual(settings)
    })

    it("load the defaults from empty or bad storage", () => {
        expect(loadSettings(memoryStorage())).toEqual(defaultSettings())
        expect(
            loadSettings(memoryStorage({ [SETTINGS_KEY]: "{oops" }))
        ).toEqual(defaultSettings())
    })

    it("survive storage that is missing or throws", () => {
        expect(loadSettings(undefined)).toEqual(defaultSettings())
        expect(loadSettings(throwing)).toEqual(defaultSettings())
        expect(saveSettings(undefined, defaultSettings())).toBe(false)
        expect(saveSettings(throwing, defaultSettings())).toBe(false)
    })
})
