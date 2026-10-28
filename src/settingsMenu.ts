import { shakeEnabled, VOLUME_MAX, type Settings } from "./settings"

// The settings screen's rows (see the settings screen in flow.ts). Pure, no
// DOM. Each row is data: a label, a kind and how it reads and changes the
// settings, so adding a setting is adding a row to SETTINGS_ROWS:
//
// - slider: a whole number from 0 to VOLUME_MAX; left/right step it,
//   stopping at either end.
// - toggle: on or off; left/right or confirm flip it.
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
    // Whether the system asks for reduced motion (see shakeEnabled).
    prefersReducedMotion: boolean
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
    get(settings: Settings, context: SettingsContext): boolean
    set(settings: Settings, value: boolean): Settings
}

export type ActionRow = RowBase & { kind: "action"; action: SettingsAction }

export type SettingsRow = SliderRow | ToggleRow | ActionRow

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
        // Shows the shake in effect, so while it is unset it reads as the
        // system's reduced motion setting implies; changing it sets it.
        id: "screenShake",
        label: "Screen shake",
        kind: "toggle",
        get: (s, context) => shakeEnabled(s, context.prefersReducedMotion),
        set: (s, screenShake) => ({ ...s, screenShake }),
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
// at 0 and VOLUME_MAX), a toggle flipped whichever way. The same object
// when nothing changes (an action, or a slider at its end), so callers can
// skip the save.
export function changeRow(
    row: SettingsRow,
    settings: Settings,
    context: SettingsContext,
    delta: -1 | 1
): Settings {
    switch (row.kind) {
        case "slider": {
            const now = row.get(settings)
            const next = Math.min(Math.max(now + delta, 0), VOLUME_MAX)
            return next === now ? settings : row.set(settings, next)
        }
        case "toggle":
            return row.set(settings, !row.get(settings, context))
        case "action":
            return settings
    }
}

// What a row shows after its label: a slider's value with arrows to change
// it ("◀ 7 ▶"), a toggle's "On" or "Off"; nothing for an action.
export function rowValue(
    row: SettingsRow,
    settings: Settings,
    context: SettingsContext
): string | undefined {
    switch (row.kind) {
        case "slider":
            return `◀ ${row.get(settings)} ▶`
        case "toggle":
            return row.get(settings, context) ? "On" : "Off"
        case "action":
            return undefined
    }
}
