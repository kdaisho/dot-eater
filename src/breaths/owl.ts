import type { BreathDef } from "../breath"
import { AnimalId } from "../roster"

// Owl 🦉, wind breath (KDA-218): blows every enemy in a line back 3 cells,
// through tunnels; it doesn't defeat. Stat: cheap breath, short cooldown.
export const owl: BreathDef = {
    animal: AnimalId.owl,
    shape: { kind: "line", range: 5 },
    cost: 25,
    cooldown: 0.5,
    duration: 0,
    maxEnergy: 100,
    speedScale: 1,
    // The effect lands in KDA-218. Until then the breath only spends energy.
    fire() {},
}
