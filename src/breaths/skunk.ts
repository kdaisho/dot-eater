import type { BreathDef } from "../breath"
import { AnimalId } from "../roster"

// Skunk 🦨, smelly breath (KDA-219): a stink cloud on the area around it for
// 5 s; enemies won't go in and turn back inside it. Stat: a bigger meter.
export const skunk: BreathDef = {
    animal: AnimalId.skunk,
    shape: { kind: "area", radius: 1 },
    cost: 50,
    cooldown: 1,
    duration: 5,
    maxEnergy: 150,
    speedScale: 1,
    // The effect lands in KDA-219. Until then the breath only spends energy.
    fire() {},
}
