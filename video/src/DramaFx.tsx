import { useId, type CSSProperties, type ReactNode } from "react"
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion"
import {
    flashAt,
    shakeAt,
    slamAt,
    whipAt,
    wipeAt,
    type Impact,
    type ShakeOptions,
    type Transition,
} from "./drama"
import { DISPLAY, INK, MONO, PAPER, type CharacterLook } from "./palette"

// The edit's drama as components. Each reads the frame of its enclosing
// Sequence and draws from the pure maths in drama.ts.

// Shakes its children on each impact.
export function Shake({
    impacts,
    options,
    children,
}: {
    impacts: readonly Impact[]
    options?: ShakeOptions
    children: ReactNode
}) {
    const frame = useCurrentFrame()
    const { x, y, rotate } = shakeAt(frame, impacts, options)
    return (
        <AbsoluteFill
            style={{
                // A touch bigger, so the shaken edges never show.
                transform: `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${x || y ? 1.08 : 1})`,
            }}
        >
            {children}
        </AbsoluteFill>
    )
}

// A full-frame flash of `colour` on frame `at`. With blend "multiply" the
// colour tints the white of the board and keeps the black: the game's
// look, in the character's colour, for a beat.
export function Flash({
    at,
    colour = PAPER,
    hold = 1,
    fade = 4,
    blend = "normal",
}: {
    at: number
    colour?: string
    hold?: number
    fade?: number
    blend?: "normal" | "multiply" | "screen"
}) {
    const frame = useCurrentFrame()
    const opacity = flashAt(frame, at, { hold, fade })
    if (opacity <= 0) return null
    return (
        <AbsoluteFill
            style={{
                backgroundColor: colour,
                opacity,
                mixBlendMode: blend,
                pointerEvents: "none",
            }}
        />
    )
}

// A panel of `colour` sweeping across the cut on frame `at`, with a black
// leading edge.
export function ColourWipe({
    at,
    colour,
    frames,
}: {
    at: number
    colour: string
    frames?: number
}) {
    const frame = useCurrentFrame()
    const { width } = useVideoConfig()
    const wipe = wipeAt(frame, at, frames)
    if (!wipe) return null
    const left = wipe.left * width
    const right = wipe.right * width
    return (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left,
                    width: Math.max(0, right - left),
                    backgroundColor: colour,
                    // Slanted, for speed.
                    transform: "skewX(-12deg) scaleX(1.25)",
                    transformOrigin: "center",
                    borderRight: `${right < width ? 28 : 0}px solid ${INK}`,
                }}
            />
        </AbsoluteFill>
    )
}

// Whips its children in and out over the cuts of a shot `duration`
// frames long (see whipAt), with a horizontal motion blur.
export function Whip({
    duration,
    enter,
    exit,
    children,
}: {
    duration: number
    enter: Transition
    exit: Transition
    children: ReactNode
}) {
    const frame = useCurrentFrame()
    const { width } = useVideoConfig()
    const id = `whip-${useId().replace(/:/g, "")}`
    const { offset, blur } = whipAt(frame, duration, enter, exit)
    if (offset === 0 && blur === 0) return <>{children}</>
    return (
        <AbsoluteFill>
            <svg width="0" height="0" style={{ position: "absolute" }}>
                <filter id={id} x="-50%" y="0" width="200%" height="100%">
                    <feGaussianBlur stdDeviation={`${blur * 90} 0`} />
                </filter>
            </svg>
            {/* The picture, and a copy a frame-width behind it, so the
                pan never shows an empty edge. */}
            {[0, offset < 0 ? 1 : -1].map((tile) => (
                <AbsoluteFill
                    key={tile}
                    style={{
                        transform: `translateX(${(offset + tile) * width}px)`,
                        filter: `url(#${id})`,
                    }}
                >
                    {children}
                </AbsoluteFill>
            ))}
        </AbsoluteFill>
    )
}

// Text that pulses on the beat: `pulse` is the beat envelope (0–1), e.g.
// beats.pulse(frame).
export function PulseText({
    pulse,
    amount = 0.12,
    style,
    children,
}: {
    pulse: number
    amount?: number
    style?: CSSProperties
    children: ReactNode
}) {
    return (
        <div
            style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.04em",
                lineHeight: 0.9,
                transform: `scale(${1 + amount * pulse})`,
                ...style,
            }}
        >
            {children}
        </div>
    )
}

// Something slamming in on frame `at` (see slamAt).
export function Slam({
    at,
    from,
    tilt,
    style,
    children,
}: {
    at: number
    from?: number
    tilt?: number
    style?: CSSProperties
    children: ReactNode
}) {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const s = slamAt(frame, at, fps, {
        ...(from !== undefined && { from }),
        ...(tilt !== undefined && { tilt }),
    })
    return (
        <div
            style={{
                transform: `scale(${s.scale}) rotate(${s.rotate}deg)`,
                opacity: s.opacity,
                ...style,
            }}
        >
            {children}
        </div>
    )
}

// A caption slamming in at `at` over gameplay: the character's colour
// on black, in a slanted block.
export function SlamCaption({
    text,
    at,
    colour,
    position = "bottom",
}: {
    text: string
    at: number
    colour: string
    position?: "top" | "bottom"
}) {
    const frame = useCurrentFrame()
    if (frame < at) return null
    return (
        <AbsoluteFill
            style={{
                justifyContent: position === "top" ? "flex-start" : "flex-end",
                alignItems: "center",
                padding: 80,
                pointerEvents: "none",
            }}
        >
            <Slam at={at} from={1.9} tilt={-4}>
                <div
                    style={{
                        fontFamily: DISPLAY,
                        fontWeight: 900,
                        fontSize: 150,
                        lineHeight: 1,
                        letterSpacing: "-0.04em",
                        textTransform: "uppercase",
                        color: colour,
                        backgroundColor: INK,
                        padding: "14px 44px 24px",
                        transform: "skewX(-8deg)",
                        boxShadow: `14px 14px 0 ${PAPER}`,
                    }}
                >
                    {text}
                </div>
            </Slam>
        </AbsoluteFill>
    )
}

// The character name slam: on black, the giant emoji slams in on frame
// `at`, the NAME a beat later, the ability word (in the character's
// colour) a beat after that, each with a jolt, a flash of colour and an
// overshooting spring; `pulse` (0–1) then keeps it breathing on the beat.
export function SlamCard({
    look,
    at = 0,
    beat,
    pulse = 0,
}: {
    look: CharacterLook
    at?: number
    // Frames per beat.
    beat: number
    pulse?: number
}) {
    const frame = useCurrentFrame()
    const hits = [at, at + beat, at + 2 * beat].map(Math.round)
    // The ability word turns the card to the character's colour.
    const flipped = frame >= hits[2]
    return (
        <AbsoluteFill style={{ backgroundColor: flipped ? look.colour : INK }}>
            <Shake
                impacts={hits.map((f, i) => ({
                    frame: f,
                    strength: 0.6 + 0.3 * i,
                }))}
            >
                <AbsoluteFill
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 56,
                        transform: `scale(${1 + 0.03 * pulse})`,
                    }}
                >
                    <Slam at={hits[0]} from={4} tilt={-14}>
                        <div
                            style={{
                                fontSize: 520,
                                lineHeight: 1,
                                fontFamily: DISPLAY,
                                filter: `drop-shadow(22px 22px 0 ${flipped ? INK : look.colour})`,
                            }}
                        >
                            {look.emoji}
                        </div>
                    </Slam>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: 18,
                        }}
                    >
                        <Slam at={hits[1]} from={3} tilt={6}>
                            <div
                                style={{
                                    fontFamily: DISPLAY,
                                    fontWeight: 900,
                                    fontSize: 250,
                                    lineHeight: 0.86,
                                    letterSpacing: "-0.05em",
                                    color: flipped ? INK : PAPER,
                                }}
                            >
                                {look.name}
                            </div>
                        </Slam>
                        <Slam at={hits[2]} from={3.6} tilt={-8}>
                            <div
                                style={{
                                    fontFamily: MONO,
                                    fontWeight: 800,
                                    fontSize: 200,
                                    lineHeight: 1,
                                    letterSpacing: "-0.02em",
                                    color: PAPER,
                                    backgroundColor: INK,
                                    padding: "6px 34px 14px",
                                    transform: "skewX(-8deg)",
                                }}
                            >
                                {look.ability}
                            </div>
                        </Slam>
                    </div>
                </AbsoluteFill>
            </Shake>
            {/* One hard frame of flash per hit, no grey fade. */}
            <Flash at={hits[0]} colour={look.colour} hold={1} fade={0} />
            <Flash at={hits[1]} colour={PAPER} hold={1} fade={0} />
            <Flash at={hits[2]} colour={PAPER} hold={1} fade={0} />
        </AbsoluteFill>
    )
}

// Black bars closing in from the top and bottom: `amount` 0 is none, 1 a
// 2.39:1 frame.
export function Letterbox({ amount }: { amount: number }) {
    const { width, height } = useVideoConfig()
    const bar = (Math.max(0, height - width / 2.39) / 2) * Math.min(1, amount)
    if (bar <= 0) return null
    const style: CSSProperties = {
        position: "absolute",
        left: 0,
        right: 0,
        height: bar,
        backgroundColor: INK,
    }
    return (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
            <div style={{ ...style, top: 0 }} />
            <div style={{ ...style, bottom: 0 }} />
        </AbsoluteFill>
    )
}

// Darkened (or coloured) edges, for the boss: `strength` 0–1.
export function Vignette({
    strength,
    colour = INK,
}: {
    strength: number
    colour?: string
}) {
    if (strength <= 0) return null
    return (
        <AbsoluteFill
            style={{
                pointerEvents: "none",
                opacity: Math.min(1, strength),
                background: `radial-gradient(ellipse at center, transparent 45%, ${colour} 120%)`,
            }}
        />
    )
}
