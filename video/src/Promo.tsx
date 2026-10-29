import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion"
import {
    EASE_IN_OUT,
    EASE_OUT,
    follow,
    keyframes,
    type Keyframe,
} from "./camera"
import { BAR, cueFrame, TRACK_START } from "./cues"
import { EndCard } from "./EndCard"
import { GameplayClip } from "./GameplayClip"
import { musicTrack } from "./music"
import {
    BEAT,
    CLOSE_CALL,
    DURATION,
    END_CARD,
    FPS,
    GAMEPLAY,
    promoClip,
    RUN,
    TITLE,
} from "./plan"
import { recording } from "./recordings"
import { AUDIO_FILES, MIX, musicVolume } from "./soundtrack"
import { Caption } from "./text"
import { TitleCard } from "./TitleCard"

export { DURATION, FPS, HEIGHT, WIDTH } from "./plan"

const CLIP = promoClip(recording(RUN))
const LENGTH = GAMEPLAY.duration
// One bar of the music, in frames.
const BAR_FRAMES = BAR * FPS
// The clip frame of the song's bar `n` (bar 0 is the video's first).
const bar = (n: number) => n * BAR_FRAMES - GAMEPLAY.from

// A quick push in to `peak` on a downbeat, settling back to `base` over
// the rest of the bar.
function punch(at: number, base: number, peak: number): Keyframe[] {
    return [
        { frame: at, value: base },
        { frame: at + 6, value: peak, easing: EASE_OUT },
        { frame: at + BAR_FRAMES * 0.75, value: base, easing: EASE_IN_OUT },
    ]
}

// Start on the whole maze, push in on the player, lean in to the drop and
// punch in on the close call, push in on a few downbeats after it, and
// pull out at the end.
const CAMERA = follow({
    smoothing: 14,
    zoom: (frame) =>
        keyframes(frame, [
            { frame: 20, value: 1 },
            { frame: 70, value: 2.2, easing: EASE_IN_OUT },
            ...punch(bar(3), 2.2, 2.6),
            { frame: bar(4), value: 2.2 },
            { frame: CLOSE_CALL - 20, value: 2.6, easing: EASE_IN_OUT },
            { frame: CLOSE_CALL, value: 3, easing: EASE_OUT },
            { frame: CLOSE_CALL + 50, value: 3 },
            { frame: CLOSE_CALL + 80, value: 2.2, easing: EASE_IN_OUT },
            ...punch(bar(8), 2.2, 2.6),
            ...punch(bar(10), 2.2, 2.6),
            ...punch(bar(12), 2.2, 2.6),
            { frame: LENGTH - 50, value: 2.2 },
            { frame: LENGTH - 8, value: 1, easing: EASE_IN_OUT },
        ]),
})

// Room under the board for the opening caption, while the whole board
// shows; given back as the camera pushes in.
const ROOM = (frame: number) =>
    keyframes(frame, [
        { frame: 58, value: 260 },
        { frame: 80, value: 0, easing: EASE_IN_OUT },
    ])

// The music's volume on each frame: a dip in slow motion and a fade out at
// the end (see musicVolume), times its level in the mix.
const volume = (level: number) => (frame: number) =>
    level * musicVolume(frame, CLIP, DURATION)

// The demo promo: title, one run, end card, cut on the music's cues. The
// game's sound effects play under it all, rendered to a WAV in sync with
// the run (see scripts/render-audio.ts), over your song if there is one in
// public/music/ (see music.ts), or the game's own music if not.
export function Promo() {
    const song = musicTrack()
    return (
        <AbsoluteFill style={{ backgroundColor: "#fff" }}>
            {song ? (
                <Audio
                    name="Song"
                    src={song}
                    trimBefore={TRACK_START * FPS}
                    volume={volume(MIX.song)}
                />
            ) : (
                <Audio
                    name="Game music"
                    src={staticFile(AUDIO_FILES.music)}
                    volume={volume(1)}
                />
            )}
            <Audio name="Effects" src={staticFile(AUDIO_FILES.effects)} />
            <Sequence
                from={TITLE.from}
                durationInFrames={TITLE.duration}
                name="Title"
            >
                {/* The words land on the first downbeat and the and of
                    it; the dots are eaten over the rest of the bar. */}
                <TitleCard beat={BEAT / 2} start={cueFrame("intro", FPS)} />
            </Sequence>
            <Sequence
                from={GAMEPLAY.from}
                durationInFrames={GAMEPLAY.duration}
                name="Gameplay"
            >
                <GameplayClip
                    recording={CLIP.recording}
                    time={CLIP.time}
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
            <Sequence from={END_CARD.from} name="End card">
                <EndCard beat={BEAT} start={0} />
            </Sequence>
        </AbsoluteFill>
    )
}
