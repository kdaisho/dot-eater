import type { Recording } from "../../../../src/replay"
import type { SceneName } from "../../scenes"

// The directed scenes' recordings (see scripts/director.ts), by scene name,
// picked up at bundle time like the recordings one folder up.

// The part of webpack's require.context this uses (the bundler provides it).
type JsonContext = {
    keys(): string[]
    (id: string): unknown
}
declare const require: {
    context(directory: string, deep: boolean, filter: RegExp): JsonContext
}

const context = require.context("./", false, /\.json$/)

const scenes: Readonly<Record<string, Recording>> = Object.fromEntries(
    context
        .keys()
        .filter((id) => id.startsWith("./"))
        .map((id) => [id.slice(2, -".json".length), context(id) as Recording])
)

// The recording of scene `name`.
export function sceneRecording(name: SceneName): Recording {
    const found = scenes[name]
    if (!found) throw new Error(`No recording for scene "${name}"`)
    return found
}
