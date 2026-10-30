import { defineConfig } from "vite-plus"

export default defineConfig(({ command, isPreview }) => ({
    // GitHub Pages serves the site from https://kdaisho.github.io/dot-eater/.
    // `vp preview` runs with command "serve", so also check isPreview to serve
    // the built files under the same base they reference.
    base: command === "build" || isPreview ? "/dot-eater/" : "/",
    fmt: {
        ignorePatterns: ["dist/**"],
        tabWidth: 4,
        semi: false,
        singleQuote: false,
        trailingComma: "es5",
        printWidth: 80,
    },
    test: {
        // Vitest leaves stylesheets empty by default; the touch controls'
        // tests read css/style.css (as `?raw`) to check what it shows.
        css: { include: [/css\/style\.css/] },
    },
    lint: {
        ignorePatterns: ["dist/**"],
        options: {
            typeAware: true,
            typeCheck: true,
        },
    },
}))
