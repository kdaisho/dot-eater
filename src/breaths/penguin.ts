import type { BreathDef, EnemyStatus, TileEffect } from "../breath"
import { AnimalId } from "../roster"

// Penguin 🐧, ice breath (KDA-217): a cone that freezes enemies for 3 s and
// turns the floor to ice for 5 s. Stat: slides 1.5x faster on ice.

// Seconds the floor stays ice.
export const ICE_SECONDS = 5

// A frozen enemy is an ice block: it doesn't move or catch, and the player
// can't walk through it (a slide into it stops next to it). When the freeze
// ends it moves by the usual rules, so one left standing on ice slides on
// the way it last moved.
export const FROZEN: EnemyStatus = {
    name: "penguin.frozen",
    holds: true,
    harmless: true,
    solid: true,
    look: { color: "rgba(150, 210, 255, 0.6)", emoji: "🧊" },
}

// The cone's floor as ice (slides as on level ice). The engine leaves out
// any cell a character stands on, frozen enemies included.
export const BREATH_ICE: TileEffect = {
    name: "penguin.ice",
    ice: true,
    look: { color: "rgba(190, 230, 255, 0.45)" },
}

export const penguin: BreathDef = {
    animal: AnimalId.penguin,
    // Range 3 reaches the next junction in most corridors and makes a
    // slide of up to 3 cells; any longer and one breath would ice half a
    // stage's corridor.
    shape: { kind: "cone", range: 3 },
    cost: 50,
    cooldown: 1,
    duration: 3,
    maxEnergy: 100,
    speedScale: 1,
    slideSpeedScale: 1.5,
    // Snowflakes drifting out along the cone.
    particles: {
        colors: ["#fff", "#bae6fd", "#7dd3fc"],
        count: 3,
        life: 0.7,
        speed: 1.5,
        spread: 1.2,
        size: 0.1,
        jitter: 0.3,
        drag: 1.5,
    },
    fire(hit) {
        // Facing straight into a wall with no enemy on the player's own
        // cell, there is nothing to freeze or ice: keep the energy.
        if (hit.cells.length === 0 && hit.enemies.length === 0) return false
        for (const enemy of hit.enemies) {
            hit.addStatus(enemy, FROZEN, penguin.duration)
        }
        for (const cell of hit.cells) {
            hit.addTile(cell, BREATH_ICE, ICE_SECONDS)
        }
    },
}
