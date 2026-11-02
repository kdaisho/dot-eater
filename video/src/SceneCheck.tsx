import { fixed } from "./camera"
import { GameplayClip } from "./GameplayClip"
import { heroMoment } from "./highlights"
import { FPS } from "./plan"
import { sceneRecording } from "./recordings/scenes"
import type { SceneName } from "./scenes"

// A dev composition for checking a directed scene: its clip from `tick`
// (the hero moment's unless given) on, the camera fixed on the hero
// moment at `zoom`. Render a still of it, e.g.
//
//     pnpm --filter dot-eater-video exec remotion still SceneCheck \
//         out/dragon.png --props='{"scene":"dragon"}' --frame=2

export type SceneCheckProps = {
    scene: SceneName
    // The game tick of frame 0; the hero moment's when left out.
    tick?: number
    // 2 when left out.
    zoom?: number
}

export function SceneCheck({ scene, tick, zoom = 2 }: SceneCheckProps) {
    const recording = sceneRecording(scene)
    const hero = heroMoment(scene, recording)
    if (!hero) throw new Error(`No hero moment in scene "${scene}"`)
    return (
        <GameplayClip
            recording={recording}
            time={{ fps: FPS, startTick: tick ?? hero.tick }}
            camera={fixed(hero.focus.x, hero.focus.y, zoom)}
        />
    )
}
