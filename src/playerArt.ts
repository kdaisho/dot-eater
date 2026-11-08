// The soundtrack player's (KDA-332) picture for each track: one of the
// game's sprites on a coloured square, for the list, the now-playing panel
// and the car's or lock screen's display (Media Session artwork). No DOM
// access here: playerPage.ts draws the dots.

import { MusicTrackId } from "./music"
import { SpriteId, spritePixels, type Dots } from "./sprites"

export type TrackArt = { sprite: SpriteId; background: string }

export const TRACK_ART: Readonly<Partial<Record<MusicTrackId, TrackArt>>> = {
    [MusicTrackId.opening]: { sprite: SpriteId.dragon, background: "#3a2a6b" },
    [MusicTrackId.stage1]: { sprite: SpriteId.fox, background: "#1f4f8f" },
    [MusicTrackId.stage2]: { sprite: SpriteId.snake, background: "#245e3a" },
    [MusicTrackId.stage3]: { sprite: SpriteId.penguin, background: "#2a7aa0" },
    [MusicTrackId.stage4]: { sprite: SpriteId.owl, background: "#4a4f5c" },
    [MusicTrackId.stage5]: { sprite: SpriteId.oni, background: "#7a2a2a" },
    [MusicTrackId.stage6]: { sprite: SpriteId.ghost, background: "#3b2550" },
    [MusicTrackId.stage7]: { sprite: SpriteId.robot, background: "#3c4a3a" },
    [MusicTrackId.stage8]: { sprite: SpriteId.wolf, background: "#355a72" },
    [MusicTrackId.stage9]: { sprite: SpriteId.tengu, background: "#6b3a1f" },
    [MusicTrackId.stage10]: {
        sprite: SpriteId.finalBoss,
        background: "#4a1030",
    },
    [MusicTrackId.endRoll]: { sprite: SpriteId.kitsune, background: "#6b5a1f" },
}

const FALLBACK: TrackArt = { sprite: SpriteId.dragon, background: "#333" }

export function trackArt(track: MusicTrackId): TrackArt {
    return TRACK_ART[track] ?? FALLBACK
}

// The track's sprite as dots, with the game's black outline.
export function trackDots(track: MusicTrackId): Dots {
    return spritePixels({ id: trackArt(track).sprite })
}
