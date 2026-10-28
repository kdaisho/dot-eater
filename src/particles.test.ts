import { describe, expect, it } from "vite-plus/test"
import { BREATHS } from "./breaths"
import {
    BURSTS,
    createParticles,
    MAX_PARTICLES,
    particleAlpha,
    REDUCED_COUNT,
    REDUCED_LIFE,
    REDUCED_SPEED,
    type BurstKind,
    type ParticleLook,
} from "./particles"
import { ANIMAL_IDS } from "./roster"
import { vec2 } from "./vec2"

// A look with easy numbers: no jitter, no spread, no drag.
const LOOK: ParticleLook = {
    colors: ["red"],
    count: 10,
    life: 1,
    speed: 2,
    spread: 0,
    size: 0.1,
}

// Always the same number, so every particle is alike.
const fixed = (n: number) => () => n

// Cycles through `values`.
function sequence(values: number[]) {
    let i = 0
    return () => values[i++ % values.length]
}

describe("createParticles", () => {
    it("starts empty", () => {
        expect(createParticles({ random: Math.random }).list).toEqual([])
    })

    it("spawns a look's count of particles at the cell", () => {
        const particles = createParticles({ random: fixed(0.5) })
        particles.emit(LOOK, vec2(3, 4))
        expect(particles.list).toHaveLength(10)
        for (const p of particles.list) {
            expect(p).toMatchObject({ x: 3, y: 4, age: 0, color: "red" })
            expect(p.size).toBe(0.1)
            expect(p.shape).toBe("circle")
        }
    })

    it("scales the count", () => {
        const particles = createParticles({ random: fixed(0.5) })
        particles.emit(LOOK, vec2(0, 0), { scale: 2.5 })
        expect(particles.list).toHaveLength(25)
    })

    it("spawns nothing for a count or scale of 0", () => {
        const particles = createParticles({ random: fixed(0.5) })
        particles.emit({ ...LOOK, count: 0 }, vec2(0, 0))
        particles.emit(LOOK, vec2(0, 0), { scale: 0 })
        expect(particles.list).toEqual([])
    })

    it("flies along the direction with no spread", () => {
        // random 0.999...: full speed and life.
        const particles = createParticles({ random: fixed(1 - 1e-12) })
        particles.emit(LOOK, vec2(0, 0), { direction: vec2(0, -1) })
        const p = particles.list[0]
        expect(p.vx).toBeCloseTo(0)
        expect(p.vy).toBeCloseTo(-2)
        expect(p.life).toBeCloseTo(1)
    })

    it("flies right by default", () => {
        const particles = createParticles({ random: fixed(1 - 1e-12) })
        particles.emit(LOOK, vec2(0, 0))
        expect(particles.list[0].vx).toBeCloseTo(2)
        expect(particles.list[0].vy).toBeCloseTo(0)
    })

    it("fans out over the spread, centred on the direction", () => {
        // The angle takes the first random of each particle: 0 is one edge
        // of the spread, almost 1 the other.
        const spread = Math.PI / 2
        for (const [r, angle] of [
            [0, -spread / 2],
            [0.5, 0],
            [1 - 1e-12, spread / 2],
        ]) {
            const particles = createParticles({ random: fixed(r) })
            particles.emit({ ...LOOK, count: 1, spread }, vec2(0, 0))
            const p = particles.list[0]
            expect(Math.atan2(p.vy, p.vx)).toBeCloseTo(angle)
        }
    })

    it("varies speed and life between half and all of the look's", () => {
        for (const r of [0, 0.3, 0.7, 1 - 1e-12]) {
            const particles = createParticles({ random: fixed(r) })
            particles.emit(LOOK, vec2(0, 0))
            for (const p of particles.list) {
                expect(Math.hypot(p.vx, p.vy)).toBeGreaterThanOrEqual(1)
                expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(2)
                expect(p.life).toBeGreaterThanOrEqual(0.5)
                expect(p.life).toBeLessThanOrEqual(1)
            }
        }
    })

    it("starts particles within the jitter of the cell centre", () => {
        const particles = createParticles({ random: Math.random })
        particles.emit({ ...LOOK, count: 50, jitter: 0.3 }, vec2(5, 5))
        for (const p of particles.list) {
            expect(Math.abs(p.x - 5)).toBeLessThanOrEqual(0.3)
            expect(Math.abs(p.y - 5)).toBeLessThanOrEqual(0.3)
        }
        expect(particles.list.some((p) => p.x !== 5)).toBe(true)
    })

    it("picks each particle's colour from the look's", () => {
        const particles = createParticles({
            random: sequence([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
        })
        particles.emit(
            { ...LOOK, colors: ["a", "b", "c"], count: 30 },
            vec2(0, 0)
        )
        const colors = new Set(particles.list.map((p) => p.color))
        expect([...colors].sort()).toEqual(["a", "b", "c"])
    })

    it("draws a look's shape", () => {
        const particles = createParticles({ random: fixed(0.5) })
        particles.emit({ ...LOOK, shape: "square" }, vec2(0, 0))
        expect(particles.list[0].shape).toBe("square")
    })

    it("spawns one of the BURSTS by kind", () => {
        const particles = createParticles({ random: fixed(0.5) })
        particles.burst("defeat", vec2(2, 2))
        expect(particles.list).toHaveLength(BURSTS.defeat.count)
        for (const p of particles.list) {
            expect(BURSTS.defeat.colors).toContain(p.color)
        }
    })

    describe("update", () => {
        it("moves each particle by its velocity and ages it", () => {
            const particles = createParticles({ random: fixed(1 - 1e-12) })
            particles.emit({ ...LOOK, count: 1 }, vec2(1, 1))
            particles.update(0.25)
            const p = particles.list[0]
            expect(p.x).toBeCloseTo(1.5)
            expect(p.y).toBeCloseTo(1)
            expect(p.age).toBe(0.25)
        })

        it("drops particles whose life is up", () => {
            const particles = createParticles({ random: fixed(1 - 1e-12) })
            particles.emit({ ...LOOK, count: 3 }, vec2(0, 0))
            particles.update(0.5)
            expect(particles.list).toHaveLength(3)
            particles.update(0.5)
            expect(particles.list).toEqual([])
        })

        it("drops shorter-lived particles first", () => {
            const particles = createParticles({ random: fixed(0) })
            // Half the look's life: 0.5 s.
            particles.emit({ ...LOOK, count: 2 }, vec2(0, 0))
            const long = createParticles({ random: fixed(1 - 1e-12) })
            long.emit({ ...LOOK, count: 2 }, vec2(0, 0))
            particles.update(0.6)
            long.update(0.6)
            expect(particles.list).toEqual([])
            expect(long.list).toHaveLength(2)
        })

        it("pulls particles down with gravity", () => {
            const particles = createParticles({ random: fixed(0.5) })
            particles.emit(
                { ...LOOK, count: 1, speed: 0, gravity: 4 },
                vec2(0, 0)
            )
            particles.update(0.5)
            const p = particles.list[0]
            expect(p.vy).toBeCloseTo(2)
            expect(p.y).toBeGreaterThan(0)
            expect(p.x).toBeCloseTo(0)
        })

        it("slows particles down with drag", () => {
            const particles = createParticles({ random: fixed(1 - 1e-12) })
            particles.emit({ ...LOOK, count: 1, drag: 2 }, vec2(0, 0))
            particles.update(0.5)
            expect(particles.list[0].vx).toBeCloseTo(2 * Math.exp(-1))
        })

        it("doesn't move without time passing", () => {
            const particles = createParticles({ random: fixed(0.5) })
            particles.emit(LOOK, vec2(2, 3))
            particles.update(0)
            expect(particles.list.every((p) => p.x === 2 && p.y === 3)).toBe(
                true
            )
        })
    })

    it("keeps at most `max` particles, dropping the oldest", () => {
        const particles = createParticles({ random: fixed(0.5), max: 15 })
        particles.emit({ ...LOOK, colors: ["old"] }, vec2(0, 0))
        particles.emit({ ...LOOK, colors: ["new"] }, vec2(0, 0))
        expect(particles.list).toHaveLength(15)
        expect(particles.list.filter((p) => p.color === "old")).toHaveLength(5)
        expect(particles.list.at(-1)?.color).toBe("new")
    })

    it("keeps at most MAX_PARTICLES by default", () => {
        const particles = createParticles({ random: fixed(0.5) })
        for (let i = 0; i < 20; i++) particles.burst("bossDefeat", vec2(0, 0))
        expect(particles.list).toHaveLength(MAX_PARTICLES)
    })

    it("clears every particle", () => {
        const particles = createParticles({ random: fixed(0.5) })
        particles.emit(LOOK, vec2(0, 0))
        particles.clear()
        expect(particles.list).toEqual([])
    })

    describe("with reduced motion", () => {
        it("spawns fewer, shorter-lived, slower particles", () => {
            const random = fixed(1 - 1e-12)
            const full = createParticles({ random })
            const reduced = createParticles({ random, reduced: true })
            full.emit(LOOK, vec2(0, 0))
            reduced.emit(LOOK, vec2(0, 0))
            expect(reduced.list).toHaveLength(
                Math.round(LOOK.count * REDUCED_COUNT)
            )
            expect(reduced.list.length).toBeLessThan(full.list.length)
            expect(reduced.list[0].life).toBeCloseTo(
                full.list[0].life * REDUCED_LIFE
            )
            expect(reduced.list[0].vx).toBeCloseTo(
                full.list[0].vx * REDUCED_SPEED
            )
        })

        it("still spawns at least one particle", () => {
            const particles = createParticles({
                random: fixed(0.5),
                reduced: true,
            })
            particles.emit({ ...LOOK, count: 1 }, vec2(0, 0))
            expect(particles.list).toHaveLength(1)
        })

        it("can be switched on and off; bursts already flying keep going", () => {
            const particles = createParticles({ random: fixed(0.5) })
            expect(particles.reduced).toBe(false)
            particles.emit(LOOK, vec2(0, 0))
            particles.reduced = true
            expect(particles.reduced).toBe(true)
            particles.emit(LOOK, vec2(0, 0))
            expect(particles.list).toHaveLength(10 + 4)
            particles.reduced = false
            particles.emit(LOOK, vec2(0, 0))
            expect(particles.list).toHaveLength(10 + 4 + 10)
        })
    })
})

describe("particleAlpha", () => {
    it("fades from fully opaque to nothing over the particle's life", () => {
        const particles = createParticles({ random: fixed(1 - 1e-12) })
        particles.emit({ ...LOOK, count: 1 }, vec2(0, 0))
        const p = particles.list[0]
        expect(particleAlpha(p)).toBeCloseTo(1)
        particles.update(0.25)
        expect(particleAlpha(p)).toBeCloseTo(0.75)
        particles.update(0.5)
        expect(particleAlpha(p)).toBeCloseTo(0.25)
    })

    it("is 0 past the particle's life or for no life", () => {
        const p = {
            ...createParticle(),
            age: 2,
            life: 1,
        }
        expect(particleAlpha(p)).toBe(0)
        expect(particleAlpha({ ...p, age: 0, life: 0 })).toBe(0)
    })
})

function createParticle() {
    const particles = createParticles({ random: fixed(0.5) })
    particles.emit({ ...LOOK, count: 1 }, vec2(0, 0))
    return particles.list[0]
}

// Every look must spawn something visible that goes away.
function expectSaneLook(look: ParticleLook) {
    expect(look.colors.length).toBeGreaterThan(0)
    expect(look.count).toBeGreaterThan(0)
    expect(look.life).toBeGreaterThan(0)
    expect(look.life).toBeLessThanOrEqual(2)
    expect(look.speed).toBeGreaterThanOrEqual(0)
    expect(look.size).toBeGreaterThan(0)
    expect(look.spread).toBeGreaterThanOrEqual(0)
    expect(look.spread).toBeLessThanOrEqual(Math.PI * 2)
}

describe("BURSTS", () => {
    it.each(Object.keys(BURSTS) as BurstKind[])("%s is a sane look", (kind) => {
        expectSaneLook(BURSTS[kind])
    })
})

describe("breath particles", () => {
    it.each(ANIMAL_IDS)("the %s's breath has a sane look", (animal) => {
        const look = BREATHS[animal].particles
        expect(look).toBeDefined()
        expectSaneLook(look!)
    })

    it("gives every breath a look of its own", () => {
        const looks = ANIMAL_IDS.map((a) => BREATHS[a].particles)
        expect(new Set(looks).size).toBe(ANIMAL_IDS.length)
        const palettes = looks.map((l) => l?.colors.join())
        expect(new Set(palettes).size).toBe(ANIMAL_IDS.length)
    })
})
