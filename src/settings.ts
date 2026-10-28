// Saved settings: volumes, mute, screen shake and the on-screen D-pad.
//
// Like progress.ts: there is no DOM access here, storage is passed in
// (window.localStorage in main), and every storage access is wrapped in
// try/catch, so missing, blocked or full storage never breaks the game. A
// save that can't be read, has another version or isn't an object gives the
// defaults; there are no migrations. Within a good save, each field is
// checked on its own: one that is missing or invalid falls back to its
// default, and the others are kept.
//
// Fields a save has besides these are kept too (untyped, as they come), so
// a save written by a later build loses nothing when this one saves it
// back; keep them by spreading when changing a setting. New settings
// (e.g. the key bindings of KDA-215) are added as optional fields without a
// version bump, as progress adds per-stage records.

// Versioned, so a future save shape can live beside this one under a new key.
export const SETTINGS_KEY = "dot-eater:settings:v1"
export const SETTINGS_VERSION = 1

// Volumes are whole steps from 0 (silent) to VOLUME_MAX.
export const VOLUME_MAX = 10

export type Settings = {
    version: typeof SETTINGS_VERSION
    // Music and sound effects volumes, 0 to VOLUME_MAX.
    musicVolume: number
    effectsVolume: number
    // Silences both, keeping the volumes.
    muted: boolean
    // Whether the screen shakes; null follows the system's reduced motion
    // setting (see shakeEnabled).
    screenShake: boolean | null
    // Whether touch play shows an on-screen D-pad (KDA-214).
    showDpad: boolean
}

// The part of the Web Storage API this module uses.
export type SettingsStorage = Pick<Storage, "getItem" | "setItem">

export function defaultSettings(): Settings {
    return {
        version: SETTINGS_VERSION,
        musicVolume: 7,
        effectsVolume: 8,
        muted: false,
        screenShake: null,
        showDpad: false,
    }
}

// Whether the screen shakes: as set, or when unset, unless the system asks
// for reduced motion (`prefersReducedMotion`, from main's media query).
export function shakeEnabled(
    settings: Settings,
    prefersReducedMotion: boolean
): boolean {
    return settings.screenShake ?? !prefersReducedMotion
}

// Read a saved string (see the top of this file for what counts).
export function parseSettings(raw: string | null): Settings {
    if (raw === null) return defaultSettings()
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        return defaultSettings()
    }
    if (!isRecord(data) || data.version !== SETTINGS_VERSION) {
        return defaultSettings()
    }
    const defaults = defaultSettings()
    const { musicVolume, effectsVolume, muted, screenShake, showDpad } = data
    return {
        ...data,
        version: SETTINGS_VERSION,
        musicVolume: isVolume(musicVolume) ? musicVolume : defaults.musicVolume,
        effectsVolume: isVolume(effectsVolume)
            ? effectsVolume
            : defaults.effectsVolume,
        muted: typeof muted === "boolean" ? muted : defaults.muted,
        screenShake:
            typeof screenShake === "boolean" || screenShake === null
                ? screenShake
                : defaults.screenShake,
        showDpad: typeof showDpad === "boolean" ? showDpad : defaults.showDpad,
    }
}

export function isVolume(value: unknown): value is number {
    return (
        Number.isInteger(value) &&
        (value as number) >= 0 &&
        (value as number) <= VOLUME_MAX
    )
}

export function serializeSettings(settings: Settings): string {
    return JSON.stringify(settings)
}

// Load settings from storage; the defaults when there is no storage, it
// throws, or what it holds can't be used.
export function loadSettings(storage: SettingsStorage | undefined): Settings {
    try {
        return parseSettings(storage?.getItem(SETTINGS_KEY) ?? null)
    } catch {
        return defaultSettings()
    }
}

// Save settings; returns whether they were written. Failure is silent: the
// game goes on with the settings kept in memory for this session.
export function saveSettings(
    storage: SettingsStorage | undefined,
    settings: Settings
): boolean {
    if (!storage) return false
    try {
        storage.setItem(SETTINGS_KEY, serializeSettings(settings))
        return true
    } catch {
        return false
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}
