import { parseLevel, type Level } from "../level"
import { level1 } from "./level1"

// Parsed once on load, so a broken level file fails immediately.
export const levels: readonly Level[] = [parseLevel(level1)]
