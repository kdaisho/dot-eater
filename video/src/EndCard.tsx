import { AbsoluteFill } from "remotion"
import { FONT, INK, PAPER, Pop } from "./text"

// The closing card: the call to action, where to play, and how. Each line
// pops in a beat after the one before.
export function EndCard({
    beat = 12,
    start = 0,
}: {
    // Frames per beat.
    beat?: number
    // The frame the first line lands on.
    start?: number
}) {
    return (
        <AbsoluteFill
            style={{
                backgroundColor: INK,
                color: PAPER,
                justifyContent: "center",
                alignItems: "center",
                fontFamily: FONT,
                gap: 36,
            }}
        >
            <Pop
                at={start}
                style={{
                    fontSize: 240,
                    fontWeight: 900,
                    letterSpacing: -4,
                    lineHeight: 1,
                    textTransform: "uppercase",
                }}
            >
                Play free
            </Pop>
            <Pop
                at={start + beat}
                style={{
                    fontSize: 72,
                    fontWeight: 700,
                    backgroundColor: PAPER,
                    color: INK,
                    padding: "10px 32px 16px",
                }}
            >
                kdaisho.github.io/dot-eater
            </Pop>
            <Pop
                at={start + 2 * beat}
                style={{ fontSize: 48, fontWeight: 500, letterSpacing: 2 }}
            >
                Keyboard · Gamepad
            </Pop>
        </AbsoluteFill>
    )
}
