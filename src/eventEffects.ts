import { BOSS_BREATH } from "./bossBreath"
import { ENEMY_BREATH } from "./enemyBreath"
import type { GameEvent } from "./events"
import type { GameState } from "./game"
import type { Jabs } from "./jab"
import type { Particles } from "./particles"
import { shakeEnabled, type Settings } from "./settings"
import { SHAKES, type Shake } from "./shake"
import type { Shields } from "./shield"
import { vec2, type Vec2 } from "./vec2"

// Particles and screen shake for what happened in a tick (KDA-213): which
// burst and how much shake each game event (events.ts) gets. Pure apart
// from the particle system and shake it is handed; main.ts calls it with
// each tick's events. Visual only: the game never reads any of it.

// What the effects go to: the particle system, the shake, the players' jab
// looks and the enemies' block looks (or test doubles of them). Without
// `jabs`, punches show none; without `shields`, blocks show none.
export type EffectTargets = {
    particles: Pick<Particles, "burst" | "emit">
    shake: Pick<Shake, "add">
    jabs?: Pick<Jabs, "add">
    shields?: Pick<Shields, "add">
}

// The effects of every event of a tick, in order. `state` is the game
// after the tick (a breath's cells are worked out on it). A punch shakes
// once however many things it hits (a player punches once a tick at most),
// with a burst on each; a block (KDA-288) only shows its shield.
export function effectsForEvents(
    events: readonly GameEvent[],
    state: GameState,
    targets: EffectTargets
) {
    const landed = new Set<number>()
    for (const event of events) {
        if (event.type === "punchHit") {
            const first = !landed.has(event.player)
            landed.add(event.player)
            if (!first) {
                effectsForEvent(event, state, { ...targets, shake: NO_SHAKE })
                continue
            }
        }
        effectsForEvent(event, state, targets)
    }
}

// A shake that does nothing, for the hits after a punch's first.
const NO_SHAKE: EffectTargets["shake"] = { add() {} }

export function effectsForEvent(
    event: GameEvent,
    state: GameState,
    { particles, shake, jabs, shields }: EffectTargets
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
        case "punched":
            jabs?.add(event.player, event.facing)
            return
        case "punchHit":
            particles.burst("punch", event.at)
            shake.add(SHAKES.punch)
            return
        case "punchBlocked":
            // A 🛡 over the enemy, and no burst or shake: nothing landed.
            shields?.add(event.enemy)
            return
        case "playerRespawned":
        case "gameWon":
        case "gameLost":
            return
    }
}

// How much the effects move, from the system's reduced motion setting and
// the player's Screen shake setting: reduced motion makes particles fewer
// and shorter, stops jabs lunging (the fist still shows), and turns the
// shake off unless the setting turns it on; the
// setting, when set, decides the shake either way (see shakeEnabled).
export function applyMotion(
    targets: {
        particles: Pick<Particles, "reduced">
        shake: Pick<Shake, "enabled">
        jabs?: Pick<Jabs, "reduced">
    },
    settings: Settings,
    prefersReducedMotion: boolean
) {
    targets.particles.reduced = prefersReducedMotion
    if (targets.jabs) targets.jabs.reduced = prefersReducedMotion
    targets.shake.enabled = shakeEnabled(settings, prefersReducedMotion)
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
