// Remotion's entry point (see remotion.config.ts).
import "@fontsource/press-start-2p/latin-400.css"
import { continueRender, delayRender, registerRoot } from "remotion"
import { Root } from "./Root"

// The game's pixel font (as cardArt.ts loads it): every frame waits for it,
// so no frame renders in the fallback font.
const fontWait = delayRender("Loading Press Start 2P")
document.fonts
    .load('16px "Press Start 2P"')
    .then(() => continueRender(fontWait))
    .catch(() => continueRender(fontWait))

registerRoot(Root)
