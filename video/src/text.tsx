import type { CSSProperties, ReactNode } from "react"
import {
    AbsoluteFill,
    interpolate,
    spring,
    useCurrentFrame,
    useVideoConfig,
} from "remotion"

// Shared type and colours: the game's clean black-and-white look.
export const INK = "#000"
export const PAPER = "#fff"
export const FONT =
    '"Helvetica Neue", Helvetica, Arial, "Apple Color Emoji", "Noto Color Emoji", sans-serif'

// Something that pops in at frame `at` (of the enclosing Sequence): it
// springs up from small with a little overshoot, on the beat.
export function Pop({
    at = 0,
    children,
    style,
}: {
    at?: number
    children: ReactNode
    style?: CSSProperties
}) {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const t = spring({
        frame: frame - at,
        fps,
        config: { damping: 11, stiffness: 220, mass: 0.6 },
    })
    const scale = interpolate(t, [0, 1], [0.4, 1])
    const opacity = interpolate(frame - at, [0, 2], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    })
    return (
        <div
            style={{
                transform: `scale(${scale})`,
                opacity,
                fontFamily: FONT,
                ...style,
            }}
        >
            {children}
        </div>
    )
}

// One big punchy word over gameplay, popping in at `at` and gone at
// `until` (frames of the enclosing Sequence).
export function Caption({
    text,
    at = 0,
    until = Infinity,
    position = "bottom",
}: {
    text: string
    at?: number
    until?: number
    position?: "top" | "bottom" | "center"
}) {
    const frame = useCurrentFrame()
    if (frame < at || frame >= until) return null
    const justify =
        position === "top"
            ? "flex-start"
            : position === "bottom"
              ? "flex-end"
              : "center"
    return (
        <AbsoluteFill
            style={{
                justifyContent: justify,
                alignItems: "center",
                padding: 70,
                pointerEvents: "none",
            }}
        >
            <Pop at={at}>
                <div
                    style={{
                        backgroundColor: INK,
                        color: PAPER,
                        fontSize: 120,
                        fontWeight: 900,
                        letterSpacing: -2,
                        lineHeight: 1,
                        padding: "18px 40px 24px",
                        textTransform: "uppercase",
                    }}
                >
                    {text}
                </div>
            </Pop>
        </AbsoluteFill>
    )
}
