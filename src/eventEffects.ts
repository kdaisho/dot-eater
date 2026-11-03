import { BOSS_BREATH } from "./bossBreath"
import { ENEMY_BREATH } from "./enemyBreath"
import type { GameEvent } from "./events"
import type { GameState } from "./game"
import type { Particles } from "./particles"
import { shakeEnabled, type Settings } from "./settings"
import { SHAKES, type Shake } from "./shake"
import { loopPos } from "./level"
import { samePos, vec2, type Vec2 } from "./vec2"

// Particles and screen shake for what happened in a tick (KDA-213): which
// burst and how much shake each game event (events.ts) gets. Pure apart
// from the particle system and shake it is handed; main.ts calls it with
// each tick's events. Visual only: the game never reads any of it.

// What the effects go to: the particle system and the shake (or test
// doubles of them).
export type EffectTargets = {
    particles: Pick<Particles, "burst" | "emit">
    shake: Pick<Shake, "add">
}

// The effects of every event of a tick, in order. `state` is the game
// after the tick (a breath's cells are worked out on it).
export function effectsForEvents(
    events: readonly GameEvent[],
    state: GameState,
    targets: EffectTargets
) {
    for (const event of events) effectsForEvent(event, state, targets)
}

export function effectsForEvent(
    event: GameEvent,
    state: GameState,
    { particles, shake }: EffectTargets
) {
    switch (event.type) {
        case "dotEaten":
            particles.burst("dot", event.at)
            return
        case "dotRegrown":
            particles.burst("regrow", event.at)
            return
        case "dotDropped":
            particles.burst("drop", event.at)
            return
        case "breathed":
            breathParticles(event, state, particles)
            return
        case "enemyDefeated":
            particles.burst("defeat", event.at)
            shake.add(SHAKES.hit)
            return
        case "rammed":
            particles.burst("ram", event.at, { direction: event.facing })
            shake.add(SHAKES.ram)
            return
        case "knockedFlying":
            // A dust trail on every cell from where it was rammed up to
            // where it slammed (whose defeat poof is its own event's).
            for (const cell of flightCells(
                event.from,
                event.to,
                event.facing,
                state
            )) {
                particles.burst("flight", cell, { direction: event.facing })
            }
            return
        case "bossHit":
            particles.burst("bossHit", bossCentre(event.at))
            shake.add(SHAKES.hit)
            return
        case "bossDefeated":
            particles.burst("bossDefeat", bossCentre(event.at))
            shake.add(SHAKES.bossDefeat)
            return
        case "bossBreathed":
            // Its look (BOSS_BREATH.particles) on every cell it struck,
            // flying along its facing, as a player breath's.
            for (const cell of event.cells) {
                particles.emit(BOSS_BREATH.particles, cell, {
                    direction: event.facing,
                })
            }
            shake.add(SHAKES.bossBreath)
            return
        case "bossWindUp":
            // Its glow and the warning tint are drawn from the boss's state
            // (see bossLooks and bossWarning); its sound is the warning.
            return
        case "enemyBreathed":
            // A breather's breath (KDA-291): its look on every cell it
            // struck, as the boss's, with a smaller shake.
            for (const cell of event.cells) {
                particles.emit(ENEMY_BREATH.particles, cell, {
                    direction: event.facing,
                })
            }
            shake.add(SHAKES.enemyBreath)
            return
        case "enemyWindUp":
            // Drawn from its state (see enemyBreathLooks and
            // enemyWarnings); its sound is the warning.
            return
        case "hurt":
            particles.burst("hurt", event.at)
            shake.add(SHAKES.hurt)
            return
        case "playerCaught":
            particles.burst("caught", event.at)
            shake.add(SHAKES.caught)
            return
        case "playerStunned":
            shake.add(SHAKES.stun)
            return
        case "playerRespawned":
        case "gameWon":
        case "gameLost":
            return
    }
}

// How much the effects move, from the system's reduced motion setting and
// the player's Screen shake setting: reduced motion makes particles fewer
// and shorter, and turns the shake off unless the setting turns it on; the
// setting, when set, decides the shake either way (see shakeEnabled).
export function applyMotion(
    targets: {
        particles: Pick<Particles, "reduced">
        shake: Pick<Shake, "enabled">
    },
    settings: Settings,
    prefersReducedMotion: boolean
) {
    targets.particles.reduced = prefersReducedMotion
    targets.shake.enabled = shakeEnabled(settings, prefersReducedMotion)
}

// The cells from `from` along `facing` up to `to`, `from` included and
// `to` not (it gets the defeat's poof), the short way round through
// tunnels.
function flightCells(
    from: Vec2,
    to: Vec2,
    facing: Vec2,
    state: GameState
): Vec2[] {
    const { cells } = state
    const passed: Vec2[] = []
    let p = from
    // A flight is never longer than the map is wide and tall.
    const most = cells.length + cells[0].length
    while (!samePos(p, to) && passed.length < most) {
        passed.push(p)
        p = loopPos(cells, vec2(p.x + facing.x, p.y + facing.y))
    }
    return passed
}

// The middle of the boss's 2x2 footprint, from its top-left cell, in cell
// units (where a cell's centre is its whole-number position).
function bossCentre(at: Vec2): Vec2 {
    return vec2(at.x + 0.5, at.y + 0.5)
}

// A breath's particles (BreathDef.particles, if any) on every cell it
// covered as it was breathed (the event's cells: the Boar's rubble flies
// from the wall it opened), flying along the facing. Taken from the event,
// not worked out again after the tick, when the boss or the walls may
// have changed.
function breathParticles(
    event: Extract<GameEvent, { type: "breathed" }>,
    state: GameState,
    particles: EffectTargets["particles"]
) {
    const look = state.players[event.player]?.breather.breath.particles
    if (!look) return
    for (const cell of event.cells) {
        particles.emit(look, cell, { direction: event.facing })
    }
}
