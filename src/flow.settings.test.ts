import { describe, expect, it, vi } from "vite-plus/test"
import {
    baseScreen,
    gameOf,
    initialScreen,
    selectItem,
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
import { emptyProgress } from "./progress"
import { AnimalId } from "./roster"
import { defaultSettings, VOLUME_MAX, type Settings } from "./settings"
import { cloneState, fixedRandom, parseFlat, sameAtEvery } from "./test/helpers"
import { vec2 } from "./vec2"

// The settings screen in the screen machine: opened from the title and
// from pause, Back to where it came from, and its rows changing the
// settings it carries.

const levels = [
    parseFlat({
        name: "corridor",
        parTime: 60,
        map: ["######", "#PQ..#", "######"],
        enemies: [],
    }),
].map(sameAtEvery)

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
        expect(press(initialScreen(), ["confirm"]).kind).toBe("playSelect")
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
        const down = Array<Action>(7).fill("down")
        const settings = press(title, ["confirm", ...down])
        // Past Controls (title only), on Back.
        expect(settings).toMatchObject({ row: 7 })
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
        const last = press(settings, Array<Action>(7).fill("down"))
        expect(last).toMatchObject({ row: 7 })
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

    it("steps screen shake from Auto to On to Off", () => {
        const shake = press(open(), ["down", "down", "down"])
        expect(settingsOf(shake).screenShake).toBeNull()
        const on = press(shake, ["confirm"])
        expect(settingsOf(on).screenShake).toBe(true)
        expect(settingsOf(press(on, ["right"])).screenShake).toBe(false)
        expect(settingsOf(press(shake, ["left"])).screenShake).toBe(false)
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

// Tapping (KDA-214): main puts the cursor on the tapped item with
// selectItem, then presses confirm, or left/right for a slider's arrows.
describe("selectItem on the title, pause and settings", () => {
    it("puts the title's cursor on Settings and back on a mode", () => {
        const title = initialScreen()
        const onSettings = selectItem(title, 3)
        expect(onSettings).toEqual({ ...title, onSettings: true })
        expect(selectItem(onSettings, 3)).toBe(onSettings)
        expect(update(onSettings, input(["confirm"]), deps())).toMatchObject({
            kind: "settings",
        })
        expect(selectItem(onSettings, 0)).toEqual({
            kind: "title",
            mode: "solo",
        })
    })

    it("puts the pause menu's cursor on Settings or Resume", () => {
        const paused = press(startLevel(levels, 0, [AnimalId.dragon]), [
            "pause",
        ])
        const onSettings = selectItem(paused, 1)
        expect(onSettings).toMatchObject({ kind: "paused", choice: "settings" })
        expect(update(onSettings, input(["confirm"]), deps())).toMatchObject({
            kind: "settings",
        })
        expect(selectItem(paused, 0)).toBe(paused)
        expect(
            update(selectItem(onSettings, 0), input(["confirm"]), deps())
        ).toMatchObject({ kind: "playing" })
    })

    it("moves the settings cursor to a row, which confirm or left/right then change", () => {
        const settings = update(titleOnSettings(), input(["confirm"]), deps())
        const mute = selectItem(settings, 2)
        expect(mute).toMatchObject({ row: 2 })
        expect(settingsOf(update(mute, input(["confirm"]), deps())).muted).toBe(
            true
        )
        // A choice's ▶ or ◀ (Facing guide): the cursor on it, then right
        // or left, wrapping round; confirm steps it forward.
        const guide = selectItem(settings, 4)
        expect(guide).toMatchObject({ row: 4 })
        const aim = update(guide, input(["right"]), deps())
        expect(settingsOf(aim).facingGuide).toBe("aim")
        expect(
            settingsOf(update(aim, input(["right"]), deps())).facingGuide
        ).toBe("arrow")
        expect(
            settingsOf(update(guide, input(["left"]), deps())).facingGuide
        ).toBe("aim")
        expect(
            settingsOf(update(guide, input(["confirm"]), deps())).facingGuide
        ).toBe("aim")
        // A slider's ▶: the cursor on it, then right.
        const effects = selectItem(settings, 1)
        expect(
            settingsOf(update(effects, input(["right"]), deps())).effectsVolume
        ).toBe(defaultSettings().effectsVolume + 1)
    })

    it("counts the rows that show: Show D-pad only on touch devices", () => {
        const touch = deps({ touch: true })
        const settings = update(titleOnSettings(), input(["confirm"]), touch)
        // Without touch: six rows, Controls, then Back (index 7) last.
        expect(selectItem(settings, 8)).toBe(settings)
        const dpad = selectItem(settings, 6, touch)
        expect(dpad).toMatchObject({ row: 6 })
        expect(
            settingsOf(update(dpad, input(["confirm"]), touch)).showDpad
        ).toBe(true)
        // With touch: Show D-pad, then Controls, then Back (index 8).
        const controls = selectItem(settings, 7, touch)
        expect(update(controls, input(["confirm"]), touch)).toMatchObject({
            kind: "controls",
        })
        const back = selectItem(settings, 8, touch)
        expect(update(back, input(["confirm"]), touch)).toMatchObject({
            kind: "title",
        })
    })
})

describe("the Players setting in a game (KDA-262)", () => {
    const bump = { ...defaultSettings(), playersBump: true }
    // Player 1 holding east, into player 2 (P and Q are side by side).
    const east: TickInput = {
        wasPressed: () => false,
        move: (player = 0): MoveInput => ({
            held: player === 0 ? [vec2(1, 0)] : [],
            pressed: vec2(0, 0),
        }),
    }
    const coop = () =>
        startLevel(levels, 0, [AnimalId.dragon, AnimalId.owl], "coop")

    it.each([
        ["Bump", bump, true],
        ["Pass through", defaultSettings(), false],
        ["nothing saved", undefined, false],
    ] as const)("plays by %s", (_, settings, on) => {
        const playing = coop()
        const game = gameOf(playing)!
        update(playing, east, deps(settings ? { settings } : {}))
        expect(game.playersBump).toBe(on)
        const p1 = game.players[0].character.pos
        expect(p1).toEqual(on ? vec2(1, 1) : vec2(2, 1))
    })

    it("applies a change made from pause once play resumes", () => {
        let screen = coop()
        const game = gameOf(screen)!
        screen = update(screen, input(), deps())
        expect(game.playersBump).toBe(false)
        // Paused, the setting changes (main saves it into deps.settings).
        screen = press(screen, ["pause"])
        screen = press(screen, ["confirm"], deps({ settings: bump }))
        expect(screen.kind).toBe("playing")
        update(screen, input(), deps({ settings: bump }))
        expect(game.playersBump).toBe(true)
    })
})
