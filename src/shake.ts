import { vec2, type Vec2 } from "./vec2"

// Screen shake (KDA-213): a short jolt of the maze on hits and lost lives.
// Purely visual. Pure, no DOM: time comes in as `dt` and randomness is
// injected; render.ts moves the maze (not the HUD) by `offset`.
//
// It works on "trauma", from 0 to 1: a hit adds some, it drains at
// SHAKE_DECAY per second, and the maze is thrown about by up to MAX_SHAKE
// times trauma squared, so small hits barely move it and big ones do, and
// the shake eases out instead of stopping dead.

// How far the maze moves at full trauma, in cells either way on each axis
// (cells, so the shake looks the same on any screen size).
export const MAX_SHAKE = 0.25
// Trauma lost per second: full trauma is gone in 1 / SHAKE_DECAY seconds.
export const SHAKE_DECAY = 2.5

// Suggested trauma for each kind of hit (see Shake.add).
export const SHAKES = {
    // A breath defeating an enemy, or hitting the boss.
    hit: 0.35,
    // A player caught: a life lost, or taken out.
    caught: 0.7,
    // The boss going down.
    bossDefeat: 0.8,
} as const

export type ShakeOptions = {
    // Off: add does nothing and the offset is always zero. Defaults to on.
    enabled?: boolean
    // Default MAX_SHAKE and SHAKE_DECAY.
    max?: number
    decay?: number
}

export type Shake = {
    // Add `amount` of trauma (capped at 1 in all). Ignored while disabled.
    add(amount: number): void
    // Drain trauma for `dt` seconds.
    update(dt: number): void
    // Where to draw the maze from this frame, in cells: a random point in a
    // square of half-side MAX_SHAKE * trauma². `random` returns a number in
    // [0, 1), e.g. Math.random. Zero with no trauma or while disabled.
    offset(random: () => number): Vec2
    // Drop all trauma, e.g. when a new game starts.
    clear(): void
    readonly trauma: number
    // Turning it off drops any trauma, so a shake under way stops at once.
    enabled: boolean
}

export function createShake(options: ShakeOptions = {}): Shake {
    const max = options.max ?? MAX_SHAKE
    const decay = options.decay ?? SHAKE_DECAY
    let enabled = options.enabled ?? true
    let trauma = 0
    return {
        add(amount) {
            if (!enabled || !(amount > 0)) return
            trauma = Math.min(1, trauma + amount)
        },
        update(dt) {
            trauma = Math.max(0, trauma - decay * dt)
        },
        offset(random) {
            if (!enabled || trauma <= 0) return vec2(0, 0)
            const reach = max * trauma * trauma
            return vec2((random() * 2 - 1) * reach, (random() * 2 - 1) * reach)
        },
        clear() {
            trauma = 0
        },
        get trauma() {
            return trauma
        },
        get enabled() {
            return enabled
        },
        set enabled(value: boolean) {
            enabled = value
            if (!value) trauma = 0
        },
    }
}
