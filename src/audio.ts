// The audio engine (KDA-212): plays the sound effects in sfx.ts and the
// tunes in music.ts with Web Audio, all synthesized. It owns the
// AudioContext and three gain nodes: effects and music feed master, which
// feeds the speakers. The context and the timer that drives music
// scheduling are injected, so tests run it on a fake without a browser.
//
// Pause: `pauseMusic` freezes the tune where it is (cutting the notes
// already scheduled ahead) and `resumeMusic` carries on from that point in
// the tune, not from its start.
//
// Autoplay: browsers only let audio start after a user gesture, so nothing
// is created until `unlock()`, which main.ts calls on the first key or
// pointer press (and again on later ones, which resumes a context the
// browser suspended). Before that:
// - `playSfx` is dropped: a sound played late, out of step with what made
//   it, is worse than none.
// - `playMusic` is remembered, and that tune starts on unlock.
// - `setVolumes` is remembered and applied when the context is made.
// If the browser has no Web Audio, or making the context fails, the engine
// stays silent and every call is a no-op.

import {
    compileTrack,
    heldTones,
    TRACKS,
    tonesInWindow,
    type CompiledTrack,
    type MusicTrackId,
} from "./music"
import { defaultSettings, VOLUME_MAX, type Settings } from "./settings"
import { SFX, type SfxId } from "./sfx"
import { DEFAULT_ATTACK, RELEASE, SILENT, type Tone } from "./tone"

// The parts of an AudioContext the engine uses.
export type AudioContextLike = Pick<
    AudioContext,
    | "currentTime"
    | "sampleRate"
    | "state"
    | "destination"
    | "resume"
    | "createGain"
    | "createOscillator"
    | "createBufferSource"
    | "createBiquadFilter"
    | "createBuffer"
>

// The volume settings (KDA-246's musicVolume, effectsVolume and muted):
// music and effects 0–VOLUME_MAX, and a master mute.
export type Volumes = {
    music: number
    effects: number
    muted: boolean
}

// The volumes in saved settings.
export function volumesOf(
    settings: Pick<Settings, "musicVolume" | "effectsVolume" | "muted">
): Volumes {
    return {
        music: settings.musicVolume,
        effects: settings.effectsVolume,
        muted: settings.muted,
    }
}

// Used until the first setVolumes: the settings' defaults.
export const DEFAULT_VOLUMES: Volumes = volumesOf(defaultSettings())

// The master gain when not muted: headroom, so several sounds at once don't
// clip.
export const MASTER_LEVEL = 0.5
// Music at full volume sits this far under effects at full volume.
export const MUSIC_LEVEL = 0.5

// Music scheduling: every SCHEDULE_MS the engine schedules the notes that
// start in the next LOOKAHEAD seconds on the AudioContext clock, so timer
// jitter doesn't reach the beat. A tune starts MUSIC_START_DELAY after it is
// asked for, so its first notes aren't already late.
export const SCHEDULE_MS = 25
export const LOOKAHEAD = 0.1
export const MUSIC_START_DELAY = 0.05

// Seconds of white noise the noise tones loop over.
export const NOISE_SECONDS = 1

// A 0–10 volume setting as a gain, 0–1. Squared, so the steps sound about
// even to the ear. Out-of-range values are clamped; anything not a finite
// number is silent.
export function volumeGain(level: number): number {
    if (!Number.isFinite(level)) return 0
    const share = Math.min(Math.max(level, 0), VOLUME_MAX) / VOLUME_MAX
    return share * share
}

export type BusGains = { master: number; music: number; effects: number }

// The three gain nodes' levels for these volumes.
export function busGains(volumes: Volumes): BusGains {
    return {
        master: volumes.muted ? 0 : MASTER_LEVEL,
        music: volumeGain(volumes.music) * MUSIC_LEVEL,
        effects: volumeGain(volumes.effects),
    }
}

// The white noise the noise tones loop over: NOISE_SECONDS of `random`
// numbers scaled to -1–1, at the context's sample rate. Pass a seeded
// `random` for the same noise every time (the video's offline render).
export function createNoise(
    context: Pick<AudioContextLike, "sampleRate" | "createBuffer">,
    random: () => number
): AudioBuffer {
    const length = Math.round(context.sampleRate * NOISE_SECONDS)
    const noise = context.createBuffer(1, length, context.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = random() * 2 - 1
    return noise
}

// Schedule one tone to start at `start` + `tone.at` (AudioContext time) into
// `destination`, and leave its nodes connected; playTone also cleans them
// up. For an OfflineAudioContext, whose whole graph is thrown away after
// one render: there, a disconnect from the main thread lands at a render
// quantum that varies from run to run, and so does the output.
export function scheduleTone(
    context: AudioContextLike,
    tone: Tone,
    start: number,
    destination: AudioNode,
    noise: AudioBuffer
): { source: AudioScheduledSourceNode; envelope: GainNode } {
    const begin = start + tone.at
    const end = begin + tone.duration
    const attack = Math.min(tone.attack ?? DEFAULT_ATTACK, tone.duration)

    const envelope = context.createGain()
    const gain = envelope.gain
    gain.setValueAtTime(0, begin)
    gain.linearRampToValueAtTime(tone.volume, begin + attack)
    if (tone.hold) {
        gain.setValueAtTime(
            tone.volume,
            Math.max(begin + attack, end - RELEASE)
        )
        gain.linearRampToValueAtTime(0, end)
    } else {
        gain.exponentialRampToValueAtTime(SILENT, end)
    }
    envelope.connect(destination)

    let source: AudioScheduledSourceNode
    let pitch: AudioParam
    if (tone.wave === "noise") {
        const buffer = context.createBufferSource()
        buffer.buffer = noise
        buffer.loop = true
        const filter = context.createBiquadFilter()
        filter.type = "bandpass"
        buffer.connect(filter)
        filter.connect(envelope)
        source = buffer
        pitch = filter.frequency
    } else {
        const oscillator = context.createOscillator()
        oscillator.type = tone.wave
        oscillator.connect(envelope)
        source = oscillator
        pitch = oscillator.frequency
    }
    pitch.setValueAtTime(tone.freq, begin)
    if (tone.freqEnd !== undefined)
        pitch.exponentialRampToValueAtTime(tone.freqEnd, end)
    source.start(begin)
    source.stop(end)
    return { source, envelope }
}

// Schedule one tone to start at `start` + `tone.at` (AudioContext time) into
// `destination`. Noise tones loop `noise` through a band-pass filter. Its
// nodes disconnect once it has played.
export function playTone(
    context: AudioContextLike,
    tone: Tone,
    start: number,
    destination: AudioNode,
    noise: AudioBuffer
): void {
    const { source, envelope } = scheduleTone(
        context,
        tone,
        start,
        destination,
        noise
    )
    source.onended = () => envelope.disconnect()
}

export type AudioOptions = {
    // Make the AudioContext; called once, on the first unlock. Returns
    // undefined (or throws) where there is no Web Audio.
    createContext: () => AudioContextLike | undefined
    // setInterval and clearInterval, for music scheduling.
    setTimer: (callback: () => void, ms: number) => number
    clearTimer: (handle: number) => void
    // For the noise buffer. Default Math.random.
    random?: () => number
}

export type Audio = {
    // Make or resume the AudioContext. Call from a user gesture's handler;
    // safe to call on every one.
    unlock(): void
    // Apply volume settings (KDA-246's music, effects and mute).
    setVolumes(volumes: Volumes): void
    // Play a sound effect now. Dropped before unlock, and while muted or at
    // effects volume 0.
    playSfx(id: SfxId): void
    // Loop a tune from its start, replacing the one playing. Asking for the
    // tune already playing (or paused, or waiting for unlock) changes
    // nothing: it keeps going, or stays paused.
    playMusic(track: MusicTrackId): void
    // Stop the tune at once and forget it.
    stopMusic(): void
    // Freeze the tune where it is; nothing without a tune.
    pauseMusic(): void
    // Carry on from where the tune was paused.
    resumeMusic(): void
    // Whether unlock has been called.
    readonly unlocked: boolean
    // The tune playing, paused, or waiting for unlock to start.
    readonly music: MusicTrackId | undefined
    readonly musicPaused: boolean
}

type Buses = { master: GainNode; music: GainNode; effects: GainNode }

type Playing = {
    track: CompiledTrack
    // Gain node this tune alone plays through, so stopping cuts the notes
    // already scheduled.
    bus: GainNode
    // AudioContext time of the tune's start.
    start: number
    // Track time scheduled up to.
    scheduled: number
    timer: number
}

export function createAudio(options: AudioOptions): Audio {
    const random = options.random ?? Math.random
    let unlocked = false
    let failed = false
    let context: AudioContextLike | undefined
    let buses: Buses | undefined
    let noise: AudioBuffer | undefined
    let volumes: Volumes = DEFAULT_VOLUMES
    let music: MusicTrackId | undefined
    let playing: Playing | undefined
    let paused = false
    // Track time to start from when the tune (re)starts.
    let position = 0
    // When each effect last started, so one asked for twice at the same
    // moment (several ticks run in one frame after a hitch) plays once.
    const lastSfx = new Map<SfxId, number>()
    const compiled = new Map<MusicTrackId, CompiledTrack>()

    function compiledTrack(id: MusicTrackId): CompiledTrack {
        let track = compiled.get(id)
        if (!track) {
            track = compileTrack(TRACKS[id])
            compiled.set(id, track)
        }
        return track
    }

    function applyVolumes() {
        if (!context || !buses) return
        const gains = busGains(volumes)
        const now = context.currentTime
        buses.master.gain.setValueAtTime(gains.master, now)
        buses.music.gain.setValueAtTime(gains.music, now)
        buses.effects.gain.setValueAtTime(gains.effects, now)
    }

    function setUp(ctx: AudioContextLike) {
        const master = ctx.createGain()
        master.connect(ctx.destination)
        const musicBus = ctx.createGain()
        musicBus.connect(master)
        const effects = ctx.createGain()
        effects.connect(master)
        buses = { master, music: musicBus, effects }
        noise = createNoise(ctx, random)
        context = ctx
        applyVolumes()
    }

    // Whether music can't be heard (muted, or at volume 0): then the
    // scheduler makes no nodes and just moves on.
    function musicSilent(): boolean {
        return volumes.muted || volumeGain(volumes.music) === 0
    }

    // Schedule the notes of the playing tune that start before the
    // lookahead runs out. Notes a late timer missed are skipped, not
    // played in a burst.
    function pump() {
        if (!context || !buses || !noise || !playing) return
        const now = context.currentTime - playing.start
        const from = Math.max(playing.scheduled, now)
        const to = Math.max(now, 0) + LOOKAHEAD
        if (!musicSilent()) {
            for (const tone of tonesInWindow(playing.track, from, to))
                playTone(context, tone, playing.start, playing.bus, noise)
        }
        playing.scheduled = Math.max(playing.scheduled, to)
    }

    function startMusic() {
        if (!context || !buses || !noise || !music || playing || paused) return
        const bus = context.createGain()
        bus.connect(buses.music)
        playing = {
            track: compiledTrack(music),
            bus,
            start: context.currentTime + MUSIC_START_DELAY - position,
            scheduled: position,
            timer: options.setTimer(pump, SCHEDULE_MS),
        }
        // Resuming mid-tune: the notes still held at that point sound on
        // for what is left of them.
        if (!musicSilent()) {
            for (const tone of heldTones(playing.track, position))
                playTone(context, tone, playing.start, bus, noise)
        }
        pump()
    }

    function haltMusic() {
        if (!playing) return
        options.clearTimer(playing.timer)
        if (context) playing.bus.gain.setValueAtTime(0, context.currentTime)
        playing.bus.disconnect()
        playing = undefined
    }

    return {
        unlock() {
            unlocked = true
            if (failed) return
            try {
                if (!context) {
                    const ctx = options.createContext()
                    if (!ctx) {
                        failed = true
                        return
                    }
                    setUp(ctx)
                }
                // Not only "suspended": iOS Safari reports "interrupted"
                // after a call, Siri or the lock screen.
                if (
                    context &&
                    context.state !== "running" &&
                    context.state !== "closed"
                )
                    context.resume().catch(() => undefined)
                startMusic()
            } catch (error) {
                console.error(error)
                haltMusic()
                failed = true
                context = undefined
            }
        },
        setVolumes(next) {
            volumes = { ...next }
            applyVolumes()
        },
        playSfx(id) {
            if (!context || !buses || !noise || volumes.muted) return
            if (volumeGain(volumes.effects) === 0) return
            const tones = SFX[id] as readonly Tone[] | undefined
            if (!tones) return
            const now = context.currentTime
            if (lastSfx.get(id) === now) return
            lastSfx.set(id, now)
            for (const tone of tones)
                playTone(context, tone, now, buses.effects, noise)
        },
        playMusic(track) {
            if (music === track) return
            haltMusic()
            music = track
            paused = false
            position = 0
            startMusic()
        },
        stopMusic() {
            haltMusic()
            music = undefined
            paused = false
            position = 0
        },
        pauseMusic() {
            if (!music || paused) return
            // Paused before a resume's start delay is over, it stays where
            // it was rather than rewinding.
            if (playing && context)
                position = Math.max(
                    position,
                    context.currentTime - playing.start
                )
            haltMusic()
            paused = true
        },
        resumeMusic() {
            if (!paused) return
            paused = false
            startMusic()
        },
        get unlocked() {
            return unlocked
        },
        get music() {
            return music
        },
        get musicPaused() {
            return paused
        },
    }
}

// The browser's AudioContext as a createContext (pass globalThis):
// undefined where there is no Web Audio.
export function browserAudioContext(scope: {
    AudioContext?: new () => AudioContextLike
}): () => AudioContextLike | undefined {
    return () => (scope.AudioContext ? new scope.AudioContext() : undefined)
}
