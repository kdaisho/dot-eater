import type { BreathDef } from "../breath"
import { AnimalId } from "../roster"

// Boar 🐗, wall-break breath (KDA-220): breaks the wall in front; it grows
// back after 10 s, pushing out anything inside; outer walls hold. Stat:
// costly breath, slower movement (3.5 cells/s at the default 4).
export const boar: BreathDef = {
    animal: AnimalId.boar,
    shape: { kind: "line", range: 1 },
    cost: 75,
    cooldown: 1,
    duration: 10,
    maxEnergy: 100,
    speedScale: 0.875,
    // The effect lands in KDA-220. Until then the breath only spends energy.
    fire() {},
}
