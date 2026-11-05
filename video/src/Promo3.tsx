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
import { excerptFrames, PROMO3_EXCERPT } from "./excerpts"
import { loadBeats } from "./loadBeats"
import { INK, LOOKS, PAPER } from "./palette"
import { PixelSprite } from "./PixelSprite"
import { ANIMAL_SPRITES } from "../../src/sprites"
import {
    BOSS_DOWN_BEAT,
    CHARACTER_ORDER,
    END_EMOJI_BEATS,
    END_FLOOR,
    promo3CutList,
    SECTIONS,
    type Scenes,
} from "./promo3Cuts"
import { promo2Tracks } from "./promo2Sound"
import { sceneRecording } from "./recordings/scenes"
import { SCENE_NAMES } from "./scenes"
import { SONGS } from "./songs"

// The v3 promo: the characters' trailer on the current game, cut to The
// Return of the 8-Bit Era from its start (PROMO3_EXCERPT, about 55 s), from
// the directed scenes. The song only, no game sound. The edit is
// promo3Cuts.ts; this adds the song and what spans shots: the boss look,
// the boss-down flash and confetti, and the end card's walls and walkers.

export const PROMO3_FPS = 30

export type Promo3Props = {
    beats: BeatsFile | null
    song: string | null
}

export const calculatePromo3: CalculateMetadataFunction<
    Promo3Props
> = async () => {
    const loaded = await loadBeats(SONGS.promo3)
    const frames = excerptFrames(loaded.file, PROMO3_EXCERPT, PROMO3_FPS)
    return {
        durationInFrames: frames.duration,
        props: { beats: loaded.file, song: loaded.song },
    }
}

const SCENES: Scenes = Object.fromEntries(
    SCENE_NAMES.map((name) => [name, sceneRecording(name)])
) as Scenes

const CONFETTI = [...CHARACTER_ORDER.map((a) => LOOKS[a].colour), PAPER]

export function Promo3({ beats: file, song }: Promo3Props) {
    const frame = useCurrentFrame()
    const frames = useMemo(
        () => (file ? excerptFrames(file, PROMO3_EXCERPT, PROMO3_FPS) : null),
        [file]
    )
    const shots = useMemo(
        () => (frames ? compileCuts(promo3CutList(SCENES), frames.beats) : []),
        [frames]
    )
    if (!frames) return null
    const { beats } = frames
    const at = (beat: number) => Math.round(beats.beatFrame(beat))
    const bossFrom = at(SECTIONS.boss)
    const bossTo = at(SECTIONS.montage)
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
        fps: PROMO3_FPS,
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
            <Sequence from={endFrom} name="End floor">
                <EndFloor
                    beats={END_EMOJI_BEATS.map((b) => at(b) - endFrom)}
                    beatFrames={beats.beatFrames}
                />
            </Sequence>
        </AbsoluteFill>
    )
}

// The end card's stage: stage 1's red walls round the frame (their dark
// edge, face and lit band, as tiles.ts draws a wall), and along the foot
// the five stepping in one by one on their beats, walking on the beat
// (their two walk frames in turn), a row of dots ahead of them.
function EndFloor({
    beats,
    beatFrames,
}: {
    // The frame each steps in on, in CHARACTER_ORDER.
    beats: readonly number[]
    beatFrames: number
}) {
    const frame = useCurrentFrame()
    const step = Math.floor(frame / beatFrames) % 2
    const c = END_FLOOR
    return (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
            <AbsoluteFill
                style={{
                    boxShadow: [
                        `inset 0 0 0 10px ${c.K}`,
                        `inset 0 0 0 40px ${c.W}`,
                        `inset 0 0 0 46px ${c.H}`,
                        `inset 0 0 0 54px ${c.K}`,
                        `inset 0 0 0 64px ${c.s}`,
                    ].join(", "),
                }}
            />
            <AbsoluteFill
                style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "flex-end",
                    paddingBottom: 110,
                    gap: 40,
                }}
            >
                {CHARACTER_ORDER.map((animal, i) => (
                    <Slam key={animal} at={beats[i] ?? 0} from={2.2}>
                        <PixelSprite
                            look={{
                                id: ANIMAL_SPRITES[animal],
                                mirror: true,
                                frame: (step + i) % 2,
                            }}
                            size={130}
                        />
                    </Slam>
                ))}
                {Array.from({ length: 6 }, (_, k) => (
                    <div
                        key={k}
                        style={{
                            width: 26,
                            height: 26,
                            margin: "0 22px 52px",
                            borderRadius: 6,
                            backgroundColor: c.D,
                            boxShadow: `inset 6px 6px 0 ${c.d}`,
                        }}
                    />
                ))}
            </AbsoluteFill>
        </AbsoluteFill>
    )
}
