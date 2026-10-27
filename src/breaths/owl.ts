import type { BreathDef, TileEffect } from "../breath"
import { AnimalId } from "../roster"

// Owl 🦉, wind breath (KDA-218): blows every enemy in a line back 3 cells,
// through tunnels; it doesn't defeat. Stat: cheap breath, short cooldown.

// Cells each enemy in the line is blown back.
export const WIND_PUSH = 3

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
    // 5 cells: a corridor's worth ahead, so a chaser closing in is in reach
    // well before it is adjacent, without blowing away the whole maze.
    shape: { kind: "line", range: 5 },
    cost: 25,
    cooldown: 0.5,
    duration: 0,
    maxEnergy: 100,
    speedScale: 1,
    // Fires even with nobody in the line (the gust shows it). Facing a wall
    // with no enemy on the player's cell there is nothing to blow or show,
    // so the breath refuses and costs nothing. A push ignores other enemies
    // (they overlap), so the order doesn't matter.
    fire(hit) {
        if (hit.cells.length === 0 && hit.enemies.length === 0) return false
        for (const cell of hit.cells) hit.addTile(cell, GUST, GUST_SECONDS)
        for (const enemy of hit.enemies) {
            hit.push(enemy, hit.facing, WIND_PUSH)
        }
    },
}
