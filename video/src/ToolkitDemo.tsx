import { useMemo } from "react"
import {
    AbsoluteFill,
    Audio,
    Sequence,
    interpolate,
    useCurrentFrame,
    type CalculateMetadataFunction,
} from "remotion"
import type { BeatsFile } from "./beats"
import { compileCuts, cutLength } from "./cutList"
import { CutSequence } from "./CutSequence"
import { Letterbox, PulseText, Vignette } from "./DramaFx"
import { excerptFrames, PROMO2_EXCERPT } from "./excerpts"
import { loadBeats } from "./loadBeats"
import { LOOKS, PAPER } from "./palette"
import { recording } from "./recordings"
import { demoCutList } from "./toolkitDemoCuts"
import { SONGS } from "./songs"

// A short demo of the edit toolkit: four bars of Great Expectations
// (bars 36–40 of the v2 excerpt, the lift into the hook) cut into a
// character slam and three gameplay shots of the demo run, with a speed
// ramp, zoom punches, a shake, a flash cut, a whip pan, a colour wipe, and
// the boss look (letterbox and vignette) on the last.

export const DEMO_FPS = 30
const FROM_BAR = PROMO2_EXCERPT.cues.lift
const BARS = 4

export type ToolkitDemoProps = {
    beats: BeatsFile | null
    song: string | null
}

// The grid and song, loaded before rendering (see loadBeats).
export const calculateToolkitDemo: CalculateMetadataFunction<
    ToolkitDemoProps
> = async () => {
    const loaded = await loadBeats(SONGS.promo2)
    const frames = demoFrames(loaded.file)
    return {
        durationInFrames: frames.duration,
        props: { beats: loaded.file, song: loaded.song },
    }
}

function demoFrames(file: BeatsFile) {
    return excerptFrames(
        file,
        { ...PROMO2_EXCERPT, fromBar: FROM_BAR, toBar: FROM_BAR + BARS },
        DEMO_FPS
    )
}

export function ToolkitDemo({ beats: file, song }: ToolkitDemoProps) {
    const frame = useCurrentFrame()
    const run = recording("demo")
    const frames = useMemo(() => (file ? demoFrames(file) : null), [file])
    const shots = useMemo(
        () => (frames ? compileCuts(demoCutList(run), frames.beats) : []),
        [frames, run]
    )
    if (!frames) return null
    const last = shots[shots.length - 1]
    const boss = last ? frame - last.from : -1
    const close = interpolate(boss, [0, 8], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    })
    return (
        <AbsoluteFill style={{ backgroundColor: PAPER }}>
            {song && (
                <Audio
                    name="Song"
                    src={song}
                    trimBefore={Math.round(frames.start * DEMO_FPS)}
                />
            )}
            <CutSequence shots={shots} beats={frames.beats} />
            {last && (
                <Sequence from={last.from} name="Boss look">
                    <Vignette strength={close * 0.85} />
                    <Letterbox amount={close} />
                    <AbsoluteFill
                        style={{
                            justifyContent: "flex-start",
                            alignItems: "center",
                            paddingTop: 30,
                        }}
                    >
                        <PulseText
                            pulse={frames.beats.pulse(frame)}
                            amount={0.18}
                            style={{
                                color: LOOKS.dragon.colour,
                                fontSize: 96,
                                opacity: close,
                            }}
                        >
                            Boss fight
                        </PulseText>
                    </AbsoluteFill>
                </Sequence>
            )}
            <Sequence from={cutLength(shots) - 1} name="End flash">
                <AbsoluteFill style={{ backgroundColor: PAPER }} />
            </Sequence>
        </AbsoluteFill>
    )
}
