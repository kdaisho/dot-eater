import { describe, expect, it } from "vite-plus/test"
import {
    DEFAULT_BINDINGS,
    PAD_A,
    PAD_START,
    type BindingTarget,
} from "./bindings"
import { CONTROLS_ROWS } from "./controlsMenu"
import {
    baseScreen,
    initialScreen,
    screenSettings,
    update,
    type FlowDeps,
    type Screen,
    type TickInput,
} from "./flow"
import type { MoveInput } from "./game"
import type { Action } from "./input"
import { parseLevel } from "./level"
import { emptyProgress } from "./progress"
import { bindingsOf, defaultSettings, type Settings } from "./settings"
import { fixedRandom } from "./test/helpers"
import { vec2 } from "./vec2"

// The controls screen (KDA-215): opened from the settings' Controls row,
// one player's bindings at a time, capturing a key or button for a row,
// reset and back.

const levels = [
    parseLevel({
        name: "corridor",
        parTime: 60,
        map: ["######", "#PQ..#", "######"],
        enemies: [],
    }),
]

// One tick's input: player 1's presses, and what main captured (a key or
// button, null for Escape).
function input(
    pressed: readonly Action[] = [],
    captured?: BindingTarget | null
): TickInput {
    return {
        wasPressed: (action, player = 0) =>
            player === 0 && pressed.includes(action),
        move: (): MoveInput => ({ held: [], pressed: vec2(0, 0) }),
        captured: () => captured,
    }
}

const deps = (settings?: Settings): FlowDeps => ({
    levels,
    progress: emptyProgress(),
    dt: 1 / 60,
    random: fixedRandom(0),
    ...(settings ? { settings } : {}),
})

function press(screen: Screen, presses: Action[], d = deps()): Screen {
    return presses.reduce((s, action) => update(s, input([action]), d), screen)
}

// The index of a row in CONTROLS_ROWS.
function rowIndex(kind: string, action?: string): number {
    const i = CONTROLS_ROWS.findIndex(
        (r) => r.kind === kind && (!("action" in r) || r.action === action)
    )
    if (i < 0) throw new Error(`No row ${kind} ${action}`)
    return i
}

// The settings, opened from the title, with the cursor on Controls.
function settingsOnControls(d = deps()): Screen {
    const title = press(initialScreen(), ["down", "down", "down"], d)
    return press(title, ["confirm", "down", "down", "down", "down"], d)
}

// The controls screen, fresh from the settings.
function controls(d = deps()): Screen {
    return press(settingsOnControls(d), ["confirm"], d)
}

// The controls screen with the cursor on `row`, for `player`.
function on(row: number, player = 0, d = deps()): Screen {
    const screen = controls(d)
    if (screen.kind !== "controls") throw new Error(`On ${screen.kind}`)
    return { ...screen, row, player }
}

function asControls(screen: Screen) {
    if (screen.kind !== "controls") throw new Error(`On ${screen.kind}`)
    return screen
}

const bindings = (screen: Screen) => bindingsOf(asControls(screen).settings)

describe("opening the controls screen", () => {
    it("opens from the settings' Controls row on player 1's first row", () => {
        const screen = controls()
        expect(screen).toMatchObject({ kind: "controls", player: 0, row: 0 })
        expect(asControls(screen).capturing).toBeFalsy()
        expect(baseScreen(screen).kind).toBe("title")
    })

    it("starts from the saved settings", () => {
        const saved = { ...defaultSettings(), musicVolume: 2 }
        expect(screenSettings(controls(deps(saved)))).toEqual(saved)
    })

    it("isn't offered on the settings opened from pause", () => {
        // See settingsMenu's titleOnly; the pause path's rows end with Back.
        const pausedSettings: Screen = {
            kind: "settings",
            mode: "solo",
            row: 4,
            settings: defaultSettings(),
            back: {
                kind: "paused",
                mode: "solo",
                level: 0,
                animals: ["dragon"],
                game: {} as never,
            },
        }
        // Row 4 there is Back, not Controls.
        expect(press(pausedSettings, ["confirm"]).kind).toBe("paused")
    })
})

describe("moving on the controls screen", () => {
    it("moves over every row, stopping at either end", () => {
        const screen = controls()
        expect(press(screen, ["up"])).toBe(screen)
        const down = Array<Action>(CONTROLS_ROWS.length).fill("down")
        const last = press(screen, down)
        expect(last).toMatchObject({ row: CONTROLS_ROWS.length - 1 })
    })

    it("switches between the players with left and right", () => {
        const screen = press(controls(), ["down", "down"])
        const p2 = press(screen, ["right"])
        expect(p2).toMatchObject({ player: 1, row: 2 })
        expect(press(p2, ["right"])).toBe(p2)
        expect(press(p2, ["left"])).toMatchObject({ player: 0, row: 2 })
        expect(press(screen, ["left"])).toBe(screen)
    })
})

describe("capturing", () => {
    const up = rowIndex("key", "up")
    const breath = rowIndex("key", "breath")
    const padBreath = rowIndex("pad", "breath")
    const padPause = rowIndex("pad", "pause")

    it("waits for a key on confirm", () => {
        const screen = press(on(breath), ["confirm"])
        expect(asControls(screen).capturing).toBe(true)
    })

    it("ignores every action press while it waits", () => {
        const screen = press(on(breath), ["confirm"])
        for (const action of [
            "confirm",
            "pause",
            "up",
            "down",
            "left",
            "right",
            "breath",
        ] as const) {
            expect(update(screen, input([action]), deps())).toBe(screen)
        }
    })

    it("binds the captured key and stops waiting", () => {
        const screen = press(on(breath), ["confirm"])
        const next = update(screen, input([], "KeyX"), deps())
        expect(asControls(next).capturing).toBe(false)
        expect(bindings(next).players[0].keys.breath).toBe("KeyX")
    })

    // The key captured may be a menu key too (here Space, confirm): its
    // press arrives on the same tick as the capture and must not act.
    it("doesn't let the captured press act on the menu", () => {
        const screen = press(on(up), ["confirm"])
        const next = update(screen, input(["confirm"], "Space"), deps())
        expect(next).toMatchObject({ kind: "controls", capturing: false })
        expect(update(next, input([]), deps())).toBe(next)
    })

    it("swaps with a key in use, across players too", () => {
        let screen = press(on(up), ["confirm"])
        screen = update(screen, input([], "Space"), deps())
        expect(bindings(screen).players[0].keys).toMatchObject({
            up: "Space",
            confirm: "ArrowUp",
        })
        screen = press({ ...asControls(screen), player: 1 }, ["confirm"])
        screen = update(screen, input([], "ArrowDown"), deps())
        expect(bindings(screen).players[1].keys.up).toBe("ArrowDown")
        expect(bindings(screen).players[0].keys.down).toBe("KeyW")
    })

    it("binds player 2's keys on player 2's page", () => {
        let screen = press(on(breath, 1), ["confirm"])
        screen = update(screen, input([], "KeyZ"), deps())
        expect(bindings(screen).players[1].keys.breath).toBe("KeyZ")
        expect(bindings(screen).players[0]).toBe(DEFAULT_BINDINGS.players[0])
    })

    it("binds pad buttons on pad rows, swapping with pause", () => {
        let screen = press(on(padBreath), ["confirm"])
        screen = update(screen, input([], 2), deps())
        expect(bindings(screen).players[0].pad).toEqual({
            breath: 2,
            confirm: PAD_A,
            pause: PAD_START,
        })
        screen = press(on(padPause), ["confirm"])
        screen = update(screen, input([], PAD_A), deps())
        expect(bindings(screen).players[0].pad).toEqual({
            breath: PAD_START,
            confirm: PAD_START,
            pause: PAD_A,
        })
    })

    it("keeps waiting for the other kind of control", () => {
        const keyRow = press(on(breath), ["confirm"])
        expect(update(keyRow, input([], 2), deps())).toBe(keyRow)
        const padRow = press(on(padBreath), ["confirm"])
        expect(update(padRow, input([], "KeyX"), deps())).toBe(padRow)
    })

    it("stops waiting on Escape with nothing changed", () => {
        const screen = press(on(breath), ["confirm"])
        const next = update(screen, input(["pause"], null), deps())
        expect(next).toMatchObject({ kind: "controls", capturing: false })
        expect(screenSettings(next)).toBe(screenSettings(screen))
    })

    it("changes nothing for an unbindable or unchanged capture", () => {
        const screen = press(on(breath), ["confirm"])
        const same = update(screen, input([], "ShiftRight"), deps())
        expect(asControls(same).capturing).toBe(false)
        expect(screenSettings(same)).toBe(screenSettings(screen))
    })
})

describe("reset and back", () => {
    const reset = rowIndex("reset")
    const back = rowIndex("back")

    it("resets both players to the defaults", () => {
        let screen = press(on(rowIndex("key", "up")), ["confirm"])
        screen = update(screen, input([], "KeyI"), deps())
        screen = { ...asControls(screen), row: reset }
        screen = press(screen, ["confirm"])
        expect(bindings(screen)).toBe(DEFAULT_BINDINGS)
        expect(asControls(screen).capturing).toBeFalsy()
    })

    it("changes nothing when already on the defaults", () => {
        const screen = on(reset)
        expect(press(screen, ["confirm"])).toBe(screen)
    })

    it.each([
        ["the Back row", "confirm", back],
        ["the pause action", "pause", 0],
    ] as const)("goes back with %s, cursor on Controls", (_, action, row) => {
        let screen = press(on(breath()), ["confirm"])
        screen = update(screen, input([], "KeyX"), deps())
        screen = { ...asControls(screen), row }
        const settings = press(screen, [action])
        expect(settings).toMatchObject({ kind: "settings", row: 4 })
        expect(screenSettings(settings)).toBe(screenSettings(screen))
        expect(
            bindingsOf(screenSettings(settings)!).players[0].keys.breath
        ).toBe("KeyX")
        // Back again to the title, still on Settings.
        expect(press(settings, ["pause"])).toMatchObject({
            kind: "title",
            onSettings: true,
        })
    })

    function breath() {
        return rowIndex("key", "breath")
    }
})
