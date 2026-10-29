import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion"
import type { Beats } from "./beats"
import type { CompiledShot } from "./cutList"
import { TRANSITION_FRAMES } from "./drama"
import {
    ColourWipe,
    Flash,
    Shake,
    SlamCaption,
    SlamCard,
    Whip,
} from "./DramaFx"
import { GameplayClip } from "./GameplayClip"
import { INK, LOOKS, PAPER } from "./palette"

// Draws a compiled cut list (see cutList.ts): each shot in its own
// Sequence, whipped, shaken and flashed as it says, with the flashes and
// wipes over its cuts.
export function CutSequence({
    shots,
    beats,
    resolution = 4,
}: {
    shots: readonly CompiledShot[]
    beats: Beats
    resolution?: number
}) {
    return (
        <AbsoluteFill style={{ backgroundColor: PAPER }}>
            {shots.map((c) => (
                <Sequence
                    key={c.index}
                    from={c.from}
                    durationInFrames={c.duration}
                    name={c.shot.name}
                >
                    <ShotView shot={c} beats={beats} resolution={resolution} />
                </Sequence>
            ))}
            {shots.map((c) => {
                const colour = c.shot.colour ?? PAPER
                if (c.enter === "flash") {
                    return (
                        <Sequence
                            key={`cut-${c.index}`}
                            from={c.from}
                            name="Flash"
                        >
                            {/* One solid frame, then the colour fading
                                off the board's white (its black stays). */}
                            <Flash
                                at={0}
                                colour={colour === INK ? PAPER : colour}
                                hold={1}
                                fade={0}
                            />
                            <Flash
                                at={1}
                                colour={colour}
                                hold={1}
                                fade={4}
                                blend="multiply"
                            />
                        </Sequence>
                    )
                }
                if (c.enter === "wipe") {
                    return (
                        <Sequence
                            key={`cut-${c.index}`}
                            from={c.from - TRANSITION_FRAMES}
                            durationInFrames={TRANSITION_FRAMES * 2}
                            name="Wipe"
                        >
                            <ColourWipe
                                at={TRANSITION_FRAMES}
                                colour={colour}
                            />
                        </Sequence>
                    )
                }
                return null
            })}
        </AbsoluteFill>
    )
}

function ShotView({
    shot: c,
    beats,
    resolution,
}: {
    shot: CompiledShot
    beats: Beats
    resolution: number
}) {
    const frame = useCurrentFrame()
    const { shot } = c
    if (shot.kind === "card") {
        const look = LOOKS[shot.animal]
        return (
            <Whip duration={c.duration} enter={c.enter} exit={c.exit}>
                <SlamCard
                    look={look}
                    at={c.beats[0] ?? 0}
                    beat={beats.beatFrames}
                    pulse={beats.pulse(frame + c.from)}
                />
            </Whip>
        )
    }
    const game = c.game
    if (!game) return null
    const colour = shot.colour ?? PAPER
    const shake = shot.shake ?? 1
    return (
        <AbsoluteFill style={{ backgroundColor: PAPER }}>
            <Whip duration={c.duration} enter={c.enter} exit={c.exit}>
                <Shake
                    impacts={
                        shake > 0 ? [{ frame: game.hero, strength: shake }] : []
                    }
                >
                    <GameplayClip
                        recording={shot.recording}
                        time={game.time}
                        camera={game.camera}
                        resolution={resolution}
                    />
                    {/* The hero moment in the character's colour: the
                        board's white turns to it, its black stays. */}
                    <Flash
                        at={game.hero}
                        colour={colour}
                        blend="multiply"
                        hold={2}
                        fade={6}
                    />
                </Shake>
                {shot.caption && (
                    <SlamCaption
                        text={shot.caption}
                        at={game.hero}
                        colour={colour}
                    />
                )}
            </Whip>
        </AbsoluteFill>
    )
}
