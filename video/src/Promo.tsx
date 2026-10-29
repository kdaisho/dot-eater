import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion"
import { EASE_IN_OUT, EASE_OUT, follow, keyframes } from "./camera"
import { MUSIC, cueFrame, framesBetween } from "./cues"
import { EndCard } from "./EndCard"
import { GameplayClip } from "./GameplayClip"
import { recording } from "./recordings"
import { nearMisses } from "./replayers"
import { Caption } from "./text"
import { TitleCard } from "./TitleCard"
import { alignTo, type TimeMap } from "./time"

export const FPS = 30
export const WIDTH = 1920
export const HEIGHT = 1080
export const DURATION = cueFrame("end", FPS)

// Frames per beat for the text pops (placeholder: 120 bpm at 30 fps).
const BEAT = 15

// The demo run (see scripts/record-demo.ts). Swap in a real recording by
// name once there is one in src/recordings/.
const RUN = recording("demo")

// The gameplay clip runs from the drop to the outro; frames below are the
// clip's own (0 is the drop).
const CLIP = framesBetween("drop", "outro", FPS)
// The close call lands on the chorus.
const CLOSE_CALL = framesBetween("drop", "chorus", FPS)

// Real time, easing into fifth-speed slow motion just before the run's
// closest call, and back to real time a little after it, with the close
// call landing on the chorus.
const TIME: TimeMap = alignTo(
    {
        fps: FPS,
        segments: [
            { fromFrame: CLOSE_CALL - 15, speed: 0.2, ramp: 10 },
            { fromFrame: CLOSE_CALL + 40, speed: 1, ramp: 12 },
        ],
    },
    CLOSE_CALL,
    nearMisses(RUN)[0]?.tick ?? 0
)

// Start on the whole maze, push in on the player, pull out at the end.
const CAMERA = follow({
    smoothing: 14,
    zoom: (frame) =>
        keyframes(frame, [
            { frame: 20, value: 1 },
            {
                frame: 70,
                value: 2.4,
                easing: EASE_IN_OUT,
            },
            { frame: CLOSE_CALL - 20, value: 2.4 },
            {
                frame: CLOSE_CALL,
                value: 3,
                easing: EASE_OUT,
            },
            { frame: CLOSE_CALL + 50, value: 3 },
            {
                frame: CLOSE_CALL + 80,
                value: 2.2,
                easing: EASE_IN_OUT,
            },
            { frame: CLIP - 60, value: 2.2 },
            { frame: CLIP - 15, value: 1, easing: EASE_IN_OUT },
        ]),
})

// Room under the board for the opening caption, while the whole board
// shows; given back as the camera pushes in.
const ROOM = (frame: number) =>
    keyframes(frame, [
        { frame: 58, value: 260 },
        { frame: 80, value: 0, easing: EASE_IN_OUT },
    ])

// The demo promo: title, one run, end card, cut on the music's cues.
export function Promo() {
    const drop = cueFrame("drop", FPS)
    const outro = cueFrame("outro", FPS)
    return (
        <AbsoluteFill style={{ backgroundColor: "#fff" }}>
            {MUSIC ? <Audio src={staticFile(MUSIC)} /> : null}
            <Sequence durationInFrames={drop} name="Title">
                {/* The first word lands on the intro cue. */}
                <TitleCard beat={BEAT} start={cueFrame("intro", FPS)} />
            </Sequence>
            <Sequence from={drop} durationInFrames={CLIP} name="Gameplay">
                <GameplayClip
                    recording={RUN}
                    time={TIME}
                    camera={CAMERA}
                    room={ROOM}
                />
                <Caption text="Eat every dot" at={8} until={60} />
                <Caption
                    text="Close call"
                    at={CLOSE_CALL - 10}
                    until={CLOSE_CALL + 40}
                    position="top"
                />
            </Sequence>
            <Sequence from={outro} name="End card">
                <EndCard beat={BEAT} start={4} />
            </Sequence>
        </AbsoluteFill>
    )
}
