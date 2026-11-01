import { describe, expect, it, vi } from "vite-plus/test"
import {
    createAudio,
    MUSIC_START_DELAY,
    MUSIC_TRIM_DB,
    RECORDED_LEVEL,
    trimGain,
    type AudioContextLike,
} from "./audio"
import type { RecordedTracks } from "./recorded"
import {
    fakeContext,
    fakeTimers,
    type FakeBufferSource,
} from "./test/fakeAudio"

const RECORDED: RecordedTracks = {
    stage1: { url: "stage1.mp3", loopStart: 4, loopEnd: 20 },
    stage2: { url: "stage2.mp3", loopStart: 1, loopEnd: 9 },
}

function setup(
    fetchAudio = vi.fn((url: string) => Promise.resolve(bytes(url)))
) {
    const context = fakeContext()
    const timers = fakeTimers()
    const audio = createAudio({
        createContext: () => context as unknown as AudioContextLike,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
        recorded: RECORDED,
        fetchAudio,
    })
    // Recorded tunes play through a buffer source with a buffer; the noise
    // for chip drums has none of the fake decoder's buffers.
    const sources = () =>
        context.bufferSources.filter(
            (s) => (s.buffer as { decodedFrom?: unknown })?.decodedFrom
        )
    return { audio, context, timers, fetchAudio, sources }
}

const byUrl = new Map<string, ArrayBuffer>()
function bytes(url: string): ArrayBuffer {
    if (!byUrl.has(url)) byUrl.set(url, new ArrayBuffer(8))
    return byUrl.get(url)!
}

// Let the fetch and decode promises settle.
const settle = () => new Promise((resolve) => setTimeout(resolve))

describe("recorded music", () => {
    it("loads the file once unlocked, then loops it between its points", async () => {
        const { audio, context, fetchAudio, sources } = setup()
        audio.playMusic("stage1")
        expect(fetchAudio).not.toHaveBeenCalled()
        audio.unlock()
        expect(fetchAudio).toHaveBeenCalledWith("stage1.mp3")
        await settle()
        expect(context.decodeAudioData).toHaveBeenCalledWith(
            bytes("stage1.mp3")
        )
        const [source] = sources()
        expect(source).toMatchObject({
            loop: true,
            loopStart: 4,
            loopEnd: 20,
            started: 10 + MUSIC_START_DELAY,
            offset: 0,
        })
        // Through its own gain node into the music bus, no chip notes.
        const own = source
            .connections[0] as unknown as (typeof context.gains)[0]
        expect(own.connections).toEqual([context.gains[1]])
        expect(own.gain.setAt(10)).toBe(RECORDED_LEVEL * trimGain("stage1"))
        expect(context.oscillators).toHaveLength(0)
    })

    it("plays the chip tune when the file fails to load", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        const { audio, context, sources } = setup(
            vi.fn(() => Promise.reject(new Error("offline")))
        )
        audio.unlock()
        audio.playMusic("stage1")
        await settle()
        expect(sources()).toHaveLength(0)
        expect(context.oscillators.length).toBeGreaterThan(0)
    })

    it("plays the chip tune for a tune without a file", () => {
        const { audio, context, fetchAudio } = setup()
        audio.unlock()
        audio.playMusic("title")
        expect(fetchAudio).not.toHaveBeenCalled()
        expect(context.oscillators.length).toBeGreaterThan(0)
    })

    it("fetches a file once and reuses it", async () => {
        const { audio, fetchAudio, sources } = setup()
        audio.unlock()
        audio.playMusic("stage1")
        await settle()
        audio.playMusic("stage2")
        await settle()
        audio.playMusic("stage1")
        expect(fetchAudio).toHaveBeenCalledTimes(2)
        expect(sources()).toHaveLength(3)
    })

    it("starts nothing when the tune changed while the file loaded", async () => {
        const { audio, sources } = setup()
        audio.unlock()
        audio.playMusic("stage1")
        audio.stopMusic()
        await settle()
        expect(sources()).toHaveLength(0)
    })

    it("stops the old file when the tune is replaced", async () => {
        const { audio, context, sources } = setup()
        audio.unlock()
        audio.playMusic("stage1")
        await settle()
        const [first] = sources()
        context.currentTime = 12
        audio.playMusic("title")
        expect(first.stopped).toBe(12)
        expect(
            (first.connections[0] as { disconnected: boolean }).disconnected
        ).toBe(true)
    })

    it("resumes from where it paused, past the loop end round the loop", async () => {
        const { audio, context, sources } = setup()
        audio.unlock()
        audio.playMusic("stage1")
        await settle()
        // 30 s in: once through to 20, then 10 s round the 16 s loop.
        context.currentTime = 10 + MUSIC_START_DELAY + 30
        audio.pauseMusic()
        expect(sources()[0].stopped).toBe(context.currentTime)
        audio.resumeMusic()
        const resumed = sources()[1] as FakeBufferSource
        expect(resumed.started).toBe(context.currentTime + MUSIC_START_DELAY)
        expect(resumed.offset).toBeCloseTo(14, 9)
    })

    it("tells how far into the tune it is, for visuals that follow it", async () => {
        const { audio, context } = setup()
        audio.playMusic("stage1")
        // No sound yet: the caller keeps its own time.
        expect(audio.musicPosition()).toBeUndefined()
        audio.unlock()
        // Waiting for its file: held at the start.
        expect(audio.musicPosition()).toBe(0)
        await settle()
        expect(audio.musicPosition()).toBe(0)
        context.currentTime = 10 + MUSIC_START_DELAY + 2.5
        expect(audio.musicPosition()).toBeCloseTo(2.5, 9)
        audio.pauseMusic()
        context.currentTime += 5
        expect(audio.musicPosition()).toBeCloseTo(2.5, 9)
        audio.stopMusic()
        expect(audio.musicPosition()).toBeUndefined()
    })
})

describe("music trims", () => {
    it("turns decibels into gain, 0 dB for a tune not listed", () => {
        expect(MUSIC_TRIM_DB.stage2).toBeUndefined()
        expect(trimGain("stage2")).toBe(1)
        expect(trimGain("title")).toBeCloseTo(10 ** (-8 / 20), 9)
    })

    it("plays a chip tune through its trim", () => {
        const { audio, context } = setup()
        audio.unlock()
        audio.playMusic("title")
        // master, music and effects, then the tune's own bus
        const own = context.gains[3]!
        expect(own.connections).toEqual([context.gains[1]])
        expect(own.gain.setAt(10)).toBeCloseTo(trimGain("title"), 9)
    })
})
