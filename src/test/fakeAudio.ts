import { vi } from "vite-plus/test"

// A stand-in for the Web Audio graph that records what the audio engine
// (audio.ts) does, and hand-driven timers for its music scheduler.

export type ParamEvent = [kind: string, value: number, time: number]

export class FakeParam {
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

export class FakeNode {
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

export class FakeGain extends FakeNode {
    gain = new FakeParam()
}

export class FakeSource extends FakeNode {
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

export class FakeOscillator extends FakeSource {
    type = "sine"
    frequency = new FakeParam()
}

export class FakeBufferSource extends FakeSource {
    buffer: unknown = null
    loop = false
}

export class FakeFilter extends FakeNode {
    type = "lowpass"
    frequency = new FakeParam()
}

export function fakeContext() {
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

// Hand-driven timers: `fire()` runs every live one.
export function fakeTimers() {
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
