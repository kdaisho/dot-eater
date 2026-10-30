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
            ["Screen shake", "choice"],
            ["Facing guide", "choice"],
            ["Players", "choice"],
            ["Show D-pad", "toggle"],
            ["Controls", "action"],
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
        expect(rowValue(dpad, s)).toBe("Off")
        const on = changeRow(dpad, s, 1)
        expect(on.showDpad).toBe(true)
        expect(rowValue(dpad, on)).toBe("On")
        expect(changeRow(dpad, on, -1).showDpad).toBe(false)
    })
})

describe("changeRow", () => {
    it("steps a slider, stopping at 0 and VOLUME_MAX", () => {
        const music = row("musicVolume")
        const s = defaultSettings()
        expect(changeRow(music, s, 1).musicVolume).toBe(8)
        expect(changeRow(music, s, -1).musicVolume).toBe(6)
        const top = { ...s, musicVolume: VOLUME_MAX }
        expect(changeRow(music, top, 1)).toBe(top)
        const bottom = { ...s, musicVolume: 0 }
        expect(changeRow(music, bottom, -1)).toBe(bottom)
    })

    it("flips a toggle either way", () => {
        const s = defaultSettings()
        expect(changeRow(row("muted"), s, 1).muted).toBe(true)
        expect(changeRow(row("muted"), s, -1).muted).toBe(true)
    })

    it("steps screen shake through Auto, On and Off, wrapping round", () => {
        const shake = row("screenShake")
        const auto = defaultSettings()
        expect(auto.screenShake).toBeNull()
        const on = changeRow(shake, auto, 1)
        expect(on.screenShake).toBe(true)
        const off = changeRow(shake, on, 1)
        expect(off.screenShake).toBe(false)
        expect(changeRow(shake, off, 1).screenShake).toBeNull()
        expect(changeRow(shake, auto, -1).screenShake).toBe(false)
    })

    it("cycles a choice either way, wrapping round", () => {
        const guide = row("facingGuide")
        const s = defaultSettings()
        expect(s.facingGuide).toBe("arrow")
        const aim = changeRow(guide, s, 1)
        expect(aim.facingGuide).toBe("aim")
        expect(changeRow(guide, aim, 1).facingGuide).toBe("arrow")
        expect(changeRow(guide, s, -1).facingGuide).toBe("aim")
        expect(changeRow(guide, aim, -1).facingGuide).toBe("arrow")
    })

    it("shows the Facing guide from the title and from pause", () => {
        for (const from of ["title", "pause"] as const) {
            expect(settingsRows(context({ from })).map((r) => r.id)).toContain(
                "facingGuide"
            )
        }
    })

    it("switches Players between pass through (default) and bump", () => {
        const players = row("playersBump")
        const s = defaultSettings()
        expect(rowValue(players, s)).toBe("◀ Pass through ▶")
        const bump = changeRow(players, s, 1)
        expect(bump.playersBump).toBe(true)
        expect(rowValue(players, bump)).toBe("◀ Bump ▶")
        expect(changeRow(players, s, -1).playersBump).toBe(true)
        expect(changeRow(players, bump, 1).playersBump).toBe(false)
        expect(changeRow(players, bump, -1).playersBump).toBe(false)
    })

    it("shows Players from the title and from pause", () => {
        for (const from of ["title", "pause"] as const) {
            for (const touch of [false, true]) {
                const ids = settingsRows(context({ from, touch })).map(
                    (r) => r.id
                )
                expect(ids).toContain("playersBump")
            }
        }
    })

    it("leaves the settings alone for an action", () => {
        const s = defaultSettings()
        expect(changeRow(row("back"), s, 1)).toBe(s)
    })

    it("keeps fields it doesn't know", () => {
        const s = { ...defaultSettings(), later: { up: "KeyI" } }
        expect(changeRow(row("muted"), s, 1)).toMatchObject({
            later: { up: "KeyI" },
        })
    })
})

describe("rowValue", () => {
    it("shows a slider's value, a toggle's state and nothing for an action", () => {
        const s = { ...defaultSettings(), muted: true }
        expect(rowValue(row("musicVolume"), s)).toBe("◀ 7 ▶")
        expect(rowValue(row("muted"), s)).toBe("On")
        expect(rowValue(row("screenShake"), s)).toBe("◀ Auto ▶")
        expect(rowValue(row("screenShake"), { ...s, screenShake: true })).toBe(
            "◀ On ▶"
        )
        expect(rowValue(row("screenShake"), { ...s, screenShake: false })).toBe(
            "◀ Off ▶"
        )
        expect(rowValue(row("back"), s)).toBeUndefined()
        expect(rowValue(row("facingGuide"), s)).toBe("◀ Arrow ▶")
        expect(rowValue(row("facingGuide"), { ...s, facingGuide: "aim" })).toBe(
            "◀ Aim ▶"
        )
    })
})
