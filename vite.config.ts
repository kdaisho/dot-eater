import { defineConfig } from "vite-plus"

export default defineConfig(({ command }) => ({
    // GitHub Pages serves the site from https://kdaisho.github.io/dot-eater/
    base: command === "build" ? "/dot-eater/" : "/",
    fmt: {
        ignorePatterns: ["dist/**"],
        tabWidth: 4,
        semi: false,
        singleQuote: false,
        trailingComma: "es5",
        printWidth: 80,
    },
    lint: {
        ignorePatterns: ["dist/**"],
        options: {
            typeAware: true,
            typeCheck: true,
        },
    },
    test: {
        passWithNoTests: true,
    },
}))
