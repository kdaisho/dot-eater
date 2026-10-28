import { useLayoutEffect, useMemo, useRef } from "react"
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion"
import { gameOf } from "../../src/flow"
import type { Recording } from "../../src/replay"
import { createRenderer, type Renderer } from "../../src/render"
import {
    clampCamera,
    overview,
    placement,
    type CameraContext,
    type CameraFn,
} from "./camera"
import { hudFor, rulesOf } from "./hud"
import { boardOf, replayerFor, trackOf } from "./replayers"
import { gameTimeFor, type TimeMap } from "./time"

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
    const rendererRef = useRef<Renderer | null>(null)
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
        let renderer = rendererRef.current
        if (!renderer) {
            // A huge window, so the cells come out at MAX_CELL, and the
            // resolution as its pixel ratio.
            renderer = createRenderer(canvas, {
                view: {
                    innerWidth: 1e5,
                    innerHeight: 1e5,
                    devicePixelRatio: resolution,
                },
            })
            rendererRef.current = renderer
        }
        const replayer = replayerFor(recording)
        const { tick, alpha } = gameTimeFor(frame, time)
        const screen = replayer.at(tick)
        const game = gameOf(screen)
        if (!game) {
            renderer.clear()
        } else {
            // Glides only move on during play and the ending outro, and not
            // past the recording's end, which holds still (as main does).
            const moving =
                tick < replayer.length &&
                (screen.kind === "playing" || screen.kind === "ending")
            renderer.draw(
                game,
                moving ? alpha : 0,
                hudFor(game, screen),
                rulesOf(screen)
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
