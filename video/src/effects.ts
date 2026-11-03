import { BREATHS } from "../../src/breaths"
import { TICK_MS } from "../../src/constants"
import { effectsForEvents } from "../../src/eventEffects"
import type { GameState } from "../../src/game"
import { BURSTS, createParticles, type Particle } from "../../src/particles"
import { seededRandom } from "../../src/replay"
import { SHAKE_DECAY, createShake } from "../../src/shake"
import { vec2, type Vec2 } from "../../src/vec2"
import type { TickLog } from "./replayers"

// Particles and screen shake (see particles.ts, shake.ts, eventEffects.ts)
// as a pure function of game time, so any frame can be drawn on its own.
//
// The game runs one particle system and one shake through the whole run,
// fed each tick's events and moved on each tick, with Math.random. Here
// they are worked out afresh for every frame: from EFFECT_WINDOW ticks
// back, each tick's events go into a new particle system and shake with
// randomness seeded by the run's seed and the tick, and everything moves
// on as main moves it. Nothing from before the window is still alive by
// then (no burst lasts that long and full shake drains well within it), so
// it comes out the same whichever frame asks, and as main would show it
// apart from the random numbers. The shake's jolt is seeded by the tick
// too. As a default-settings player on a system without reduced motion
// sees them: full particles, and shake on.

const DT = TICK_MS / 1000

// How many ticks back to start from: longer than any particle lives
// (the longest look is checked in effects.test.ts) and than full shake
// takes to drain.
export const EFFECT_WINDOW = 120

// The longest a particle of any look can live, and full shake's time to
// drain, in seconds.
export function longestEffect(): number {
    const looks = [
        ...Object.values(BURSTS),
        ...Object.values(BREATHS).flatMap((b) =>
            b.particles ? [b.particles] : []
        ),
    ]
    return Math.max(1 / SHAKE_DECAY, ...looks.map((l) => l.life))
}

export type FrameEffects = {
    particles: readonly Particle[]
    shake: Vec2
}

// The particles and shake to draw at game time `tick` + `alpha` of a run
// whose ticks are `ticks` (see runOf in replayers.ts) and seed `seed`.
// `game` is the run's game (any tick's: only the players' breaths, which
// never change, are read, for the breath particles).
export function effectsAt(
    ticks: readonly Pick<TickLog, "events" | "moved">[],
    seed: number,
    game: GameState,
    tick: number,
    alpha: number
): FrameEffects {
    let random = seededRandom(0)
    const particles = createParticles({ random: () => random() })
    const shake = createShake()
    const end = Math.min(tick, ticks.length - 1)
    for (let k = Math.max(1, end - EFFECT_WINDOW + 1); k <= end; k++) {
        const { events, moved } = ticks[k]
        random = seededRandom(mix(seed, k))
        effectsForEvents(events, game, { particles, shake })
        if (moved) {
            particles.update(DT)
            shake.update(DT)
        }
    }
    // Part way to the next tick, if it moves the effects on, so slow
    // motion stays smooth.
    if (alpha > 0 && ticks[end + 1]?.moved) {
        particles.update(alpha * DT)
        shake.update(alpha * DT)
    }
    const jolt = seededRandom(mix(seed ^ 0x5eed, end))
    return {
        particles: particles.list,
        shake: shake.trauma > 0 ? shake.offset(jolt) : vec2(0, 0),
    }
}

// A seed for tick `k` of a run seeded `seed`.
function mix(seed: number, k: number): number {
    return (seed ^ Math.imul(k + 1, 0x9e3779b1)) | 0
}
