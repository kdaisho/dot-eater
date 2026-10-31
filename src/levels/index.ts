import { DEFAULT_DIFFICULTY } from "../difficulty"
import { parseStage, type Level, type Stage } from "../level"
import { stage1 } from "./stage1"
import { stage2 } from "./stage2"
import { stage3 } from "./stage3"
import { stage4 } from "./stage4"
import { stage5 } from "./stage5"
import { stage6 } from "./stage6"
import { stage7 } from "./stage7"
import { stage8 } from "./stage8"
import { stage9 } from "./stage9"
import { stage10 } from "./stage10"

// Every stage at every difficulty. Parsed once on load, so a broken level
// file fails immediately.
//
// Every stage sprinkles interceptors (see intercept.ts) into its lists
// (KDA-292): none at Easy, then one more at each difficulty, so 1 at
// Medium (the medium map's fourth), 2 at Hard and 3 at Super Hard (on the
// large map, mostly the fifth, sixth and eighth). Each took the place of
// one of the stage's own enemies, so the stage notes below give its own
// mix.
export const stages: readonly Stage[] = [
    stage1,
    stage2,
    stage3,
    stage4,
    stage5,
    stage6,
    stage7,
    stage8,
    stage9,
    stage10,
].map((data) => parseStage(data))

// Every stage at the default difficulty. A stage's name and rules are the
// same at every difficulty.
export const levels: readonly Level[] = stages.map(
    (stage) => stage[DEFAULT_DIFFICULTY]
)
