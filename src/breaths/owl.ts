import type { BreathDef, TileEffect } from "../breath"
import { AnimalId } from "../roster"

// Owl 🦉, wind breath (KDA-218): blows every enemy in a line back a few
// cells, through tunnels; it doesn't defeat. Charging it (KDA-289) makes
// the line longer and the push further (windRange, windPush), for 10
// energy a level. Stat: cheap breath, short cooldown.

// The line's range at charge `level`: 4 cells for a tap, one more a level,
// 8 at the top (KDA-289; placeholders to tune at preview). Level 2 is the
// breath before charging (5 cells), a corridor's worth ahead, so a chaser
// closing in is in reach well before it is adjacent.
export function windRange(level: number): number {
    return level + 3
}

// Cells each enemy in the line is blown back at charge `level`: 2 for a
// tap, one more a level, 6 at the top (KDA-289; placeholders to tune at
// preview). Level 2 is the breath before charging (3).
export function windPush(level: number): number {
    return level + 1
}

// Seconds the gust shows on the line's cells.
export const GUST_SECONDS = 0.25

// A look-only tile effect: the gust along the line, so a breath that hits
// nobody still shows it fired.
export const GUST: TileEffect = {
    name: "owl.gust",
    look: { color: "rgba(200, 230, 255, 0.35)", emoji: "💨" },
}

export const owl: BreathDef = {
    animal: AnimalId.owl,
    shape: (level) => ({ kind: "line", range: windRange(level) }),
    cost: 10,
    cooldown: 0.5,
    duration: 0,
    maxEnergy: 100,
    speedScale: 1,
    // Quick blue-grey wisps streaking along the line (pale ones would vanish
    // on the white floor).
    particles: {
        colors: ["#94a3b8", "#a5b4c8", "#64748b"],
        count: 3,
        life: 0.35,
        speed: 5,
        spread: 0.3,
        size: 0.08,
        jitter: 0.3,
        drag: 2,
    },
    // Fires even with nobody in the line (the gust shows it). Facing a wall
    // with no enemy on the player's cell there is nothing to blow or show,
    // so the breath refuses and costs nothing. A push ignores other enemies
    // (they overlap), so the order doesn't matter.
    fire(hit) {
        if (hit.cells.length === 0 && hit.enemies.length === 0) return false
        for (const cell of hit.cells) hit.addTile(cell, GUST, GUST_SECONDS)
        for (const enemy of hit.enemies) {
            hit.push(enemy, hit.facing, windPush(hit.level))
        }
    },
}
