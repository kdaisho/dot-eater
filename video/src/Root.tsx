import { Composition } from "remotion"
import { DURATION, FPS, HEIGHT, Promo, WIDTH } from "./Promo"
import {
    calculateToolkitDemo,
    DEMO_FPS,
    ToolkitDemo,
    type ToolkitDemoProps,
} from "./ToolkitDemo"
import { SceneCheck, type SceneCheckProps } from "./SceneCheck"

const CHECK: SceneCheckProps = { scene: "dragon" }

export function Root() {
    return (
        <>
            <Composition
                id="Promo"
                component={Promo}
                durationInFrames={DURATION}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
            />
            <Composition
                id="ToolkitDemo"
                component={ToolkitDemo}
                // Set from the song's beat grid (see calculateToolkitDemo).
                durationInFrames={300}
                fps={DEMO_FPS}
                width={WIDTH}
                height={HEIGHT}
                defaultProps={{ beats: null, song: null } as ToolkitDemoProps}
                calculateMetadata={calculateToolkitDemo}
            />
            {/* Dev only: a directed scene's hero moment (see SceneCheck). */}
            <Composition
                id="SceneCheck"
                component={SceneCheck}
                durationInFrames={FPS * 4}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
                defaultProps={CHECK}
            />
        </>
    )
}
