// A fixed-timestep game loop: game logic advances in steps of exactly
// `stepMs`, however often frames arrive, and rendering happens once per frame.
// It has no DOM access; the clock and the frame scheduler are injected so
// tests can drive it by hand.

export type LoopOptions = {
    // Advance the game by one step. `dt` is the step length in seconds.
    update: (dt: number) => void
    // Draw the current state. `alpha` in [0, 1) is how far the time not yet
    // simulated reaches into the next step, for interpolating between steps.
    render: (alpha: number) => void
    // Length of one logic step in milliseconds.
    stepMs: number
    // Longest frame gap the loop catches up on. A longer gap (a background
    // tab, a debugger pause) is cut to this, so the game slows down instead of
    // running hundreds of steps at once.
    maxFrameMs: number
    // Current time in milliseconds, e.g. performance.now.
    now: () => number
    // Schedule `callback` for the next frame, e.g. requestAnimationFrame.
    requestFrame: (callback: () => void) => number
    cancelFrame: (id: number) => void
}

export type Loop = {
    // Start from a clean slate. Does nothing if already running.
    start(): void
    // Stop and forget any time not yet simulated.
    stop(): void
    // Freeze the game; time spent paused is not simulated on resume.
    pause(): void
    resume(): void
    readonly running: boolean
    readonly paused: boolean
}

export function createLoop(options: LoopOptions): Loop {
    const { update, render, stepMs, maxFrameMs, now } = options
    let running = false
    let paused = false
    let frameId: number | undefined
    let last = 0
    // Time that has passed but not yet been simulated, in milliseconds.
    let accumulator = 0

    function schedule() {
        frameId = options.requestFrame(frame)
    }

    function unschedule() {
        if (frameId !== undefined) options.cancelFrame(frameId)
        frameId = undefined
    }

    function frame() {
        frameId = undefined
        const time = now()
        accumulator += Math.min(Math.max(time - last, 0), maxFrameMs)
        last = time
        // update may stop or pause the loop (e.g. when the game ends); no
        // further steps run after that.
        while (accumulator >= stepMs && running && !paused) {
            update(stepMs / 1000)
            accumulator -= stepMs
        }
        render(accumulator / stepMs)
        if (running && !paused && frameId === undefined) schedule()
    }

    function begin() {
        last = now()
        schedule()
    }

    return {
        start() {
            if (running) return
            running = true
            paused = false
            accumulator = 0
            begin()
        },
        stop() {
            running = false
            paused = false
            accumulator = 0
            unschedule()
        },
        pause() {
            if (!running || paused) return
            paused = true
            unschedule()
        },
        resume() {
            if (!running || !paused) return
            paused = false
            begin()
        },
        get running() {
            return running
        },
        get paused() {
            return paused
        },
    }
}
