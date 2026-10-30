import {
    FACING_GUIDES,
    isFacingGuide,
    VOLUME_MAX,
    type Settings,
} from "./settings"

// The settings screen's rows (see the settings screen in flow.ts). Pure, no
// DOM. Each row is data: a label, a kind and how it reads and changes the
// settings, so adding a setting is adding a row to SETTINGS_ROWS:
//
// - slider: a whole number from 0 to VOLUME_MAX; left/right step it,
//   stopping at either end.
// - toggle: on or off; left/right or confirm flip it.
// - choice: one of a few named options; left/right step through them,
//   wrapping round at either end, and confirm steps forward.
// - action: does something on confirm (see SettingsAction, which flow.ts
//   carries out).
//
// A row may show only where it makes sense (`show`, see titleOnly and
// touchOnly); hidden rows are left out of the list altogether.

// Where the settings screen was opened from.
export type SettingsFrom = "title" | "pause"

// What a row may depend on, besides the settings.
export type SettingsContext = {
    from: SettingsFrom
    // Whether the device has a touch screen (main decides).
    touch: boolean
}

// What an action row does on confirm; flow.ts carries it out. "back"
// leaves the screen, as the pause action does; "controls" opens the
// controls screen (remapping, KDA-215).
export type SettingsAction = "back" | "controls"

type RowBase = {
    // Identifies the row (not shown).
    id: string
    label: string
    // Whether the row shows; always when left out.
    show?: (context: SettingsContext) => boolean
}

export type SliderRow = RowBase & {
    kind: "slider"
    get(settings: Settings): number
    // `value` is already within 0 to VOLUME_MAX.
    set(settings: Settings, value: number): Settings
}

export type ToggleRow = RowBase & {
    kind: "toggle"
    get(settings: Settings): boolean
    set(settings: Settings, value: boolean): Settings
}

export type ChoiceRow = RowBase & {
    kind: "choice"
    // The options in order: each one's value and how it reads.
    options: readonly { value: string; label: string }[]
    get(settings: Settings): string
    // `value` is one of the options' values.
    set(settings: Settings, value: string): Settings
}

export type ActionRow = RowBase & { kind: "action"; action: SettingsAction }

export type SettingsRow = SliderRow | ToggleRow | ChoiceRow | ActionRow

// The Screen shake row's options and the setting each one stores.
const SHAKE_OPTIONS = [
    { value: "auto", label: "Auto", setting: null },
    { value: "on", label: "On", setting: true },
    { value: "off", label: "Off", setting: false },
] as const

// How each facing guide reads on its row.
const FACING_GUIDE_LABELS = { arrow: "Arrow", aim: "Aim" } as const

// The Players row's options: settings.playersBump off or on.
const PLAYERS_BUMP_OPTIONS = [
    { value: "pass", label: "Pass through" },
    { value: "bump", label: "Bump" },
] as const

// Shows a row only on the settings opened from the title (e.g. remapping,
// which a game in progress shouldn't change under the players).
export const titleOnly = (context: SettingsContext) => context.from === "title"

// Shows a row only on a touch device (e.g. the on-screen D-pad).
export const touchOnly = (context: SettingsContext) => context.touch

// Every row, in screen order.
export const SETTINGS_ROWS: readonly SettingsRow[] = [
    {
        id: "musicVolume",
        label: "Music volume",
        kind: "slider",
        get: (s) => s.musicVolume,
        set: (s, musicVolume) => ({ ...s, musicVolume }),
    },
    {
        id: "effectsVolume",
        label: "Effects volume",
        kind: "slider",
        get: (s) => s.effectsVolume,
        set: (s, effectsVolume) => ({ ...s, effectsVolume }),
    },
    {
        id: "muted",
        label: "Mute",
        kind: "toggle",
        get: (s) => s.muted,
        set: (s, muted) => ({ ...s, muted }),
    },
    {
        // Auto (unset) follows the system's reduced motion setting (see
        // shakeEnabled); On and Off override it (KDA-251).
        id: "screenShake",
        label: "Screen shake",
        kind: "choice",
        options: SHAKE_OPTIONS.map(({ value, label }) => ({ value, label })),
        get: (s) =>
            SHAKE_OPTIONS.find((o) => o.setting === s.screenShake)!.value,
        set: (s, value) => {
            const option = SHAKE_OPTIONS.find((o) => o.value === value)
            return option ? { ...s, screenShake: option.setting } : s
        },
    },
    {
        // How the board shows which way each player faces (KDA-247).
        id: "facingGuide",
        label: "Facing guide",
        kind: "choice",
        options: FACING_GUIDES.map((value) => ({
            value,
            label: FACING_GUIDE_LABELS[value],
        })),
        get: (s) => s.facingGuide,
        set: (s, facingGuide) =>
            isFacingGuide(facingGuide) ? { ...s, facingGuide } : s,
    },
    {
        // Whether players bump into each other in a 2-player game (KDA-262).
        id: "playersBump",
        label: "Players",
        kind: "choice",
        options: PLAYERS_BUMP_OPTIONS,
        get: (s) => (s.playersBump ? "bump" : "pass"),
        set: (s, value) => ({ ...s, playersBump: value === "bump" }),
    },
    {
        // The on-screen D-pad and breath button (dpad.ts), for touch play.
        id: "showDpad",
        label: "Show D-pad",
        kind: "toggle",
        get: (s) => s.showDpad,
        set: (s, showDpad) => ({ ...s, showDpad }),
        show: touchOnly,
    },
    {
        id: "controls",
        label: "Controls",
        kind: "action",
        action: "controls",
        show: titleOnly,
    },
    { id: "back", label: "Back", kind: "action", action: "back" },
]

// The rows that show in `context`, in screen order.
export function settingsRows(
    context: SettingsContext,
    rows: readonly SettingsRow[] = SETTINGS_ROWS
): SettingsRow[] {
    return rows.filter((row) => row.show?.(context) ?? true)
}

// `settings` with `row` changed by one step: a slider by `delta` (stopping
// at 0 and VOLUME_MAX), a toggle flipped whichever way, a choice to the
// next option along `delta` (wrapping round). The same object
// when nothing changes (an action, or a slider at its end), so callers can
// skip the save.
export function changeRow(
    row: SettingsRow,
    settings: Settings,
    delta: -1 | 1
): Settings {
    switch (row.kind) {
        case "slider": {
            const now = row.get(settings)
            const next = Math.min(Math.max(now + delta, 0), VOLUME_MAX)
            return next === now ? settings : row.set(settings, next)
        }
        case "toggle":
            return row.set(settings, !row.get(settings))
        case "choice": {
            const n = row.options.length
            if (n < 2) return settings
            const now = row.options.findIndex(
                (o) => o.value === row.get(settings)
            )
            const next = (Math.max(now, 0) + delta + n) % n
            return row.set(settings, row.options[next].value)
        }
        case "action":
            return settings
    }
}

// What a row shows after its label: a slider's value or a choice's option
// with arrows to change it ("◀ 7 ▶", "◀ Arrow ▶"), a toggle's "On" or
// "Off"; nothing for an action.
export function rowValue(
    row: SettingsRow,
    settings: Settings
): string | undefined {
    switch (row.kind) {
        case "slider":
            return `◀ ${row.get(settings)} ▶`
        case "toggle":
            return row.get(settings) ? "On" : "Off"
        case "choice": {
            const value = row.get(settings)
            const option = row.options.find((o) => o.value === value)
            return `◀ ${option?.label ?? value} ▶`
        }
        case "action":
            return undefined
    }
}
