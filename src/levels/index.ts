import { DEFAULT_DIFFICULTY } from "../difficulty"
import { parseStage, type Level, type Stage } from "../level"
import { stage1 } from "./stage1"
import { stage2 } from "./stage2"
import { stage3 } from "./stage3"
import { stage4 } from "./stage4"
import { stage5 } from "./stage5"

// Every stage at every difficulty. Parsed once on load, so a broken level
// file fails immediately.
export const stages: readonly Stage[] = [
    stage1,
    stage2,
    stage3,
    stage4,
    stage5,
].map((data) => parseStage(data))

// Every stage at the default difficulty. A stage's name and rules are the
// same at every difficulty.
export const levels: readonly Level[] = stages.map(
    (stage) => stage[DEFAULT_DIFFICULTY]
)
