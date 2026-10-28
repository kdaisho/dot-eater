import { Composition } from "remotion"
import { DURATION, FPS, HEIGHT, Promo, WIDTH } from "./Promo"

export function Root() {
    return (
        <Composition
            id="Promo"
            component={Promo}
            durationInFrames={DURATION}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
        />
    )
}
