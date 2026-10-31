// Vite's asset imports: a file's URL.
// Stylesheets imported for their side effects (fonts).
declare module "*.css"

declare module "*.mp3" {
    const url: string
    export default url
}
