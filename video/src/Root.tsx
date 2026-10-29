import { Composition } from "remotion"
import { DURATION, FPS, HEIGHT, Promo, WIDTH } from "./Promo"
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
