import { MusicTrackId, stageTrack } from "../../src/music"
import { eventSounds } from "../../src/sound"
import type { SfxId } from "../../src/sfx"
import type { TickLog } from "./replayers"
import { frameAtTick, gameTimeAt, ticksPerFrame, type TimeMap } from "./time"

// What the promo sounds like, as data: when each of the game's sound
// effects plays and which of its tunes plays when, in seconds of video.
// Pure: scripts/render-audio.ts renders it to WAV files with the game's own
// audio code, and Promo.tsx plays those.

// The rendered audio, in video/public/ (made by render-audio, gitignored).
export const AUDIO_FILES = {
    effects: "audio/effects.wav",
    music: "audio/music.wav",
} as const

// The mix, as gains on the game's tone volumes (sfx.ts, music.ts) and the
// song. The game's tones are quiet on their own (it leaves headroom for
// many at once), so the effects are lifted to peak around -7 dBFS, clear
// over a song at about -20 LUFS (a typical master, -9 to -10 LUFS, at
// 0.3). The game's music sits under the effects, as in the game. Measured
// with ffmpeg's ebur128 filter; the mix peaks well under 0 dBFS.
export const MIX = {
    effects: 3,
    gameMusic: 0.5,
    song: 0.3,
} as const

// A clip's place in the video: its time mapping and its frames in the
// composition.
export type ClipTiming = {
    time: TimeMap
    // The composition frame the clip's first frame is on.
    from: number
    // How many frames it shows.
    duration: number
}

export type SfxCue = {
    // Seconds from the start of the video.
    at: number
    id: SfxId
}

// The sound effects of a clip: each tick that stepped the game (see
// TickLog.events) plays eventSounds(events) on the first frame that shows
// it, as the game plays them when it draws that tick. Ticks the clip never
// shows (already done on its first frame, or past its last) play nothing.
// In slow motion the ticks land further apart, so the sounds do too, each
// at its own pitch and length. An effect is played once per frame, as the
// game plays one asked for twice at the same moment once.
export function sfxTimeline(
    clip: ClipTiming,
    ticks: readonly Pick<TickLog, "events">[]
): SfxCue[] {
    const { fps } = clip.time
    const shownFrom = gameTimeAt(0, clip.time)
    const cues: SfxCue[] = []
    const played = new Set<string>()
    for (const [tick, log] of ticks.entries()) {
        if (log.events.length === 0 || tick <= shownFrom) continue
        const frame = frameAtTick(tick, clip.time, clip.duration + 1)
        if (frame >= clip.duration) continue
        for (const id of eventSounds(log.events)) {
            const key = `${frame} ${id}`
            if (played.has(key)) continue
            played.add(key)
            cues.push({ at: (clip.from + frame) / fps, id })
        }
    }
    return cues
}

export type MusicSection = {
    track: MusicTrackId
    // Seconds from the start of the video; the tune starts from its own
    // start at `from` and is cut (with a short fade) at `to`.
    from: number
    to: number
}

// The game's own music for the promo, in real video time (it doesn't slow
// down with the game): the title tune over the title card, the stage's
// tune over the run (until the run leaves play, when the game stops its
// music for the stage clear or game over jingle), and the title tune again
// over the end card.
export function musicSections(options: {
    fps: number
    clip: ClipTiming
    // The stage the run is on.
    level: number
    ticks: readonly Pick<TickLog, "kind">[]
    // The video's length, in frames.
    duration: number
}): MusicSection[] {
    const { fps, clip, level, ticks, duration } = options
    const clipEnd = clip.from + clip.duration
    const leaves = ticks.findIndex((t) => t.kind !== "playing")
    const stageEnd =
        leaves < 0
            ? clipEnd
            : Math.min(
                  clipEnd,
                  clip.from + frameAtTick(leaves, clip.time, clip.duration)
              )
    const sections: MusicSection[] = [
        { track: MusicTrackId.title, from: 0, to: clip.from },
        { track: stageTrack(level), from: clip.from, to: stageEnd },
        { track: MusicTrackId.title, from: clipEnd, to: duration },
    ].map((s) => ({ ...s, from: s.from / fps, to: s.to / fps }))
    return sections.filter((s) => s.to > s.from)
}

// How far the music dips at the slowest slow motion (speed 0): to 1 - DIP.
export const DIP = 0.3
// Frames the music fades out over at the end of the video.
export const FADE_OUT = 45

// The music's volume on a video frame, as a share of its level: a gentle
// dip while the clip plays slower than real time (deeper the slower), and
// a fade to silence over the video's last FADE_OUT frames.
export function musicVolume(
    frame: number,
    clip: ClipTiming,
    duration: number
): number {
    let volume = 1
    const local = frame - clip.from
    if (local >= 0 && local < clip.duration) {
        const rate = ticksPerFrame(clip.time.fps)
        const speed =
            (gameTimeAt(local + 1, clip.time) - gameTimeAt(local, clip.time)) /
            rate
        volume *= 1 - DIP * Math.max(0, 1 - Math.min(speed, 1))
    }
    const left = duration - frame
    if (left < FADE_OUT) volume *= Math.max(0, left / FADE_OUT)
    return volume
}
