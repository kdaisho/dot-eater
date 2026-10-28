import { describe, expect, it, vi } from "vite-plus/test"
import {
    browserAudioContext,
    busGains,
    createAudio,
    DEFAULT_VOLUMES,
    LOOKAHEAD,
    MASTER_LEVEL,
    MUSIC_LEVEL,
    MUSIC_START_DELAY,
    SCHEDULE_MS,
    volumeGain,
    type AudioContextLike,
} from "./audio"
import { compileTrack, tonesInWindow, TRACKS } from "./music"
import { SFX, SfxId } from "./sfx"

// A stand-in for the Web Audio graph that records what the engine does.

type ParamEvent = [kind: string, value: number, time: number]

class FakeParam {
    events: ParamEvent[] = []
    setValueAtTime(value: number, time: number) {
        this.events.push(["set", value, time])
        return this
    }
    linearRampToValueAtTime(value: number, time: number) {
        this.events.push(["linear", value, time])
        return this
    }
    exponentialRampToValueAtTime(value: number, time: number) {
        this.events.push(["exp", value, time])
        return this
    }
    // The last value set at or before `time` by setValueAtTime.
    setAt(time: number): number | undefined {
        return this.events
            .filter(([k, , t]) => k === "set" && t <= time)
            .at(-1)?.[1]
    }
}

class FakeNode {
    connections: FakeNode[] = []
    disconnected = false
    connect(node: FakeNode) {
        this.connections.push(node)
        return node
    }
    disconnect() {
        this.disconnected = true
    }
}

class FakeGain extends FakeNode {
    gain = new FakeParam()
}

class FakeSource extends FakeNode {
    started: number | undefined
    stopped: number | undefined
    onended: (() => void) | null = null
    start(time: number) {
        this.started = time
    }
    stop(time: number) {
        this.stopped = time
    }
}

class FakeOscillator extends FakeSource {
    type = "sine"
    frequency = new FakeParam()
}

class FakeBufferSource extends FakeSource {
    buffer: unknown = null
    loop = false
}

class FakeFilter extends FakeNode {
    type = "lowpass"
    frequency = new FakeParam()
}

function fakeContext() {
    const fake = {
        currentTime: 10,
        sampleRate: 100,
        state: "suspended" as AudioContextState,
        destination: new FakeNode(),
        gains: [] as FakeGain[],
        oscillators: [] as FakeOscillator[],
        bufferSources: [] as FakeBufferSource[],
        filters: [] as FakeFilter[],
        resume: vi.fn(() => {
            fake.state = "running"
            return Promise.resolve()
        }),
        createGain() {
            const node = new FakeGain()
            fake.gains.push(node)
            return node
        },
        createOscillator() {
            const node = new FakeOscillator()
            fake.oscillators.push(node)
            return node
        },
        createBufferSource() {
            const node = new FakeBufferSource()
            fake.bufferSources.push(node)
            return node
        },
        createBiquadFilter() {
            const node = new FakeFilter()
            fake.filters.push(node)
            return node
        },
        createBuffer(_channels: number, length: number) {
            const data = new Float32Array(length)
            return { length, getChannelData: () => data }
        },
        // Every source scheduled so far, oscillators and noise.
        get sources(): FakeSource[] {
            return [...fake.oscillators, ...fake.bufferSources]
        },
    }
    return fake
}

const byTime = (a: number, b: number) => a - b

// Hand-driven timers: `fire()` runs every live one.
function fakeTimers() {
    const live = new Map<number, () => void>()
    let next = 1
    return {
        live,
        setTimer: vi.fn((callback: () => void, _ms: number) => {
            live.set(next, callback)
            return next++
        }),
        clearTimer: vi.fn((handle: number) => {
            live.delete(handle)
        }),
        fire() {
            for (const callback of live.values()) callback()
        },
    }
}

function setup() {
    const context = fakeContext()
    const timers = fakeTimers()
    const createContext = vi.fn(() => context as unknown as AudioContextLike)
    const audio = createAudio({
        createContext,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
        random: () => 0.75,
    })
    // The engine makes master, music and effects first, in that order.
    const bus = () => {
        const [master, music, effects] = context.gains
        return { master, music, effects }
    }
    return { audio, context, timers, createContext, bus }
}

describe("volumeGain", () => {
    it("maps 0–10 to a squared gain", () => {
        expect(volumeGain(0)).toBe(0)
        expect(volumeGain(5)).toBe(0.25)
        expect(volumeGain(10)).toBe(1)
    })

    it("clamps out-of-range values and silences non-numbers", () => {
        expect(volumeGain(-3)).toBe(0)
        expect(volumeGain(15)).toBe(1)
        expect(volumeGain(Number.NaN)).toBe(0)
        expect(volumeGain(Infinity)).toBe(0)
    })
})

describe("busGains", () => {
    it("sets music under effects and the master to its level", () => {
        expect(busGains({ music: 10, effects: 10, muted: false })).toEqual({
            master: MASTER_LEVEL,
            music: MUSIC_LEVEL,
            effects: 1,
        })
    })

    it("mutes with the master alone, keeping the other levels", () => {
        expect(busGains({ music: 10, effects: 5, muted: true })).toEqual({
            master: 0,
            music: MUSIC_LEVEL,
            effects: 0.25,
        })
    })
})

describe("unlock", () => {
    it("makes no context before the first unlock", () => {
        const { audio, createContext } = setup()
        audio.setVolumes(DEFAULT_VOLUMES)
        audio.playSfx(SfxId.dot)
        audio.playMusic("title")
        expect(createContext).not.toHaveBeenCalled()
        expect(audio.unlocked).toBe(false)
    })

    it("makes the context once and resumes it while suspended", () => {
        const { audio, context, createContext } = setup()
        audio.unlock()
        expect(audio.unlocked).toBe(true)
        expect(createContext).toHaveBeenCalledTimes(1)
        expect(context.resume).toHaveBeenCalledTimes(1)
        audio.unlock()
        expect(createContext).toHaveBeenCalledTimes(1)
        expect(context.resume).toHaveBeenCalledTimes(1)
        // The browser suspends it again (e.g. an iOS interruption).
        context.state = "suspended"
        audio.unlock()
        expect(context.resume).toHaveBeenCalledTimes(2)
    })

    it("wires effects and music through master to the speakers", () => {
        const { audio, context, bus } = setup()
        audio.unlock()
        const { master, music, effects } = bus()
        expect(master.connections).toEqual([context.destination])
        expect(music.connections).toEqual([master])
        expect(effects.connections).toEqual([master])
    })

    it("drops effects played before it", () => {
        const { audio, context } = setup()
        audio.playSfx(SfxId.dot)
        audio.unlock()
        expect(context.sources).toHaveLength(0)
    })

    it("stays silent where there is no Web Audio", () => {
        const createContext = vi.fn(() => undefined)
        const timers = fakeTimers()
        const audio = createAudio({ createContext, ...timers })
        audio.playMusic("title")
        expect(() => {
            audio.unlock()
            audio.unlock()
            audio.playSfx(SfxId.dot)
            audio.setVolumes(DEFAULT_VOLUMES)
            audio.stopMusic()
        }).not.toThrow()
        expect(createContext).toHaveBeenCalledTimes(1)
        expect(timers.setTimer).not.toHaveBeenCalled()
    })

    it("stays silent when making the context throws", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        const createContext = vi.fn(() => {
            throw new Error("NotAllowedError")
        })
        const audio = createAudio({ createContext, ...fakeTimers() })
        expect(() => audio.unlock()).not.toThrow()
        audio.unlock()
        expect(createContext).toHaveBeenCalledTimes(1)
        expect(error).toHaveBeenCalledTimes(1)
        error.mockRestore()
    })
})

describe("setVolumes", () => {
    it("applies volumes set before unlock once the context exists", () => {
        const { audio, bus, context } = setup()
        audio.setVolumes({ music: 5, effects: 10, muted: false })
        audio.unlock()
        const { master, music, effects } = bus()
        const now = context.currentTime
        expect(master.gain.setAt(now)).toBe(MASTER_LEVEL)
        expect(music.gain.setAt(now)).toBe(0.25 * MUSIC_LEVEL)
        expect(effects.gain.setAt(now)).toBe(1)
    })

    it("uses DEFAULT_VOLUMES until set", () => {
        const { audio, bus, context } = setup()
        audio.unlock()
        const gains = busGains(DEFAULT_VOLUMES)
        expect(bus().music.gain.setAt(context.currentTime)).toBe(gains.music)
        expect(bus().effects.gain.setAt(context.currentTime)).toBe(
            gains.effects
        )
    })

    it("changes the gains at once after unlock, mute on master", () => {
        const { audio, bus, context } = setup()
        audio.unlock()
        context.currentTime = 12
        audio.setVolumes({ music: 0, effects: 3, muted: true })
        const { master, music, effects } = bus()
        expect(master.gain.setAt(12)).toBe(0)
        expect(music.gain.setAt(12)).toBe(0)
        expect(effects.gain.setAt(12)).toBeCloseTo(0.09)
    })
})

describe("playSfx", () => {
    it("schedules each tone of the effect from now, into the effects bus", () => {
        const { audio, context, bus } = setup()
        audio.unlock()
        audio.playSfx(SfxId.enemyDefeated)
        const tones = SFX.enemyDefeated
        expect(context.oscillators).toHaveLength(tones.length)
        context.oscillators.forEach((osc, i) => {
            const tone = tones[i]
            expect(osc.type).toBe(tone.wave)
            expect(osc.started).toBeCloseTo(10 + tone.at)
            expect(osc.stopped).toBeCloseTo(10 + tone.at + tone.duration)
            expect(osc.frequency.events[0]).toEqual([
                "set",
                tone.freq,
                10 + tone.at,
            ])
            expect(osc.frequency.events[1]).toEqual([
                "exp",
                tone.freqEnd,
                10 + tone.at + tone.duration,
            ])
            const envelope = osc.connections[0] as FakeGain
            expect(envelope.connections).toEqual([bus().effects])
        })
    })

    it("fades a tone out, or holds it then releases", () => {
        const { audio, context } = setup()
        audio.unlock()
        audio.playSfx(SfxId.dot)
        const fade = (context.oscillators[0].connections[0] as FakeGain).gain
        expect(fade.events.map(([k]) => k)).toEqual(["set", "linear", "exp"])
        audio.playSfx(SfxId.stageClear)
        const held = (context.oscillators[1].connections[0] as FakeGain).gain
        expect(held.events.map(([k]) => k)).toEqual([
            "set",
            "linear",
            "set",
            "linear",
        ])
        expect(held.events.at(-1)?.[1]).toBe(0)
    })

    it("plays noise tones as looped noise through a band-pass filter", () => {
        const { audio, context } = setup()
        audio.unlock()
        audio.playSfx(SfxId.breathOwl)
        expect(context.oscillators).toHaveLength(0)
        const [source] = context.bufferSources
        const [filter] = context.filters
        expect(source.loop).toBe(true)
        expect(source.buffer).not.toBeNull()
        expect(source.connections).toEqual([filter])
        expect(filter.type).toBe("bandpass")
        expect(filter.frequency.events[0][1]).toBe(SFX["breath.owl"][0].freq)
    })

    it("disconnects a tone's envelope when it ends", () => {
        const { audio, context } = setup()
        audio.unlock()
        audio.playSfx(SfxId.dot)
        const [osc] = context.oscillators
        osc.onended?.()
        expect((osc.connections[0] as FakeGain).disconnected).toBe(true)
    })

    it("plays nothing while muted or at effects volume 0", () => {
        const { audio, context } = setup()
        audio.unlock()
        audio.setVolumes({ music: 5, effects: 5, muted: true })
        audio.playSfx(SfxId.dot)
        audio.setVolumes({ music: 5, effects: 0, muted: false })
        audio.playSfx(SfxId.dot)
        expect(context.sources).toHaveLength(0)
        audio.setVolumes({ music: 5, effects: 1, muted: false })
        audio.playSfx(SfxId.dot)
        expect(context.sources).toHaveLength(1)
    })
})

describe("music", () => {
    const title = compileTrack(TRACKS.title)
    const stage1 = compileTrack(TRACKS.stage1)
    // The tune's own gain node: made right after the three buses.
    const musicBus = (context: ReturnType<typeof fakeContext>, n = 0) =>
        context.gains.filter((g) => g.connections[0] === context.gains[1])[n]

    it("starts a tune asked for before unlock once unlocked", () => {
        const { audio, context, timers } = setup()
        audio.playMusic("title")
        expect(audio.music).toBe("title")
        expect(timers.setTimer).not.toHaveBeenCalled()
        audio.unlock()
        expect(timers.setTimer).toHaveBeenCalledWith(
            expect.any(Function),
            SCHEDULE_MS
        )
        const start = 10 + MUSIC_START_DELAY
        const expected = tonesInWindow(title, 0, LOOKAHEAD)
        expect(expected.length).toBeGreaterThan(0)
        expect(
            context.sources.map((s) => s.started ?? NaN).sort(byTime)
        ).toEqual(expected.map((t) => start + t.at).sort(byTime))
    })

    it("schedules each window ahead of the clock, every note once", () => {
        const { audio, context, timers } = setup()
        audio.unlock()
        audio.playMusic("title")
        const start = 10 + MUSIC_START_DELAY
        for (let i = 1; i <= 100; i++) {
            context.currentTime = 10 + i * 0.025
            timers.fire()
        }
        const reached = 100 * 0.025 - MUSIC_START_DELAY + LOOKAHEAD
        const expected = tonesInWindow(title, 0, reached).map(
            (t) => start + t.at
        )
        const started = context.sources.map((s) => s.started ?? NaN)
        expect(started.length).toBe(expected.length)
        expect(started.sort((a, b) => a - b)).toEqual(
            expected.sort((a, b) => a - b)
        )
    })

    it("plays through the music bus via its own gain node", () => {
        const { audio, context } = setup()
        audio.unlock()
        audio.playMusic("stage1")
        const own = musicBus(context)
        expect(own).toBeDefined()
        const envelope = context.oscillators[0].connections[0] as FakeGain
        expect(envelope.connections).toEqual([own])
    })

    it("skips notes a late timer missed instead of bursting them", () => {
        const { audio, context, timers } = setup()
        audio.unlock()
        audio.playMusic("stage1")
        const before = context.sources.length
        const start = 10 + MUSIC_START_DELAY
        // The tab was in the background for 3 seconds.
        context.currentTime = start + 3
        timers.fire()
        const fresh = context.sources.slice(before)
        expect(fresh.length).toBe(
            tonesInWindow(stage1, 3, 3 + LOOKAHEAD).length
        )
        for (const s of fresh)
            expect(s.started).toBeGreaterThanOrEqual(context.currentTime)
    })

    it("keeps the same tune going when asked again", () => {
        const { audio, timers } = setup()
        audio.unlock()
        audio.playMusic("title")
        audio.playMusic("title")
        expect(timers.setTimer).toHaveBeenCalledTimes(1)
        expect(timers.clearTimer).not.toHaveBeenCalled()
    })

    it("replaces the tune, cutting the old one's scheduled notes", () => {
        const { audio, context, timers } = setup()
        audio.unlock()
        audio.playMusic("title")
        const old = musicBus(context)
        audio.playMusic("stage1")
        expect(audio.music).toBe("stage1")
        expect(timers.clearTimer).toHaveBeenCalledTimes(1)
        expect(timers.live.size).toBe(1)
        expect(old.disconnected).toBe(true)
        expect(old.gain.setAt(context.currentTime)).toBe(0)
        expect(musicBus(context, 1).disconnected).toBe(false)
    })

    it("stops, and doesn't come back on a later unlock", () => {
        const { audio, context, timers } = setup()
        audio.unlock()
        audio.playMusic("title")
        audio.stopMusic()
        expect(audio.music).toBeUndefined()
        expect(timers.live.size).toBe(0)
        const count = context.sources.length
        audio.unlock()
        timers.fire()
        expect(context.sources.length).toBe(count)
    })

    it("forgets a tune stopped before unlock", () => {
        const { audio, timers } = setup()
        audio.playMusic("title")
        audio.stopMusic()
        audio.unlock()
        expect(timers.setTimer).not.toHaveBeenCalled()
    })
})

describe("browserAudioContext", () => {
    it("makes the scope's AudioContext, or nothing without one", () => {
        const made = fakeContext() as unknown as AudioContextLike
        const AudioContext = vi.fn(function () {
            return made
        }) as unknown as new () => AudioContextLike
        expect(browserAudioContext({ AudioContext })()).toBe(made)
        expect(browserAudioContext({})()).toBeUndefined()
    })
})
