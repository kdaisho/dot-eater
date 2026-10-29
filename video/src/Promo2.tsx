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
import { compileCuts } from "./cutList"
import { CutSequence } from "./CutSequence"
import { Confetti, Flash, Letterbox, Slam, Vignette } from "./DramaFx"
import { excerptFrames, PROMO2_EXCERPT } from "./excerpts"
import { loadBeats } from "./loadBeats"
import { DISPLAY, INK, LOOKS, PAPER } from "./palette"
import {
    BOSS_DOWN_BEAT,
    CHARACTER_ORDER,
    END_EMOJI_BEATS,
    promo2CutList,
    SECTIONS,
    type Scenes,
} from "./promo2Cuts"
import { promo2Tracks } from "./promo2Sound"
import { sceneRecording } from "./recordings/scenes"
import { SCENE_NAMES } from "./scenes"
import { SONGS } from "./songs"

// The v2 promo: the characters' trailer, cut to The Return of the 8-Bit Era
// (PROMO2_EXCERPT, about 44 s) from the directed scenes.
// The song only, no game sound. The edit is promo2Cuts.ts; this adds the
// song and what spans shots: the boss look, the boss-down flash and
// confetti, and the end card's emoji.

export const PROMO2_FPS = 30

export type Promo2Props = {
    beats: BeatsFile | null
    song: string | null
}

export const calculatePromo2: CalculateMetadataFunction<
    Promo2Props
> = async () => {
    const loaded = await loadBeats(SONGS.promo2)
    const frames = excerptFrames(loaded.file, PROMO2_EXCERPT, PROMO2_FPS)
    return {
        durationInFrames: frames.duration,
        props: { beats: loaded.file, song: loaded.song },
    }
}

const SCENES: Scenes = Object.fromEntries(
    SCENE_NAMES.map((name) => [name, sceneRecording(name)])
) as Scenes

const CONFETTI = [...CHARACTER_ORDER.map((a) => LOOKS[a].colour), PAPER]

export function Promo2({ beats: file, song }: Promo2Props) {
    const frame = useCurrentFrame()
    const frames = useMemo(
        () => (file ? excerptFrames(file, PROMO2_EXCERPT, PROMO2_FPS) : null),
        [file]
    )
    const shots = useMemo(
        () => (frames ? compileCuts(promo2CutList(SCENES), frames.beats) : []),
        [frames]
    )
    if (!frames) return null
    const { beats } = frames
    const at = (beat: number) => Math.round(beats.beatFrame(beat))
    const bossFrom = at(SECTIONS.boss)
    const bossTo = at(SECTIONS.endCard)
    const down = at(BOSS_DOWN_BEAT)
    const endFrom = at(SECTIONS.endCard)
    // The boss look closes in over the hook's first frames and opens on
    // the end card.
    const boss = interpolate(
        frame,
        [bossFrom, bossFrom + 8, bossTo - 4, bossTo],
        [0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    )
    const tracks = promo2Tracks(song, {
        start: frames.start,
        duration: frames.duration,
        fps: PROMO2_FPS,
    })
    return (
        <AbsoluteFill style={{ backgroundColor: INK }}>
            {tracks.map((t) => (
                <Audio
                    key={t.name}
                    name={t.name}
                    src={t.src}
                    trimBefore={t.trimBefore}
                    volume={t.volume}
                />
            ))}
            <CutSequence shots={shots} beats={beats} />
            <Sequence
                from={down - 1}
                durationInFrames={bossTo - down + 1}
                name="Boss down"
            >
                {/* Two blinding white frames, under the letterbox (no
                    grey fade), and confetti in every colour from the
                    bottom corners, clear of the slam. */}
                <Flash at={1} colour={PAPER} hold={2} fade={0} />
                <Confetti
                    at={1}
                    colours={CONFETTI}
                    count={90}
                    seed={45}
                    origin={{ x: 0.12, y: 0.95 }}
                />
                <Confetti
                    at={1}
                    colours={CONFETTI}
                    count={90}
                    seed={46}
                    origin={{ x: 0.88, y: 0.95 }}
                />
            </Sequence>
            <Sequence
                from={bossFrom}
                durationInFrames={bossTo - bossFrom}
                name="Boss look"
            >
                <Vignette strength={boss * 0.8} />
                <Letterbox amount={boss} />
            </Sequence>
            <Sequence from={endFrom} name="End emoji">
                <EndEmoji
                    beats={END_EMOJI_BEATS.map((b) => at(b) - endFrom)}
                    pulse={(f) => beats.pulse(f + endFrom)}
                />
            </Sequence>
        </AbsoluteFill>
    )
}

// The five characters along the end card's foot, each popping in on its
// beat on a disc of its colour, then pulsing on the beat.
function EndEmoji({
    beats,
    pulse,
}: {
    // The frame each pops in on, in CHARACTER_ORDER.
    beats: readonly number[]
    pulse: (frame: number) => number
}) {
    const frame = useCurrentFrame()
    const p = pulse(frame)
    return (
        <AbsoluteFill
            style={{
                justifyContent: "flex-end",
                alignItems: "center",
                paddingBottom: 70,
                pointerEvents: "none",
            }}
        >
            <div style={{ display: "flex", gap: 44 }}>
                {CHARACTER_ORDER.map((animal, i) => {
                    const look = LOOKS[animal]
                    return (
                        <Slam key={animal} at={beats[i] ?? 0} from={2.6}>
                            <div
                                style={{
                                    width: 150,
                                    height: 150,
                                    borderRadius: "50%",
                                    backgroundColor: look.colour,
                                    border: `6px solid ${PAPER}`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontFamily: DISPLAY,
                                    fontSize: 92,
                                    transform: `scale(${1 + 0.08 * p})`,
                                }}
                            >
                                {look.emoji}
                            </div>
                        </Slam>
                    )
                })}
            </div>
        </AbsoluteFill>
    )
}
