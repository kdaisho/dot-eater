import { useMemo } from "react"
import {
    GOLD,
    logoPalette,
    logoText,
    menuText,
    type LogoPalette,
    type PixelArt,
} from "./pixelType"

// Pixel art (pixelType.ts) as crisp SVG, fitted in `width` x `height`
// pixels at most, keeping its shape.
export function PixelArtView({
    art,
    width,
    height,
}: {
    art: PixelArt
    width: number
    height: number
}) {
    const scale = Math.min(width / art.width, height / art.height)
    return (
        <svg
            width={art.width * scale}
            height={art.height * scale}
            viewBox={`0 0 ${art.width} ${art.height}`}
            shapeRendering="crispEdges"
            style={{ display: "block", overflow: "visible" }}
        >
            {art.rects.map((r, i) => (
                <rect
                    key={i}
                    x={r.x}
                    y={r.y}
                    width={r.w + 0.02}
                    height={r.h + 0.02}
                    fill={r.colour}
                />
            ))}
        </svg>
    )
}

// A word in the logo's 3D block letters: gold, or lit in `colour`, or in
// `palette`.
export function LogoWord({
    text,
    width,
    height,
    colour,
    palette,
    dot = false,
}: {
    text: string
    width: number
    height: number
    colour?: string
    palette?: LogoPalette
    // Each O as the logo's dot (see logoText).
    dot?: boolean
}) {
    const art = useMemo(
        () =>
            logoText(
                text,
                palette ?? (colour ? logoPalette(colour) : GOLD),
                dot
            ),
        [text, colour, palette, dot]
    )
    return <PixelArtView art={art} width={width} height={height} />
}

// A word in the title menu's pixel font.
export function MenuWord({
    text,
    width,
    height,
    colour,
    shadow,
}: {
    text: string
    width: number
    height: number
    colour: string
    shadow?: string
}) {
    const art = useMemo(
        () => menuText(text, colour, shadow),
        [text, colour, shadow]
    )
    return <PixelArtView art={art} width={width} height={height} />
}
