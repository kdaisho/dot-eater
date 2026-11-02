// A song's beat grid and structure, and the frame maths an edit cuts to.
//
// `pnpm analyze-track` (scripts/analyze-track.ts) measures a song and writes
// a BeatsFile next to it in public/music/ (gitignored, like the song). A
// composition loads it (loadBeats.ts) and wraps it in a Beats object, which
// answers "which frame is beat n, bar n, the drop" and gives a pulse on the
// beat for effects. Without a beats file, fallbackBeats makes a plain grid,
// so a fresh clone still renders.
//
// Pure: no Remotion, no bundler, so the analyser script (in Node) shares the
// types and the tests run it directly.

export type SectionLabel =
    | "intro"
    | "verse"
    | "hook"
    | "build"
    | "drop"
    | "breakdown"
    | "groove"
    | "outro"

export type Section = {
    label: SectionLabel
    // Sections with the same group letter sound alike (chroma, timbre,
    // drums): a hook comes back with its letter.
    group: string
    // Seconds into the song, on downbeats (end: the next section's start,
    // or the song's end).
    start: number
    end: number
    // Bar indices into BeatsFile.downbeats ([startBar, endBar)).
    startBar: number
    endBar: number
    // Mean loudness of its bars, 0–1 (see Bar.loudness).
    energy: number
    // How sure the analyser is that a section starts here, 0–1: how strong
    // the change in sound is at its first bar.
    confidence: number
}

export type Bar = {
    // Seconds into the song: the bar's downbeat.
    start: number
    // 0–1 across the song (5th to 95th percentile): RMS and low band mixed.
    loudness: number
    // dBFS of the bar's RMS and of its low band (below 150 Hz).
    rms: number
    low: number
    // Onsets in the vocal band (300 Hz–3 kHz) per beat, a rough measure of
    // how busy the vocals or lead are.
    density: number
}

export type BeatsFile = {
    version: 1
    // The song's file name in public/music/, or "fallback".
    track: string
    // The song's length, in seconds.
    duration: number
    bpm: number
    // One beat, in seconds (60 / bpm).
    beatPeriod: number
    beatsPerBar: number
    // Every beat and every downbeat (bar start), in seconds into the song.
    beats: readonly number[]
    downbeats: readonly number[]
    bars: readonly Bar[]
    sections: readonly Section[]
    // The strongest lift: the start of the section that jumps up the most
    // (the drop of a dance track, the hook landing in hip-hop).
    drop: { time: number; bar: number; section: number }
}

// A plain grid when no song has been analysed: `bars` bars of 4/4 at `bpm`
// from `offset` s, with an intro, a build, a drop and an outro, so edits cut
// on something sensible. Give a song's measured tempo and first downbeat
// (see SONG_GRIDS in excerpts.ts) and a fresh clone cuts on the same frames
// as a checkout with the song.
export function fallbackBeats({
    bpm = 120,
    bars = 32,
    offset = 0,
}: { bpm?: number; bars?: number; offset?: number } = {}): BeatsFile {
    const beatPeriod = 60 / bpm
    const beatsPerBar = 4
    const barSeconds = beatPeriod * beatsPerBar
    const beats = Array.from({ length: bars * beatsPerBar }, (_, i) =>
        round(offset + i * beatPeriod)
    )
    const downbeats = Array.from({ length: bars }, (_, i) =>
        round(offset + i * barSeconds)
    )
    const plan: [SectionLabel, number][] = [
        ["intro", 0],
        ["build", Math.round(bars * 0.25)],
        ["drop", Math.round(bars * 0.5)],
        ["outro", Math.round(bars * 0.875)],
    ]
    const sections = plan.map(([label, startBar], i): Section => {
        const endBar = plan[i + 1]?.[1] ?? bars
        return {
            label,
            group: String.fromCharCode(65 + i),
            start: downbeats[startBar] ?? round(offset),
            end: downbeats[endBar] ?? round(offset + bars * barSeconds),
            startBar,
            endBar,
            energy: label === "drop" ? 1 : label === "build" ? 0.6 : 0.3,
            confidence: 1,
        }
    })
    const energyAt = (bar: number) =>
        sections.find((s) => bar >= s.startBar && bar < s.endBar)?.energy ?? 0
    return {
        version: 1,
        track: "fallback",
        duration: round(offset + bars * barSeconds),
        bpm,
        beatPeriod,
        beatsPerBar,
        beats,
        downbeats,
        bars: downbeats.map((start, i) => ({
            start,
            loudness: energyAt(i),
            rms: -20,
            low: -20,
            density: 1,
        })),
        sections,
        drop: {
            time: sections[2].start,
            bar: sections[2].startBar,
            section: 2,
        },
    }
}

function round(seconds: number): number {
    return Math.round(seconds * 1e4) / 1e4
}

// ---- Frames ----

export type BeatsOptions = {
    fps: number
    // Where in the song the video's frame 0 is, in seconds.
    start?: number
}

export type Beat = {
    // Beat index (beat 0 is the first at or after the start).
    n: number
    // Its frame (fractional).
    frame: number
    downbeat: boolean
}

export type PulseOptions = {
    // Frames for the pulse to fall to about a third (1/e).
    decay?: number
    // The peak on a beat that isn't a downbeat (downbeats peak at 1).
    offbeat?: number
}

export type Beats = {
    file: BeatsFile
    fps: number
    // Seconds into the song at frame 0.
    start: number
    bpm: number
    // One beat and one bar, in frames (fractional).
    beatFrames: number
    barFrames: number
    // The frame (fractional) of beat n / bar n, counted from the first at
    // or after the start. Fractions go between (beatFrame(0.5) is the "and"
    // of beat 0); indices past the grid's ends follow its tempo.
    beatFrame(n: number): number
    barFrame(n: number): number
    // The beat index of a frame (fractional): the inverse of beatFrame.
    beatAt(frame: number): number
    // The frames of the `nth` (0 first) section labelled `label`, or
    // undefined. Before the start they are negative.
    sectionFrames(
        label: SectionLabel,
        nth?: number
    ): { from: number; to: number } | undefined
    // The frame of the strongest drop.
    dropFrame: number
    // The beat nearest to `frame`.
    nearestBeat(frame: number): Beat
    // 0–1: jumps to 1 on each downbeat (to `offbeat` on other beats) and
    // decays until the next beat. For zoom punches and pulsing text.
    pulse(frame: number, options?: PulseOptions): number
    // The video frame `seconds` into the song.
    frameOf(seconds: number): number
}

// The beat grid of `file` as video frames, with frame 0 at `start` seconds
// into the song.
export function beatsOf(
    file: BeatsFile,
    { fps, start = 0 }: BeatsOptions
): Beats {
    const period = file.beatPeriod
    const perBar = file.beatsPerBar
    const beats = file.beats.length ? file.beats : [0]
    const downbeats = file.downbeats.length ? file.downbeats : [beats[0]]
    const frameOf = (seconds: number) => (seconds - start) * fps
    const eps = 1e-6
    // Index of the first beat/downbeat at or after the start.
    const firstAfter = (times: readonly number[], step: number) => {
        const i = times.findIndex((t) => t >= start - eps)
        if (i >= 0) return i
        // Past the end: count on from the last.
        const last = times[times.length - 1]
        return times.length - 1 + Math.ceil((start - last - eps) / step)
    }
    // The time of grid index i (fractional), extrapolating at the ends.
    const timeAt = (times: readonly number[], step: number, i: number) => {
        const k = Math.floor(i)
        const frac = i - k
        const at = (j: number) => {
            if (j < 0) return times[0] + j * step
            if (j >= times.length) {
                return times[times.length - 1] + (j - times.length + 1) * step
            }
            return times[j]
        }
        return at(k) + (at(k + 1) - at(k)) * frac
    }
    const beat0 = firstAfter(beats, period)
    const bar0 = firstAfter(downbeats, period * perBar)
    const beatFrame = (n: number) => frameOf(timeAt(beats, period, beat0 + n))
    const barFrame = (n: number) =>
        frameOf(timeAt(downbeats, period * perBar, bar0 + n))
    // Which beats are downbeats: by time, on the analysed grid.
    const downSet = new Set(downbeats.map((t) => Math.round(t * 1000)))
    const isDownbeat = (n: number) => {
        const i = beat0 + n
        if (i >= 0 && i < beats.length) {
            return downSet.has(Math.round(beats[i] * 1000))
        }
        // Off the grid: count bars on from the first downbeat's beat.
        const first = beats.findIndex(
            (t) => Math.abs(t - downbeats[0]) < period / 4
        )
        return (((i - Math.max(first, 0)) % perBar) + perBar) % perBar === 0
    }
    const beatAt = (frame: number) => {
        // Bisect the monotonic beatFrame.
        let lo = Math.floor((frame - beatFrame(0)) / (period * fps)) - 2
        let hi = lo + 4
        while (beatFrame(lo) > frame) lo -= 4
        while (beatFrame(hi) < frame) hi += 4
        while (hi - lo > 1) {
            const mid = Math.floor((lo + hi) / 2)
            if (beatFrame(mid) <= frame) lo = mid
            else hi = mid
        }
        const a = beatFrame(lo)
        const b = beatFrame(hi)
        return lo + (b > a ? (frame - a) / (b - a) : 0)
    }
    const drop = frameOf(file.drop.time)
    return {
        file,
        fps,
        start,
        bpm: file.bpm,
        beatFrames: period * fps,
        barFrames: period * perBar * fps,
        beatFrame,
        barFrame,
        beatAt,
        sectionFrames(label, nth = 0) {
            const section = file.sections.filter((s) => s.label === label)[nth]
            if (!section) return undefined
            return { from: frameOf(section.start), to: frameOf(section.end) }
        },
        dropFrame: drop,
        nearestBeat(frame) {
            const n = Math.round(beatAt(frame))
            return { n, frame: beatFrame(n), downbeat: isDownbeat(n) }
        },
        pulse(frame, { decay = 6, offbeat = 0.55 } = {}) {
            const n = Math.floor(beatAt(frame) + eps)
            const since = frame - beatFrame(n)
            if (since < 0) return 0
            const peak = isDownbeat(n) ? 1 : offbeat
            return peak * Math.exp(-since / decay)
        },
        frameOf,
    }
}
