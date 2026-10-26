import type { BreathDef } from "../breath"
import { AnimalId } from "../roster"

// Dragon 🐉, fire breath (KDA-216): a line that defeats the first enemy it
// hits; the cells it passed burn for 2 s and block enemies. Stat: balanced,
// the default character.
export const dragon: BreathDef = {
    animal: AnimalId.dragon,
    shape: { kind: "line", range: 5 },
    cost: 50,
    cooldown: 1,
    duration: 2,
    maxEnergy: 100,
    speedScale: 1,
    // The effect lands in KDA-216. Until then the breath only spends energy.
    fire() {},
}
