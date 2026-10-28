import { describe, expect, it, vi } from "vite-plus/test"
import {
    baseScreen,
    gameOf,
    initialScreen,
    startLevel,
    update,
    type FlowDeps,
    type Mode,
    type Picks,
    type Screen,
    type TickInput,
} from "./flow"
import { step, type MoveInput } from "./game"
import type { Action } from "./input"
import { parseLevel } from "./level"
import { emptyProgress } from "./progress"
import { AnimalId } from "./roster"
import { defaultSettings, VOLUME_MAX, type Settings } from "./settings"
import { cloneState, fixedRandom } from "./test/helpers"
import { vec2 } from "./vec2"

// The settings screen in the screen machine: opened from the title and
// from pause, Back to where it came from, and its rows changing the
// settings it carries.

const levels = [
    parseLevel({
        name: "corridor",
        parTime: 60,
        map: ["######", "#PQ..#", "######"],
        enemies: [],
    }),
]

// Input for one tick: the actions each player pressed (player 1 first).
function input(...pressed: (readonly Action[])[]): TickInput {
    return {
        wasPressed: (action, player = 0) =>
            pressed[player]?.includes(action) ?? false,
        move: (): MoveInput => ({ held: [], pressed: vec2(0, 0) }),
    }
}

function deps(overrides: Partial<FlowDeps> = {}): FlowDeps {
    return {
        levels,
        progress: emptyProgress(),
        dt: 1 / 60,
        random: fixedRandom(0),
        ...overrides,
    }
}

// Feed `presses` one tick each, from `screen`.
function press(screen: Screen, presses: Action[], d = deps()): Screen {
    return presses.reduce((s, action) => update(s, input([action]), d), screen)
}

// The title with the cursor on Settings (after the three modes; the mode
// stays the last one passed, versus).
const titleOnSettings = (): Screen =>
    press(initialScreen(), ["down", "down", "down"])

// A paused game (1-player unless `mode` says co-op) with the cursor on
// Settings.
function pausedOnSettings(mode: Mode = "solo"): Screen {
    const animals: Picks =
        mode === "solo" ? [AnimalId.dragon] : [AnimalId.dragon, AnimalId.owl]
    const playing = startLevel(levels, 0, animals, mode)
    return press(playing, ["pause", "down"])
}

function settingsOf(screen: Screen): Settings {
    if (screen.kind !== "settings") throw new Error(`On ${screen.kind}`)
    return screen.settings
}

describe("opening the settings", () => {
    it("opens from the title's Settings entry, from the saved settings", () => {
        const saved = { ...defaultSettings(), musicVolume: 2 }
        const title = titleOnSettings()
        const settings = update(
            title,
            input(["confirm"]),
            deps({ settings: saved })
        )
        expect(settings).toEqual({
            kind: "settings",
            mode: "versus",
            back: title,
            row: 0,
            settings: saved,
        })
        // The same object, so main sees nothing to save.
        expect(settingsOf(settings)).toBe(saved)
    })

    it("starts from the defaults when no settings are given", () => {
        const settings = press(titleOnSettings(), ["confirm"])
        expect(settingsOf(settings)).toEqual(defaultSettings())
    })

    it("still starts a game from a mode on the title", () => {
        expect(press(initialScreen(), ["confirm"]).kind).toBe("stageSelect")
    })

    it("opens from the pause menu's Settings entry", () => {
        const paused = pausedOnSettings()
        expect(paused).toMatchObject({ kind: "paused", choice: "settings" })
        const settings = press(paused, ["confirm"])
        expect(settings).toMatchObject({ kind: "settings", back: paused })
    })

    it("in 2-player, either player's confirm on Settings opens them", () => {
        const paused = pausedOnSettings("coop")
        const settings = update(paused, input([], ["confirm"]), deps())
        expect(settings.kind).toBe("settings")
    })
})

describe("the pause menu", () => {
    it("opens on Resume, so confirm resumes", () => {
        const playing = startLevel(levels, 0)
        const paused = press(playing, ["pause"])
        expect(paused).toEqual({ ...playing, kind: "paused" })
        expect(press(paused, ["confirm"])).toEqual(playing)
    })

    it("moves between Resume and Settings, stopping at either end", () => {
        const paused = press(startLevel(levels, 0), ["pause"])
        const onSettings = press(paused, ["down"])
        expect(onSettings).toMatchObject({ choice: "settings" })
        expect(press(onSettings, ["down"])).toBe(onSettings)
        expect(press(onSettings, ["up"])).toMatchObject({ choice: "resume" })
        expect(press(paused, ["up"])).toBe(paused)
    })

    it("resumes on pause even on Settings, dropping the cursor", () => {
        const playing = startLevel(levels, 0)
        const resumed = press(pausedOnSettings(), ["pause"])
        expect(resumed).toEqual({ ...playing, game: gameOf(resumed) })
        expect(resumed).not.toHaveProperty("choice")
    })
})

describe("Back from the settings", () => {
    it("returns to the title, still on Settings", () => {
        const title = titleOnSettings()
        const back = press(title, ["confirm", "pause"])
        expect(back).toBe(title)
    })

    it("returns to the paused game, still on Settings", () => {
        const paused = pausedOnSettings()
        expect(press(paused, ["confirm", "pause"])).toBe(paused)
    })

    it("also by confirming the Back row", () => {
        const title = titleOnSettings()
        const settings = press(title, [
            "confirm",
            "down",
            "down",
            "down",
            "down",
            "down",
        ])
        // Past Controls (title only), on Back.
        expect(settings).toMatchObject({ row: 5 })
        expect(press(settings, ["confirm"])).toBe(title)
    })

    it("follows player 1 only from the title, even in a 2-player mode", () => {
        const title = press(initialScreen(), ["down", "down", "down"])
        expect(title).toMatchObject({ mode: "versus", onSettings: true })
        const settings = press(title, ["confirm"])
        for (const action of ["down", "right", "pause"] as Action[]) {
            expect(update(settings, input([], [action]), deps())).toBe(settings)
        }
    })

    it.each(["coop", "versus"] as const)(
        "from pause in %s, follows either player",
        (mode) => {
            const paused = pausedOnSettings(mode)
            const settings = update(paused, input([], ["confirm"]), deps())
            const p2 = (s: Screen, action: Action) =>
                update(s, input([], [action]), deps())
            // Player 2 moves the cursor, changes a value and goes back.
            const effects = p2(settings, "down")
            expect(effects).toMatchObject({ row: 1 })
            expect(settingsOf(p2(effects, "right")).effectsVolume).toBe(9)
            expect(p2(effects, "pause")).toBe(paused)
            // Player 1 still does too.
            expect(press(settings, ["down"])).toMatchObject({ row: 1 })
        }
    )

    it("from pause, player 1 wins a tick both players press on", () => {
        const settings = press(pausedOnSettings("coop"), ["confirm"])
        const both = update(settings, input(["down"], ["pause"]), deps())
        expect(both).toMatchObject({ kind: "settings", row: 1 })
    })

    it("keeps the paused game as it was: never stepped meanwhile", () => {
        const stepGame = vi.fn(step)
        const d = deps({ step: stepGame })
        const playing = press(startLevel(levels, 0), [], d)
        const game = gameOf(playing)!
        const before = cloneState(game)
        let screen = press(playing, ["pause", "down", "confirm"], d)
        expect(gameOf(screen)).toBe(game)
        expect(baseScreen(screen).kind).toBe("paused")
        screen = press(screen, ["right", "down", "confirm", "pause"], d)
        expect(screen.kind).toBe("paused")
        screen = press(screen, ["up", "confirm"], d)
        expect(screen.kind).toBe("playing")
        expect(gameOf(screen)).toBe(game)
        expect(stepGame).not.toHaveBeenCalled()
        expect(game).toEqual(before)
    })
})

describe("the settings rows", () => {
    const open = (settings: Settings = defaultSettings(), d = deps()) =>
        update(titleOnSettings(), input(["confirm"]), { ...d, settings })

    it("moves the cursor over the rows, stopping at either end", () => {
        const settings = open()
        expect(press(settings, ["up"])).toBe(settings)
        const last = press(settings, ["down", "down", "down", "down", "down"])
        expect(last).toMatchObject({ row: 5 })
        expect(press(last, ["down"])).toBe(last)
    })

    it("steps a volume with left and right", () => {
        const settings = open()
        const louder = press(settings, ["right"])
        expect(settingsOf(louder).musicVolume).toBe(8)
        const effects = press(settings, ["down", "left"])
        expect(settingsOf(effects).effectsVolume).toBe(7)
        expect(settingsOf(effects).musicVolume).toBe(7)
    })

    it("stops a volume at 0 and at VOLUME_MAX", () => {
        const loud = open({ ...defaultSettings(), musicVolume: VOLUME_MAX })
        expect(press(loud, ["right"])).toBe(loud)
        const quiet = open({ ...defaultSettings(), musicVolume: 0 })
        expect(press(quiet, ["left"])).toBe(quiet)
        expect(settingsOf(press(quiet, ["right"])).musicVolume).toBe(1)
    })

    it("does nothing on confirm on a volume", () => {
        const settings = open()
        expect(press(settings, ["confirm"])).toBe(settings)
    })

    it("flips Mute with confirm, left or right", () => {
        const mute = press(open(), ["down", "down"])
        const muted = press(mute, ["confirm"])
        expect(settingsOf(muted).muted).toBe(true)
        expect(settingsOf(press(muted, ["left"])).muted).toBe(false)
        expect(settingsOf(press(muted, ["right"])).muted).toBe(false)
    })

    it("sets screen shake from its effective value", () => {
        const shake = ["down", "down", "down"] as Action[]
        // Unset with no reduced motion: on, so a flip turns it off.
        const normal = press(open(), shake)
        expect(settingsOf(press(normal, ["confirm"])).screenShake).toBe(false)
        // Unset with reduced motion: off, so a flip turns it on.
        const reduced = deps({ prefersReducedMotion: true })
        const calm = press(open(defaultSettings(), reduced), shake, reduced)
        expect(settingsOf(press(calm, ["confirm"], reduced)).screenShake).toBe(
            true
        )
    })

    it("keeps each change for the next tick, as a new settings object", () => {
        const settings = open()
        const once = press(settings, ["right"])
        const twice = press(once, ["right"])
        expect(settingsOf(twice).musicVolume).toBe(9)
        expect(settingsOf(once)).not.toBe(settingsOf(settings))
        expect(settingsOf(settings).musicVolume).toBe(7)
    })
})
