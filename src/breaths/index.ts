import type { BreathDef } from "../breath"
import type { AnimalId } from "../roster"
import { boar } from "./boar"
import { dragon } from "./dragon"
import { owl } from "./owl"
import { penguin } from "./penguin"
import { skunk } from "./skunk"

// Every playable animal's breath and stats, one file each (see BreathDef in
// breath.ts for what a file defines). A Record over AnimalId, so a new
// animal without a breath is a type error.
export const BREATHS: Readonly<Record<AnimalId, BreathDef>> = {
    dragon,
    penguin,
    owl,
    skunk,
    boar,
}
