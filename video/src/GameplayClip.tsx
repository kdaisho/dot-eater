import { useLayoutEffect, useMemo, useRef } from "react"
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion"
import { gameOf } from "../../src/flow"
import { levels } from "../../src/levels"
import type { Recording } from "../../src/replay"
import { hudOf, rulesOf, screenEffects } from "../../src/scene"
import { defaultSettings } from "../../src/settings"
import {
    clampCamera,
    drawTime,
    overview,
    placement,
    type CameraContext,
    type CameraFn,
} from "./camera"
import { effectsAt } from "./effects"
import { rendererFor, type RendererSlot } from "./rendererSlot"
import { boardOf, replayerFor, runOf, trackOf } from "./replayers"
import type { TimeMap } from "./time"

// The facing guide a player with default settings sees (see settings.ts).
const GUIDE = defaultSettings().facingGuide

export type GameplayClipProps = {
    // The run to show.
    recording: Recording
    // Which game time each frame shows (see time.ts).
    time: TimeMap
    // Where the camera looks on each frame; the whole board when left out.
    camera?: CameraFn
    // Device pixels per CSS pixel of the game's own canvas, whose cells are
    // MAX_CELL (48) CSS pixels: 4 makes 192-pixel cells, sharp up to about
    // 3x zoom on a 1080p frame.
    resolution?: number
}

// Real gameplay: the recording replayed to the frame's game time (through
// the game's own logic) and drawn by the game's own renderer, then placed
// in the frame by the camera.
export function GameplayClip({
    recording,
    time,
    camera = overview,
    resolution = 4,
}: GameplayClipProps) {
    const frame = useCurrentFrame()
    const { width, height } = useVideoConfig()
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const slot = useRef<RendererSlot["current"]>(null)
    const board = useMemo(() => boardOf(recording), [recording])

    const context: CameraContext = {
        time,
        board,
        track: () => trackOf(recording),
    }
    const view = clampCamera(camera(frame, context), board, { width, height })
    const place = placement(view, board, { width, height })

    useLayoutEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const renderer = rendererFor(slot, canvas, resolution)
        const replayer = replayerFor(recording)
        const run = runOf(recording)
        // Paused and end screens keep the last alpha of play (see drawTime).
        const { tick, alpha } = drawTime(frame, time, run.track)
        const screen = replayer.at(tick)
        const game = gameOf(screen)
        if (!game) {
            renderer.clear()
        } else {
            // What main's render() draws, with a default-settings player's
            // facing guide, and the particles and shake worked out for
            // this moment (see effects.ts).
            const effects = effectsAt(
                run.ticks,
                recording.seed,
                game,
                tick,
                alpha
            )
            renderer.draw(
                game,
                alpha,
                hudOf(game, screen),
                rulesOf(screen, levels),
                screenEffects(screen, {
                    particles: effects.particles,
                    shake: () => effects.shake,
                    guide: GUIDE,
                })
            )
        }
        // The renderer sizes the canvas for a window; the wrapper sizes it
        // for the frame instead.
        canvas.style.width = "100%"
        canvas.style.height = "100%"
    }, [frame, recording, time, resolution])

    return (
        <AbsoluteFill style={{ backgroundColor: "#fff", overflow: "hidden" }}>
            <div
                style={{
                    position: "absolute",
                    left: place.left,
                    top: place.top,
                    width: place.width,
                    height: place.height,
                }}
            >
                <canvas
                    ref={canvasRef}
                    style={{ display: "block", width: "100%", height: "100%" }}
                />
            </div>
        </AbsoluteFill>
    )
}
