import type { BreathDef, TileEffect } from "../breath"
import { AnimalId } from "../roster"
import { samePos } from "../vec2"

// Skunk 🦨, smelly breath (KDA-219): a stink cloud on the area around it for
// 5 s; enemies won't go in and turn back inside it. Stat: a bigger meter.
//
// The cloud covers the player's own cell too, so standing in it is safe,
// and it stays where it was breathed: walking out leaves it behind. It is
// the engine's blocksEnemies tile effect, so every enemy, phantoms
// included, keeps out, and one inside heads out by the shortest way.
// Collisions still apply on the way out: an enemy already on the player's
// cell when the cloud appears catches the player as usual.
//
// Radius 1 (a 3x3 square through open cells): in the maze's one-cell
// corridors that is the player's cell and one either side, enough to stop
// enemies (at half the player's speed) a cell short. A wider cloud would
// seal off whole corridors and junctions for 5 s, more a trap than a
// shield.

const DURATION = 5

// A sickly green haze, translucent so dots stay readable.
const HAZE = "rgba(132, 204, 22, 0.4)"

const stink: TileEffect = {
    name: "skunk.stink",
    blocksEnemies: true,
    look: { color: HAZE },
}

// The cloud's centre also gets a 💨 (drawn over the cell, so only there: the
// player has just eaten any dot on its own cell, so the emoji hides none).
const stinkCentre: TileEffect = {
    ...stink,
    look: { color: HAZE, emoji: "💨" },
}

export const skunk: BreathDef = {
    animal: AnimalId.skunk,
    shape: { kind: "area", radius: 1 },
    cost: 50,
    cooldown: 1,
    duration: DURATION,
    maxEnergy: 150,
    speedScale: 1,
    // Always fires: the cloud is worth having with no enemy near yet.
    fire(hit) {
        for (const cell of hit.cells) {
            const centre = samePos(cell, hit.origin)
            hit.addTile(cell, centre ? stinkCentre : stink, DURATION)
        }
    },
}
