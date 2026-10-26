import type { BreathDef } from "../breath"
import { AnimalId } from "../roster"

// Penguin 🐧, ice breath (KDA-217): a cone that freezes enemies for 3 s and
// turns the floor to ice for 5 s. Stat: slides farther and faster on ice.
export const penguin: BreathDef = {
    animal: AnimalId.penguin,
    shape: { kind: "cone", range: 3 },
    cost: 50,
    cooldown: 1,
    duration: 3,
    maxEnergy: 100,
    speedScale: 1,
    // The effect lands in KDA-217. Until then the breath only spends energy.
    fire() {},
}
