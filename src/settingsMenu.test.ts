import { describe, expect, it } from "vite-plus/test"
import { defaultSettings, VOLUME_MAX } from "./settings"
import {
    changeRow,
    rowValue,
    SETTINGS_ROWS,
    settingsRows,
    titleOnly,
    touchOnly,
    type SettingsContext,
    type SettingsRow,
} from "./settingsMenu"

const context = (over: Partial<SettingsContext> = {}): SettingsContext => ({
    from: "title",
    touch: false,
    prefersReducedMotion: false,
    ...over,
})

const row = (id: string) => {
    const found = SETTINGS_ROWS.find((r) => r.id === id)
    if (!found) throw new Error(`No row ${id}`)
    return found
}

describe("SETTINGS_ROWS", () => {
    it("lists the agreed rows, then Back", () => {
        expect(SETTINGS_ROWS.map((r) => [r.label, r.kind])).toEqual([
            ["Music volume", "slider"],
            ["Effects volume", "slider"],
            ["Mute", "toggle"],
            ["Screen shake", "toggle"],
            ["Show D-pad", "toggle"],
            ["Back", "action"],
        ])
    })

    it("has unique ids", () => {
        const ids = SETTINGS_ROWS.map((r) => r.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})

describe("settingsRows", () => {
    // A title-only row, as KDA-215 adds; Show D-pad is the touch-only one.
    const rows: SettingsRow[] = [
        ...SETTINGS_ROWS,
        {
            id: "controls",
            label: "Controls",
            kind: "action",
            action: "back",
            show: titleOnly,
        },
    ]
    const ids = (c: SettingsContext) => settingsRows(c, rows).map((r) => r.id)

    it("shows every row on a touch device, and all but Show D-pad elsewhere", () => {
        expect(settingsRows(context({ touch: true }))).toEqual(SETTINGS_ROWS)
        expect(settingsRows(context())).toEqual(
            SETTINGS_ROWS.filter((r) => r.id !== "showDpad")
        )
    })

    it("shows a title-only row from the title only", () => {
        expect(ids(context())).toContain("controls")
        expect(ids(context({ from: "pause" }))).not.toContain("controls")
    })

    it("shows a touch-only row on touch devices only", () => {
        expect(ids(context())).not.toContain("showDpad")
        expect(ids(context({ touch: true }))).toContain("showDpad")
        expect(row("showDpad").show).toBe(touchOnly)
    })

    it("flips Show D-pad, which is off by default", () => {
        const dpad = row("showDpad")
        const s = defaultSettings()
        const touch = context({ touch: true })
        expect(rowValue(dpad, s, touch)).toBe("Off")
        const on = changeRow(dpad, s, touch, 1)
        expect(on.showDpad).toBe(true)
        expect(rowValue(dpad, on, touch)).toBe("On")
        expect(changeRow(dpad, on, touch, -1).showDpad).toBe(false)
    })
})

describe("changeRow", () => {
    it("steps a slider, stopping at 0 and VOLUME_MAX", () => {
        const music = row("musicVolume")
        const s = defaultSettings()
        expect(changeRow(music, s, context(), 1).musicVolume).toBe(8)
        expect(changeRow(music, s, context(), -1).musicVolume).toBe(6)
        const top = { ...s, musicVolume: VOLUME_MAX }
        expect(changeRow(music, top, context(), 1)).toBe(top)
        const bottom = { ...s, musicVolume: 0 }
        expect(changeRow(music, bottom, context(), -1)).toBe(bottom)
    })

    it("flips a toggle either way", () => {
        const s = defaultSettings()
        expect(changeRow(row("muted"), s, context(), 1).muted).toBe(true)
        expect(changeRow(row("muted"), s, context(), -1).muted).toBe(true)
    })

    it("sets screen shake opposite to what is in effect", () => {
        const shake = row("screenShake")
        const s = defaultSettings()
        expect(changeRow(shake, s, context(), 1).screenShake).toBe(false)
        const reduced = context({ prefersReducedMotion: true })
        expect(changeRow(shake, s, reduced, 1).screenShake).toBe(true)
    })

    it("leaves the settings alone for an action", () => {
        const s = defaultSettings()
        expect(changeRow(row("back"), s, context(), 1)).toBe(s)
    })

    it("keeps fields it doesn't know", () => {
        const s = { ...defaultSettings(), bindings: { up: "KeyI" } }
        expect(changeRow(row("muted"), s, context(), 1)).toMatchObject({
            bindings: { up: "KeyI" },
        })
    })
})

describe("rowValue", () => {
    it("shows a slider's value, a toggle's state and nothing for an action", () => {
        const s = { ...defaultSettings(), muted: true }
        expect(rowValue(row("musicVolume"), s, context())).toBe("◀ 7 ▶")
        expect(rowValue(row("muted"), s, context())).toBe("On")
        expect(rowValue(row("screenShake"), s, context())).toBe("On")
        expect(
            rowValue(
                row("screenShake"),
                s,
                context({ prefersReducedMotion: true })
            )
        ).toBe("Off")
        expect(rowValue(row("back"), s, context())).toBeUndefined()
    })
})
