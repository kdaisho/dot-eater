import type { BreathDef, TileEffect } from "../breath"
import { AnimalId } from "../roster"
import { samePos } from "../vec2"

// Seconds the cells the fire passed keep burning.
const BURN_SECONDS = 2

// Burning cells keep enemies out; the player walks through them unharmed.
export const BURNING: TileEffect = {
    name: "dragon.burning",
    blocksEnemies: true,
    look: { color: "rgba(255, 110, 20, 0.45)", emoji: "🔥" },
}

// Dragon 🐉, fire breath (KDA-216): a line that defeats the first enemy it
// hits; the cells it passed burn for 2 s and block enemies. Stat: balanced,
// the default character.
//
// The fire stops at the enemy it defeats: it burns the cells up to and
// including that enemy's, and enemies further along are untouched. An enemy
// on the player's own cell (its sprite still gliding in) is the first hit,
// and then nothing burns, since the fire never left the player's cell.
// Facing a wall with no enemy on the player's cell there is nothing to burn,
// so the breath refuses and costs nothing.
export const dragon: BreathDef = {
    animal: AnimalId.dragon,
    shape: { kind: "line", range: 5 },
    cost: 50,
    cooldown: 1,
    duration: BURN_SECONDS,
    maxEnergy: 100,
    speedScale: 1,
    // Embers flying along the line from each burning cell.
    particles: {
        colors: ["#f97316", "#fbbf24", "#dc2626"],
        count: 4,
        life: 0.5,
        speed: 2.5,
        spread: 1,
        size: 0.12,
        jitter: 0.2,
        drag: 2,
    },
    fire(hit) {
        const target = hit.enemies[0]
        if (!target && hit.cells.length === 0) return false
        // Where the fire stops: the target's cell, or the end of the line.
        // -1 when the target is on the player's own cell.
        const stop = target
            ? hit.cells.findIndex((c) => samePos(c, target.pos))
            : hit.cells.length - 1
        const burnt = hit.cells.slice(0, stop + 1)
        if (target) hit.defeat(target)
        for (const cell of burnt) hit.addTile(cell, BURNING, BURN_SECONDS)
    },
}
