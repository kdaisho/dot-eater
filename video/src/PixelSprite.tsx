import { useMemo } from "react"
import { spritePixels, type SpriteLook } from "../../src/sprites"

// A sprite from the game (sprites.ts) drawn as crisp SVG squares, its
// longer side `size` pixels, with the game's 1-dot outline in `outline`.
export function PixelSprite({
    look,
    size,
    outline = true,
}: {
    look: SpriteLook
    size: number
    outline?: boolean | string
}) {
    const dots = useMemo(() => spritePixels(look, outline), [look, outline])
    const h = dots.length
    const w = dots[0]?.length ?? 0
    const dot = size / Math.max(w, h, 1)
    return (
        <svg
            width={w * dot}
            height={h * dot}
            viewBox={`0 0 ${w} ${h}`}
            shapeRendering="crispEdges"
            style={{ display: "block" }}
        >
            {dots.flatMap((row, y) =>
                row.map((colour, x) =>
                    colour === null ? null : (
                        <rect
                            key={`${x},${y}`}
                            x={x}
                            y={y}
                            width={1.02}
                            height={1.02}
                            fill={colour}
                        />
                    )
                )
            )}
        </svg>
    )
}
