// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { END_CONFIRM_DELAY } from "./flow"
import type { GameEvent } from "./events"
import type { GameState, Outcome } from "./game"
import type { Particles } from "./particles"
import type { Effects } from "./render"
import type { Shake } from "./shake"
import { vec2 } from "./vec2"

// main's wiring of particles and screen shake (KDA-213): effects start over
// with each game, freeze while paused, are hidden on end screens, and the
// Screen shake setting turns the shake on and off at once. (A separate
// file, since main is imported once per module graph.)

vi.mock("canvas-confetti", () => ({ default: vi.fn() }))

// The particle system and shake main makes, and the effects of its latest
// draw.
const seen = vi.hoisted(() => ({
    particles: undefined as Particles | undefined,
    shake: undefined as Shake | undefined,
    updates: 0,
    effects: undefined as Effects | undefined,
}))
vi.mock("./particles", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./particles")>()
    return {
        ...actual,
        createParticles: (
            ...args: Parameters<typeof actual.createParticles>
        ) => {
            const particles = actual.createParticles(...args)
            const update = particles.update.bind(particles)
            particles.update = (dt) => {
                seen.updates++
                update(dt)
            }
            seen.particles = particles
            return particles
        },
    }
})
vi.mock("./shake", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./shake")>()
    return {
        ...actual,
        createShake: (...args: Parameters<typeof actual.createShake>) => {
            seen.shake = actual.createShake(...args)
            return seen.shake
        },
    }
})
vi.mock("./render", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./render")>()
    return {
        ...actual,
        createRenderer: (...args: Parameters<typeof actual.createRenderer>) => {
            const renderer = actual.createRenderer(...args)
            return {
                ...renderer,
                draw: (...a: Parameters<typeof renderer.draw>) => {
                    seen.effects = a[4]
                    renderer.draw(...a)
                },
            }
        },
    }
})

// The game steps report what the test puts in `nextEvents` (on every step
// until changed) and end as `nextOutcome` says; nothing else happens.
let nextEvents: GameEvent[] = []
let nextOutcome: Outcome | null = null
let steps = 0
vi.mock("./game", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./game")>()
    return {
        ...actual,
        step: (state: GameState) => {
            steps++
            state.events = [...nextEvents]
            const outcome = nextOutcome
            nextOutcome = null
            return outcome
        },
    }
})

// The system asks for reduced motion.
const media = { matches: true, addEventListener: vi.fn() }

function pressAndTick(code: string, ms = 100) {
    dispatchEvent(new KeyboardEvent("keydown", { code }))
    dispatchEvent(new KeyboardEvent("keyup", { code }))
    vi.advanceTimersByTime(ms)
}

const overlay = () => document.querySelector<HTMLElement>("#overlay")
const screen = () => overlay()?.dataset.screen ?? "playing"
const selectedItem = () => overlay()?.querySelector("li.selected")?.textContent
const ages = () => seen.particles!.list.map((p) => p.age)

const crumbs: GameEvent[] = [{ type: "dotEaten", player: 0, at: vec2(1, 1) }]

describe("main's particles and shake", () => {
    beforeAll(async () => {
        vi.useFakeTimers()
        window.matchMedia = vi.fn(() => media) as never
        document.body.innerHTML = '<canvas id="game"></canvas>'
        await import("./main")
        expect(screen()).toBe("title")
    })

    it("follows reduced motion until Screen shake is set, at once", () => {
        expect(seen.particles!.reduced).toBe(true)
        expect(seen.shake!.enabled).toBe(false)
        // Title → Settings → Screen shake.
        for (let i = 0; i < 3; i++) pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Settings")
        pressAndTick("Space")
        for (let i = 0; i < 3; i++) pressAndTick("ArrowDown")
        expect(selectedItem()).toBe("Screen shake Off")
        pressAndTick("Space")
        expect(selectedItem()).toBe("Screen shake On")
        expect(seen.shake!.enabled).toBe(true)
        // Particles still follow reduced motion.
        expect(seen.particles!.reduced).toBe(true)
        pressAndTick("Space")
        expect(selectedItem()).toBe("Screen shake Off")
        expect(seen.shake!.enabled).toBe(false)
        pressAndTick("Space")
        expect(seen.shake!.enabled).toBe(true)
        // Back to the title, then into a game.
        pressAndTick("Escape")
        for (let i = 0; i < 3; i++) pressAndTick("ArrowUp")
        pressAndTick("Space")
        pressAndTick("ArrowDown")
        pressAndTick("Space")
        pressAndTick("Space")
        pressAndTick("Space")
        pressAndTick("Space")
        expect(screen()).toBe("playing")
    })

    it("draws the game's particles and moves them on with its steps", () => {
        nextEvents = crumbs
        vi.advanceTimersByTime(100)
        nextEvents = []
        expect(seen.particles!.list.length).toBeGreaterThan(0)
        expect(seen.effects?.particles).toBe(seen.particles!.list)
        expect(seen.effects?.shake).toBeDefined()
        expect(seen.effects?.aim).toBe(true)
        // The Facing guide setting's default.
        expect(seen.effects?.guide).toBe("arrow")
        expect(seen.effects?.bossBreath).toBe(true)
    })

    // Regression (the resume tick): effects moved on once more than the
    // game, on the tick that resumed it.
    it("freezes the effects while paused, and moves them only with steps", () => {
        // Particles that outlast the pause.
        seen.particles!.clear()
        seen.particles!.emit(
            {
                colors: ["#000"],
                count: 3,
                life: 60,
                speed: 0,
                spread: 0,
                size: 0.1,
            },
            vec2(2, 1)
        )
        const updates = seen.updates
        const stepped = steps
        pressAndTick("KeyP")
        expect(screen()).toBe("pause")
        const before = ages()
        vi.advanceTimersByTime(1000)
        expect(ages()).toEqual(before)
        // Still drawn, frozen, with no shake.
        expect(seen.effects?.particles).toBe(seen.particles!.list)
        expect(seen.effects?.shake).toBeUndefined()
        // No aim preview while paused.
        expect(seen.effects?.aim).toBeUndefined()
        // The arrow still shows on the paused board.
        expect(seen.effects?.guide).toBe("arrow")
        expect(seen.effects?.bossBreath).toBe(true)
        pressAndTick("KeyP")
        expect(screen()).toBe("playing")
        expect(seen.updates - updates).toBe(steps - stepped)
    })

    it("hides the effects on end screens", () => {
        nextEvents = crumbs
        vi.advanceTimersByTime(100)
        nextEvents = []
        nextOutcome = "dead"
        vi.advanceTimersByTime(2000)
        expect(screen()).toBe("game-over")
        expect(seen.particles!.list.length).toBeGreaterThan(0)
        expect(seen.effects).toEqual({})
    })

    it("starts a retry with no particles or shake left over", () => {
        seen.shake!.add(1)
        vi.advanceTimersByTime(END_CONFIRM_DELAY * 1000)
        expect(selectedItem()).toBe("Retry")
        pressAndTick("Space")
        expect(screen()).toBe("playing")
        expect(seen.particles!.list).toEqual([])
        expect(seen.shake!.trauma).toBe(0)
    })
})
