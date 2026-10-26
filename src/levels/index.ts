import { parseLevel, type Level } from "../level"
import { stage1 } from "./stage1"

// Parsed once on load, so a broken level file fails immediately.
export const levels: readonly Level[] = [parseLevel(stage1)]
