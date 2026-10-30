import type { BreathDef, TileEffect } from "../breath"
import { AnimalId } from "../roster"

// Skunk 🦨, smelly breath (KDA-219): a stink cloud around it for 5 s;
// enemies won't go in and turn back inside it. Stat: a bigger meter.
//
// The cloud flows along the corridors like a gas (KDA-289, with the user):
// it fills the open cells within a few steps' walk of the player (a flood
// shape), so it reaches round corners but never through a wall. Charging it
// makes it reach further (cloudReach), for 30 energy a level: the 150 meter
// holds one full charge.
//
// The cloud covers the player's own cell too, so standing in it is safe,
// and it stays where it was breathed: walking out leaves it behind. It is
// the engine's blocksEnemies tile effect, so every enemy, phantoms
// included, keeps out, and one inside heads out by the shortest way.
// Collisions still apply on the way out: an enemy already on the player's
// cell when the cloud appears catches the player as usual.
//
// The breath before charging was a 3x3 square, one cell either side in a
// corridor; user feedback found it too weak (2026-10-30). A tap's cloud now
// reaches 2 steps, enough to stop an enemy (at half the player's speed) a
// couple of cells short, and a full charge fills 6 cells down every
// corridor from where it is breathed.

const DURATION = 5

// Steps the cloud walks out from the player at charge `level`: 2 for a
// tap, one more a level, 6 at the top (KDA-289; placeholders to tune at
// preview).
export function cloudReach(level: number): number {
    return level + 1
}

// A sickly green haze, translucent so dots stay readable.
const HAZE = "rgba(132, 204, 22, 0.4)"

const stink: TileEffect = {
    name: "skunk.stink",
    blocksEnemies: true,
    look: { color: HAZE },
}

// The cloud's centre also gets a 💨 (drawn over the cell, so only there: the
// player has just eaten any dot on its own cell, so the emoji hides none).
// It is its own effect on top of the stink, not a variant of it: a cloud
// breathed over another then still gets its 💨 where its centre is already
// stink (the same name on a cell only refreshes), and the haze isn't drawn
// twice there. It blocks enemies too, though the stink under it already
// does.
const stinkCentre: TileEffect = {
    name: "skunk.stink.centre",
    blocksEnemies: true,
    look: { emoji: "💨" },
}

export const skunk: BreathDef = {
    animal: AnimalId.skunk,
    shape: (level) => ({ kind: "flood", reach: cloudReach(level) }),
    cost: 30,
    cooldown: 1,
    duration: DURATION,
    maxEnergy: 150,
    speedScale: 1,
    // Slow green puffs welling up all round the cloud.
    particles: {
        colors: ["#84cc16", "#a3e635", "#65a30d"],
        count: 2,
        life: 0.9,
        speed: 0.6,
        spread: Math.PI * 2,
        size: 0.2,
        jitter: 0.35,
        drag: 1,
    },
    // Always fires: the cloud is worth having with no enemy near yet.
    fire(hit) {
        for (const cell of hit.cells) hit.addTile(cell, stink, DURATION)
        hit.addTile(hit.origin, stinkCentre, DURATION)
    },
}
