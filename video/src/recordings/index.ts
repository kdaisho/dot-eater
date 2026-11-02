import type { Recording } from "../../../src/replay"

// Every recording in this folder, by file name: drop a recording's JSON file
// here (e.g. epic-run.json, saved from the game's ?record mode) and use it
// as recording("epic-run"). Webpack's require.context picks the files up at
// bundle time, so there is nothing to register.

// The part of webpack's require.context this uses (the bundler provides it).
type JsonContext = {
    keys(): string[]
    (id: string): unknown
}
declare const require: {
    context(directory: string, deep: boolean, filter: RegExp): JsonContext
}

const context = require.context("./", false, /\.json$/)

export const recordings: Readonly<Record<string, Recording>> =
    Object.fromEntries(
        context
            .keys()
            .filter((id) => id.startsWith("./"))
            .map((id) => [
                id.slice(2, -".json".length),
                context(id) as Recording,
            ])
    )

// The recording saved as `name`.json in this folder.
export function recording(name: string): Recording {
    const found = recordings[name]
    if (!found) {
        const names = Object.keys(recordings).join(", ") || "none"
        throw new Error(`No recording "${name}" (found: ${names})`)
    }
    return found
}
