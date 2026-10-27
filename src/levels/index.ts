import { parseLevel, type Level } from "../level"
import { stage1 } from "./stage1"
import { stage2 } from "./stage2"
import { stage3 } from "./stage3"
import { stage4 } from "./stage4"
import { stage5 } from "./stage5"

// Parsed once on load, so a broken level file fails immediately.
export const levels: readonly Level[] = [
    stage1,
    stage2,
    stage3,
    stage4,
    stage5,
].map((data) => parseLevel(data))
