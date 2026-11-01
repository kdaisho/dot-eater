// The opening before the title: the studio logo, waiting for a press (which
// is also the gesture that lets the browser play sound), then held alone,
// then the Dot Eater logo rising to the opening track with the final boss
// behind it. On the drum hit the boss's eyes flare and the menu (Start,
// Continue) appears; the boss's minions then dash across every few
// seconds, and the R's corner shines once they're gone. Timing and layout
// here; flow.ts runs the screen and openingView.ts draws it. No DOM access.

// The screen is drawn at the console's size and scaled up.
export const OPENING_WIDTH = 256
export const OPENING_HEIGHT = 224

// Seconds into the opening track where the drums come in (measured on the
// track): the logo stops rising, the menu appears and the boss's eyes
// flare.
export const OPENING_DRUM = 7.53
// When the logo starts rising, in seconds into the track.
export const RISE_FROM = 0.4
// How long the studio logo holds after the press, then a moment of black
// before the title.
export const LOGO_HOLD = 2.2
export const LOGO_SECONDS = LOGO_HOLD + 0.5

// The menu on the title, in order. Start goes to the title menu (the mode
// select); Continue picks a story run up where it was left.
export const OPENING_CHOICES = ["start", "continue"] as const
export type OpeningChoice = (typeof OPENING_CHOICES)[number]

// Where the logo's top rests once risen, and where it starts: low enough
// that the boss above it (BOSS_ABOVE) starts out of sight too.
export const LOGO_TOP = 60
export const BOSS_ABOVE = 44
const START_TOP = OPENING_HEIGHT + BOSS_ABOVE + 8

// The logo's top `seconds` into the track: below the screen, rising at an
// even pace from RISE_FROM, at rest from the drum on.
export function logoTop(seconds: number): number {
    const share = (seconds - RISE_FROM) / (OPENING_DRUM - RISE_FROM)
    const p = Math.min(1, Math.max(0, share))
    return Math.round(START_TOP + (LOGO_TOP - START_TOP) * p)
}

// The minions' pack: it first runs PACK_DELAY seconds after the drum, then
// every PACK_LAP seconds, right to left at PACK_SPEED pixels a second.
export const PACK_DELAY = 0.9
export const PACK_LAP = 7
export const PACK_SPEED = 120
// Each runner's lag behind the first (pixels) and its height offset.
export const PACK: readonly (readonly [lag: number, dy: number])[] = [
    [0, 0],
    [26, 6],
    [50, -4],
    [78, 4],
    [100, -2],
]
// How wide a runner is drawn, in pixels.
export const RUNNER_WIDTH = 16

// Seconds into the pack's current run, or undefined before its first.
export function packLap(seconds: number): number | undefined {
    const since = seconds - OPENING_DRUM - PACK_DELAY
    return since < 0 ? undefined : since % PACK_LAP
}

// A runner's left edge `lap` seconds into a run: it starts just off the
// right edge.
export function runnerX(lag: number, lap: number): number {
    return OPENING_WIDTH + 10 + lag - lap * PACK_SPEED
}

// Seconds into a run when its last runner has left the screen: the R's
// corner shines then.
export const PACK_GONE =
    (OPENING_WIDTH + 10 + PACK[PACK.length - 1]![0] + RUNNER_WIDTH) / PACK_SPEED
export const SHINE_SECONDS = 0.6

// How far through the R's shine `seconds` into the track is, 0–1, or
// undefined while it isn't shining.
export function shine(seconds: number): number | undefined {
    const lap = packLap(seconds)
    if (lap === undefined) return undefined
    const since = lap - PACK_GONE
    return since >= 0 && since <= SHINE_SECONDS
        ? since / SHINE_SECONDS
        : undefined
}
