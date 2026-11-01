// Vite's `?raw` imports: a file's text. Tests read the stylesheet this way
// (see `test.css` in vite.config.ts, which lets Vitest load it).
declare module "*?raw" {
    const text: string
    export default text
}
