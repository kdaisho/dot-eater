import { describe, expect, it } from "vite-plus/test"
import { createLoop, type LoopOptions } from "./loop"

// A hand-driven clock and frame scheduler. `frame(ms)` advances the clock and
// runs the pending frame callback, if any.
function harness(overrides: Partial<LoopOptions> = {}) {
    let time = 1000
    let nextId = 1
    let pending: { id: number; callback: () => void } | undefined
    const updates: number[] = []
    const renders: number[] = []
    const loop = createLoop({
        update: (dt) => updates.push(dt),
        render: (alpha) => renders.push(alpha),
        stepMs: 10,
        maxFrameMs: 100,
        now: () => time,
        requestFrame: (callback) => {
            pending = { id: nextId++, callback }
            return pending.id
        },
        cancelFrame: (id) => {
            if (pending?.id === id) pending = undefined
        },
        ...overrides,
    })
    return {
        loop,
        updates,
        renders,
        get scheduled() {
            return pending !== undefined
        },
        advance(ms: number) {
            time += ms
        },
        frame(ms: number) {
            time += ms
            const p = pending
            pending = undefined
            p?.callback()
        },
    }
}

describe("createLoop", () => {
    it("runs one fixed step per elapsed step length", () => {
        const h = harness()
        h.loop.start()
        h.frame(10)
        expect(h.updates).toEqual([0.01])
        h.frame(35)
        expect(h.updates).toHaveLength(4)
        // The leftover 5 ms carries over: 5 + 5 makes one more step.
        h.frame(5)
        expect(h.updates).toHaveLength(5)
    })

    it("runs no step on a frame shorter than a step, but still renders", () => {
        const h = harness()
        h.loop.start()
        h.frame(4)
        h.frame(4)
        expect(h.updates).toHaveLength(0)
        expect(h.renders).toHaveLength(2)
        h.frame(4)
        expect(h.updates).toHaveLength(1)
    })

    it("renders once per frame with the fraction of a step left over", () => {
        const h = harness()
        h.loop.start()
        h.frame(25)
        h.frame(2.5)
        expect(h.renders).toHaveLength(2)
        expect(h.renders[0]).toBeCloseTo(0.5)
        expect(h.renders[1]).toBeCloseTo(0.75)
    })

    it("clamps a long frame gap", () => {
        const h = harness()
        h.loop.start()
        h.frame(10_000)
        expect(h.updates).toHaveLength(10) // maxFrameMs 100 / stepMs 10
    })

    it("ignores a clock that goes backwards", () => {
        const h = harness()
        h.loop.start()
        h.frame(-50)
        h.frame(10)
        expect(h.updates).toHaveLength(1)
    })

    it("does not simulate time spent paused", () => {
        const h = harness()
        h.loop.start()
        h.frame(10)
        h.loop.pause()
        expect(h.loop.paused).toBe(true)
        expect(h.scheduled).toBe(false)
        h.advance(60)
        h.loop.resume()
        expect(h.loop.paused).toBe(false)
        h.frame(10)
        expect(h.updates).toHaveLength(2)
    })

    it("keeps leftover time across a pause", () => {
        const h = harness()
        h.loop.start()
        h.frame(15)
        h.loop.pause()
        h.advance(1000)
        h.loop.resume()
        h.frame(5)
        expect(h.updates).toHaveLength(2)
    })

    it("stops scheduling frames when stopped, and restarts cleanly", () => {
        const h = harness()
        h.loop.start()
        h.frame(15)
        h.loop.stop()
        expect(h.loop.running).toBe(false)
        expect(h.scheduled).toBe(false)
        h.advance(1000)
        h.loop.start()
        h.frame(5)
        // The 5 ms left over before stop() is forgotten.
        expect(h.updates).toHaveLength(1)
    })

    it("ignores start while running and resume while not paused", () => {
        const h = harness()
        h.loop.start()
        h.frame(5)
        h.loop.start()
        h.loop.resume()
        h.frame(5)
        expect(h.updates).toHaveLength(1)
    })

    it("runs no further steps in a frame once update stops the loop", () => {
        const updates: number[] = []
        const h = harness({
            update: (dt) => {
                updates.push(dt)
                h.loop.stop()
            },
        })
        h.loop.start()
        h.frame(50)
        expect(updates).toHaveLength(1)
        expect(h.renders).toHaveLength(1)
        expect(h.scheduled).toBe(false)
    })

    it("runs no further steps in a frame once update pauses the loop", () => {
        const updates: number[] = []
        const h = harness({
            update: (dt) => {
                updates.push(dt)
                h.loop.pause()
            },
        })
        h.loop.start()
        h.frame(50)
        expect(updates).toHaveLength(1)
        expect(h.scheduled).toBe(false)
    })
})
