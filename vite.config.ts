import { defineConfig, loadEnv } from "vite-plus"
import { hashPassphrase } from "./src/adminHash"

export default defineConfig(async ({ command, mode, isPreview }) => ({
    // GitHub Pages serves the site from https://kdaisho.github.io/dot-eater/.
    // `vp preview` runs with command "serve", so also check isPreview to serve
    // the built files under the same base they reference.
    base: command === "build" || isPreview ? "/dot-eater/" : "/",
    // The admin passphrase (src/admin.ts) comes from ADMIN_PASSPHRASE, in
    // .env.local or the environment (the deploy's secret). Only its hash
    // goes in the bundle; without it debug mode can't be turned on. Not a
    // VITE_ variable, which Vite would put in the bundle as it is.
    define: {
        __ADMIN_HASH__: JSON.stringify(await adminHash(mode)),
    },
    fmt: {
        // Recordings are data saved by the game (?record), kept as written.
        ignorePatterns: [
            "dist/**",
            "video/out/**",
            "video/src/recordings/**/*.json",
        ],
        tabWidth: 4,
        semi: false,
        singleQuote: false,
        trailingComma: "es5",
        printWidth: 80,
    },
    test: {
        // Main skips its opening in tests (see src/test/setup.ts).
        setupFiles: ["src/test/setup.ts"],
        // Vitest leaves stylesheets empty by default; the touch controls'
        // tests read css/style.css (as `?raw`) to check what it shows.
        css: { include: [/css\/style\.css/] },
    },
    lint: {
        ignorePatterns: ["dist/**", "video/out/**"],
        options: {
            typeAware: true,
            typeCheck: true,
        },
    },
}))

async function adminHash(mode: string): Promise<string> {
    const { ADMIN_PASSPHRASE } = loadEnv(mode, ".", "ADMIN_")
    return ADMIN_PASSPHRASE ? hashPassphrase(ADMIN_PASSPHRASE) : ""
}
