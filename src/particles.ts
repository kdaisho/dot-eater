import type { Vec2 } from "./vec2"

// Particle effects (KDA-213): short bursts of coloured specks for breaths,
// eaten dots, defeated enemies and the like. Purely visual: nothing in the
// game reads them. Pure, no DOM: time comes in as `dt` and randomness is
// injected, so it is unit-tested directly; render.ts draws the particles.
//
// Positions are in cell units like glidePos (cell centres at whole numbers),
// so a burst is spawned at a cell and drawn wherever the maze is.

// How a burst looks: how many particles, how they fly and fade. Breaths
// carry one each (BreathDef.particles), so render.ts never knows a breath;
// the other bursts are in BURSTS.
export type ParticleLook = {
    // CSS colours; each particle takes one at random.
    colors: readonly string[]
    // Particles per burst (per cell, for a breath).
    count: number
    // Seconds a particle lasts at most; each lasts between half and all of
    // it.
    life: number
    // Starting speed in cells per second at most; each flies at between half
    // and all of it.
    speed: number
    // The angle (radians) the particles fan out over, centred on the burst's
    // direction: 0 flies straight along it, 2π all round.
    spread: number
    // A particle's size (its diameter) as a fraction of a cell.
    size: number
    // How far from the cell centre (in cells, either way on each axis) a
    // particle may start. Leave it out for 0, the centre.
    jitter?: number
    // Pull downwards, in cells per second squared (e.g. falling rubble).
    gravity?: number
    // How quickly particles slow down: the fraction of speed lost per second
    // is about 1 - e^-drag. Leave it out for none.
    drag?: number
    // Drawn as discs, or as squares (chunks).
    shape?: "circle" | "square"
}

export type Particle = {
    x: number
    y: number
    // Velocity in cells per second.
    vx: number
    vy: number
    // Seconds since it was spawned, and how long it lasts.
    age: number
    life: number
    // Diameter, in cells.
    size: number
    color: string
    shape: "circle" | "square"
    gravity: number
    drag: number
}

// The bursts that aren't a breath's (breaths carry their own look). A
// Record over BurstKind, so a new kind without a look is a type error.
export type BurstKind =
    | "dot"
    | "defeat"
    | "hurt"
    | "caught"
    | "bossHit"
    | "bossDefeat"

export const BURSTS: Readonly<Record<BurstKind, ParticleLook>> = {
    // A few small crumbs where a dot was eaten.
    dot: {
        colors: ["#000", "#f59e0b"],
        count: 4,
        life: 0.3,
        speed: 1.5,
        spread: Math.PI * 2,
        size: 0.08,
        drag: 3,
    },
    // A poof of smoke and sparks where an enemy was defeated.
    defeat: {
        colors: ["#9ca3af", "#6b7280", "#f59e0b", "#ef4444"],
        count: 14,
        life: 0.6,
        speed: 2.5,
        spread: Math.PI * 2,
        size: 0.14,
        jitter: 0.15,
        drag: 2.5,
    },
    // A few red sparks round a player who was hurt (KDA-257): a smaller
    // version of the knockout's.
    hurt: {
        colors: ["#dc2626", "#f87171"],
        count: 8,
        life: 0.4,
        speed: 2.2,
        spread: Math.PI * 2,
        size: 0.1,
        drag: 2.5,
    },
    // Red sparks round a player who was knocked out.
    caught: {
        colors: ["#dc2626", "#f87171", "#7f1d1d"],
        count: 18,
        life: 0.7,
        speed: 3,
        spread: Math.PI * 2,
        size: 0.13,
        drag: 2,
    },
    // A splash of reds where a breath hit the boss.
    bossHit: {
        colors: ["#991b1b", "#f87171", "#dc2626"],
        count: 10,
        life: 0.45,
        speed: 3,
        spread: Math.PI * 2,
        size: 0.12,
        jitter: 0.4,
        drag: 2,
    },
    // A big, colourful blast when the boss goes down.
    bossDefeat: {
        colors: ["#dc2626", "#f59e0b", "#fbbf24", "#a855f7", "#16a34a"],
        count: 60,
        life: 1.2,
        speed: 5,
        spread: Math.PI * 2,
        size: 0.18,
        jitter: 0.5,
        gravity: 3,
        drag: 1.5,
    },
}

// With reduced motion (prefers-reduced-motion): fewer particles (this
// fraction of the count, at least one), living shorter and flying slower
// (these fractions of the look's life and speed).
export const REDUCED_COUNT = 0.35
export const REDUCED_LIFE = 0.5
export const REDUCED_SPEED = 0.5

// The most particles alive at once; past it the oldest go first.
export const MAX_PARTICLES = 400

export type BurstOptions = {
    // The way the burst flies (a step such as the breath's facing); its
    // spread fans out round it. Defaults to right, which only matters for a
    // look that doesn't fly all round.
    direction?: Vec2
    // A factor on the look's count (e.g. 2 for a bigger burst).
    scale?: number
}

export type ParticlesOptions = {
    // Returns a number in [0, 1), e.g. Math.random.
    random: () => number
    // Start in reduced-motion mode (see REDUCED_COUNT); can be changed later.
    reduced?: boolean
    // Defaults to MAX_PARTICLES.
    max?: number
}

export type Particles = {
    // Spawn one of the BURSTS at `at` (cell units).
    burst(kind: BurstKind, at: Vec2, options?: BurstOptions): void
    // Spawn a burst of any look at `at`, e.g. a breath's on each cell it
    // struck (BreathDef.particles).
    emit(look: ParticleLook, at: Vec2, options?: BurstOptions): void
    // Move every particle on by `dt` seconds and drop those whose time is up.
    update(dt: number): void
    // Drop every particle, e.g. when a new game starts.
    clear(): void
    // The particles alive, oldest first, for the renderer.
    readonly list: readonly Particle[]
    // Reduced-motion mode: new bursts are smaller and shorter. Bursts
    // already flying keep going.
    reduced: boolean
}

export function createParticles(options: ParticlesOptions): Particles {
    const { random } = options
    const max = options.max ?? MAX_PARTICLES
    let list: Particle[] = []
    let reduced = options.reduced ?? false
    // Between half and all of `x`.
    const vary = (x: number) => x * (0.5 + random() / 2)

    function emit(look: ParticleLook, at: Vec2, opts: BurstOptions = {}) {
        const scale = opts.scale ?? 1
        const base = look.count * scale * (reduced ? REDUCED_COUNT : 1)
        const count =
            look.count > 0 && scale > 0 ? Math.max(1, Math.round(base)) : 0
        const life = look.life * (reduced ? REDUCED_LIFE : 1)
        const speed = look.speed * (reduced ? REDUCED_SPEED : 1)
        const dir = opts.direction ?? { x: 1, y: 0 }
        const heading = Math.atan2(dir.y, dir.x)
        const jitter = look.jitter ?? 0
        for (let i = 0; i < count; i++) {
            const angle = heading + (random() - 0.5) * look.spread
            const v = vary(speed)
            list.push({
                x: at.x + (random() * 2 - 1) * jitter,
                y: at.y + (random() * 2 - 1) * jitter,
                vx: Math.cos(angle) * v,
                vy: Math.sin(angle) * v,
                age: 0,
                life: vary(life),
                size: look.size,
                color: look.colors[Math.floor(random() * look.colors.length)],
                shape: look.shape ?? "circle",
                gravity: look.gravity ?? 0,
                drag: look.drag ?? 0,
            })
        }
        if (list.length > max) list = list.slice(list.length - max)
    }

    return {
        burst(kind, at, opts) {
            emit(BURSTS[kind], at, opts)
        },
        emit,
        update(dt) {
            for (const p of list) {
                p.age += dt
                p.vy += p.gravity * dt
                if (p.drag > 0) {
                    const keep = Math.exp(-p.drag * dt)
                    p.vx *= keep
                    p.vy *= keep
                }
                p.x += p.vx * dt
                p.y += p.vy * dt
            }
            list = list.filter((p) => p.age < p.life)
        },
        clear() {
            list = []
        },
        get list() {
            return list
        },
        get reduced() {
            return reduced
        },
        set reduced(value: boolean) {
            reduced = value
        },
    }
}

// How opaque to draw a particle: fully at first, fading out to nothing at
// the end of its life.
export function particleAlpha(p: Particle): number {
    if (p.life <= 0) return 0
    return Math.max(0, Math.min(1, 1 - p.age / p.life))
}
