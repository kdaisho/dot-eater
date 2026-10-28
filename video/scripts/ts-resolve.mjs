// Lets Node run the game's TypeScript straight from source (Node strips the
// types itself): the game imports its modules without extensions
// ("./flow", "./breaths"), as bundlers allow, so try ".ts" and then
// "/index.ts" when a relative import isn't found as written. Used as `node --import ./scripts/ts-resolve.mjs ...`.
import { registerHooks } from "node:module"

registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context)
        } catch (error) {
            if (!specifier.startsWith(".")) throw error
            try {
                return nextResolve(`${specifier}.ts`, context)
            } catch {
                // A folder: its index module.
                return nextResolve(`${specifier}/index.ts`, context)
            }
        }
    },
})
