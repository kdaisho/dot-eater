import {
    AbsoluteFill,
    interpolate,
    useCurrentFrame,
    useVideoConfig,
} from "remotion"
import { EASE_IN_OUT } from "./camera"
import { FONT, INK, PAPER, Pop } from "./text"

const DOTS = 9

// The opening title: big words popping in one per beat, then a row of dots
// that the player's animal eats across the screen.
export function TitleCard({
    words = ["Dot", "Eater"],
    beat = 12,
    start = 0,
    sprite = "🐉",
}: {
    // The words, one per beat.
    words?: readonly string[]
    // Frames per beat.
    beat?: number
    // The frame the first word lands on.
    start?: number
    // Who eats the dots.
    sprite?: string
}) {
    const frame = useCurrentFrame()
    const { width } = useVideoConfig()
    // The row starts on the beat after the last word and takes 3 beats.
    const rowStart = start + words.length * beat
    const progress = interpolate(
        frame,
        [rowStart, rowStart + 3 * beat],
        [0, 1],
        {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE_IN_OUT,
        }
    )
    const rowWidth = width * 0.6
    const eaterX = -60 + progress * (rowWidth + 120)
    return (
        <AbsoluteFill
            style={{
                backgroundColor: PAPER,
                color: INK,
                justifyContent: "center",
                alignItems: "center",
                fontFamily: FONT,
            }}
        >
            <div style={{ display: "flex", gap: 48 }}>
                {words.map((word, i) => (
                    <Pop
                        // By place: a word may come twice.
                        key={i}
                        at={start + i * beat}
                        style={{
                            fontSize: 260,
                            fontWeight: 900,
                            letterSpacing: -4,
                            lineHeight: 1,
                            textTransform: "uppercase",
                        }}
                    >
                        {word}
                    </Pop>
                ))}
            </div>
            <div
                style={{
                    position: "relative",
                    width: rowWidth,
                    height: 90,
                    marginTop: 60,
                    opacity: frame >= rowStart ? 1 : 0,
                }}
            >
                {Array.from({ length: DOTS }, (_, i) => {
                    const x = ((i + 0.5) / DOTS) * rowWidth
                    return eaterX < x ? (
                        <div
                            key={i}
                            style={{
                                position: "absolute",
                                left: x - 9,
                                top: 36,
                                width: 18,
                                height: 18,
                                backgroundColor: INK,
                            }}
                        />
                    ) : null
                })}
                <div
                    style={{
                        position: "absolute",
                        left: eaterX - 45,
                        top: 0,
                        fontSize: 80,
                        lineHeight: "90px",
                        // Emoji face left; the eater runs right.
                        transform: "scaleX(-1)",
                    }}
                >
                    {sprite}
                </div>
            </div>
        </AbsoluteFill>
    )
}
