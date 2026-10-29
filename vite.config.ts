import { defineConfig } from "vite-plus"

export default defineConfig(({ command, isPreview }) => ({
    // GitHub Pages serves the site from https://kdaisho.github.io/dot-eater/.
    // `vp preview` runs with command "serve", so also check isPreview to serve
    // the built files under the same base they reference.
    base: command === "build" || isPreview ? "/dot-eater/" : "/",
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
    lint: {
        ignorePatterns: ["dist/**", "video/out/**"],
        options: {
            typeAware: true,
            typeCheck: true,
        },
    },
}))
