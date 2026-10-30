import { vec2, type Vec2 } from "./vec2"

// The jab look (KDA-258): for a moment after each punch, the player's
// sprite lunges a little along the way it punched, with a fist just ahead
// of it. Purely visual, like particles.ts: eventEffects.ts starts a jab on
// each punched event, main.ts moves them on with the game's ticks (so they
// freeze while paused) and render.ts draws them. Pure, no DOM. The numbers
// are placeholders to tune at preview.

// How long a jab shows, in seconds.
export const JAB_SECONDS = 0.15
// How far the sprite lunges at the jab's peak, in cells. With reduced
// motion it doesn't lunge: the fist alone shows the jab.
export const JAB_LUNGE = 0.15

// One player's jab: which player, the unit step it punched along, how long
// ago, in seconds, and how far it lunges at its peak, in cells.
export type Jab = { player: number; facing: Vec2; age: number; lunge: number }

export type Jabs = {
    // Start a jab for `player` along `facing`, replacing any it has.
    add(player: number, facing: Vec2): void
    // Age every jab by `dt` seconds, dropping those that are over.
    update(dt: number): void
    // Drop every jab, e.g. when a new game starts.
    clear(): void
    readonly list: readonly Jab[]
    // Reduced motion (prefers-reduced-motion): jabs started from now on
    // don't lunge.
    reduced: boolean
}

export function createJabs({ reduced = false } = {}): Jabs {
    let list: Jab[] = []
    return {
        reduced,
        add(player, facing) {
            const jab = {
                player,
                facing: vec2(facing.x, facing.y),
                age: 0,
                lunge: this.reduced ? 0 : JAB_LUNGE,
            }
            list = [...list.filter((j) => j.player !== player), jab]
        },
        update(dt) {
            list = list
                .map((j) => ({ ...j, age: j.age + dt }))
                .filter((j) => j.age < JAB_SECONDS)
        },
        clear() {
            list = []
        },
        get list() {
            return list
        },
    }
}

// How far a jab moves its player's sprite along its facing, in cells: out
// to its lunge halfway through and back, 0 once it is over.
export function jabLunge(jab: Jab): number {
    if (jab.age < 0 || jab.age >= JAB_SECONDS) return 0
    return jab.lunge * Math.sin((Math.PI * jab.age) / JAB_SECONDS)
}
