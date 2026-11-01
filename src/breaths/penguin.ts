import type { BreathDef, EnemyStatus, TileEffect } from "../breath"
import { AnimalId } from "../roster"

// Penguin 🐧, ice breath (KDA-217): a cone that freezes enemies for a few
// seconds and turns the floor to ice for 5 s. Charging it (KDA-289) widens
// the cone and makes the freeze last longer (coneRange, freezeSeconds), for
// 20 energy a level. Stat: walks on ice (KDA-259): it moves and stops on ice
// as on normal floor, where everyone else slides.

// Seconds the floor stays ice.
export const ICE_SECONDS = 5

// The cone's range at charge `level`: 2 for levels 1 and 2, 3 for 3 and 4,
// 4 at the top (KDA-289; placeholders to tune at preview). Range 3, the
// breath before charging, reaches the next junction in most corridors and
// makes a slide of up to 3 cells; at 4 one breath ices a good stretch of a
// stage's corridor, which is what the full charge pays for.
export function coneRange(level: number): number {
    return 2 + Math.floor((level - 1) / 2)
}

// Seconds enemies stay frozen at charge `level`: 3 for a tap (the breath
// before charging), half a second more a level, 5 at the top (KDA-289;
// placeholders to tune at preview).
export function freezeSeconds(level: number): number {
    return 2.5 + level / 2
}

// A frozen enemy is an ice block: it doesn't move or catch. Players walk
// through it, as through any enemy (KDA-260). It blinks for the last second
// as a warning, since when the freeze ends it moves by the usual rules: one
// left standing on ice slides on the way it last moved, and one with a
// player on it catches at once.
export const FROZEN: EnemyStatus = {
    name: "penguin.frozen",
    holds: true,
    harmless: true,
    blinksBeforeEnd: true,
    look: { color: "rgba(150, 210, 255, 0.6)", emoji: "🧊" },
}

// The cone's floor as ice (as level ice: everyone but a Penguin slides on
// it). The engine leaves out any cell a character stands on, frozen enemies
// included.
export const BREATH_ICE: TileEffect = {
    name: "penguin.ice",
    ice: true,
    look: { color: "rgba(190, 230, 255, 0.45)" },
}

export const penguin: BreathDef = {
    animal: AnimalId.penguin,
    shape: (level) => ({ kind: "cone", range: coneRange(level) }),
    cost: 20,
    cooldown: 1,
    duration: freezeSeconds(1),
    maxEnergy: 100,
    speedScale: 1,
    walksOnIce: true,
    // Icy blue flakes drifting out along the cone (white would vanish on
    // the white floor).
    particles: {
        colors: ["#38bdf8", "#7dd3fc", "#0284c7"],
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
            hit.addStatus(enemy, FROZEN, freezeSeconds(hit.level))
        }
        for (const cell of hit.cells) {
            hit.addTile(cell, BREATH_ICE, ICE_SECONDS)
        }
    },
}
