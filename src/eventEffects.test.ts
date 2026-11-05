import { describe, expect, it } from "vite-plus/test"
import { BOSS_BREATH } from "./bossBreath"
import { ENEMY_BREATH } from "./enemyBreath"
import { BREATHS } from "./breaths"
import { TICK_RATE } from "./constants"
import {
    applyMotion,
    effectsForEvent,
    effectsForEvents,
    type EffectTargets,
} from "./eventEffects"
import { takeEvents, type GameEvent } from "./events"
import { step, type GameState, type MoveInput } from "./game"
import { BURSTS, createParticles, type ParticleLook } from "./particles"
import type { PresentContent } from "./present"
import { defaultSettings } from "./settings"
import { createShake, SHAKES } from "./shake"
import {
    fixedRandom,
    lineFire,
    makeBoss,
    makeState,
    testBreath,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// Records what the effects asked for.
function recorder() {
    const bursts: { kind: string; at: Vec2 }[] = []
    const emits: {
        look: ParticleLook
        at: Vec2
        direction: Vec2 | undefined
    }[] = []
    const shakes: number[] = []
    const targets: EffectTargets = {
        particles: {
            burst: (kind, at) => bursts.push({ kind, at }),
            emit: (look, at, options) =>
                emits.push({ look, at, direction: options?.direction }),
        },
        shake: { add: (amount) => shakes.push(amount) },
    }
    return { bursts, emits, shakes, targets }
}

// A room 7 cells wide and 5 high with walls round it, the player at (1, 2).
const ROOM = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
] as const

const room = (options: Parameters<typeof makeState>[3] = {}) =>
    makeState(ROOM, { x: 1, y: 2 }, [], options)

function run(event: GameEvent, state = room()) {
    const r = recorder()
    effectsForEvent(event, state, r.targets)
    return r
}

describe("effectsForEvent", () => {
    it("crumbs where a dot was eaten, without a shake", () => {
        const r = run({ type: "dotEaten", player: 0, at: vec2(3, 2) })
        expect(r.bursts).toEqual([{ kind: "dot", at: vec2(3, 2) }])
        expect(r.shakes).toEqual([])
    })

    it("a faint sparkle where a dot grew back, without a shake", () => {
        const r = run({ type: "dotRegrown", at: vec2(3, 2) })
        expect(r.bursts).toEqual([{ kind: "regrow", at: vec2(3, 2) }])
        expect(r.shakes).toEqual([])
        // Quieter than a dot's crumbs at most: many dots regrow.
        expect(BURSTS.regrow.count).toBeLessThanOrEqual(BURSTS.dot.count)
    })

    it("a small splat where a Splitter dropped a dot, without a shake", () => {
        const r = run({ type: "dotDropped", enemy: 0, at: vec2(3, 2) })
        expect(r.bursts).toEqual([{ kind: "drop", at: vec2(3, 2) }])
        expect(r.shakes).toEqual([])
    })

    it("a defeat burst and a hit shake where an enemy was defeated", () => {
        for (const split of [false, true]) {
            const r = run({
                type: "enemyDefeated",
                player: 0,
                enemy: 0,
                at: vec2(4, 1),
                split,
            })
            expect(r.bursts).toEqual([{ kind: "defeat", at: vec2(4, 1) }])
            expect(r.shakes).toEqual([SHAKES.hit])
        }
    })

    it("bursts in the middle of the boss's footprint when it is hit", () => {
        const r = run({
            type: "bossHit",
            player: 0,
            at: vec2(3, 1),
            health: 8,
        })
        expect(r.bursts).toEqual([{ kind: "bossHit", at: vec2(3.5, 1.5) }])
        expect(r.shakes).toEqual([SHAKES.hit])
    })

    it("neither bursts nor shakes on the killing blow: it is a hit-stop", () => {
        const r = run({ type: "bossDefeated", player: 1, at: vec2(2, 2) })
        expect(r.bursts).toEqual([])
        expect(r.shakes).toEqual([])
    })

    it("shakes hard as the boss shatters (KDA-301)", () => {
        const r = run({ type: "bossShattered", at: vec2(2.5, 2.5) })
        expect(r.bursts).toEqual([])
        expect(r.shakes).toEqual([SHAKES.shatter])
    })

    it("a jolt for each small blast of the chain, debris and a big shake for the big one", () => {
        const small = run({ type: "bossBlast", at: vec2(2.2, 2.9), big: false })
        expect(small.bursts).toEqual([])
        expect(small.shakes).toEqual([SHAKES.blast])
        const big = run({ type: "bossBlast", at: vec2(2.5, 2.5), big: true })
        expect(big.bursts).toEqual([{ kind: "bossDefeat", at: vec2(2.5, 2.5) }])
        expect(big.shakes).toEqual([SHAKES.bigBlast])
    })

    it("the boss's breath look on every cell it struck, and a small shake", () => {
        const cells = [vec2(3, 1), vec2(3, 2), vec2(4, 1), vec2(4, 2)]
        const r = run({
            type: "bossBreathed",
            at: vec2(1, 1),
            facing: vec2(1, 0),
            cells,
        })
        expect(r.emits).toEqual(
            cells.map((at) => ({
                look: BOSS_BREATH.particles,
                at,
                direction: vec2(1, 0),
            }))
        )
        expect(r.bursts).toEqual([])
        expect(r.shakes).toEqual([SHAKES.bossBreath])
        expect(SHAKES.bossBreath).toBeLessThan(SHAKES.hit)
    })

    it("a breather's breath look on every cell it struck, and a smaller shake", () => {
        const cells = [vec2(2, 1), vec2(3, 1)]
        const r = run({
            type: "enemyBreathed",
            enemy: 1,
            at: vec2(1, 1),
            facing: vec2(1, 0),
            cells,
        })
        expect(r.emits).toEqual(
            cells.map((at) => ({
                look: ENEMY_BREATH.particles,
                at,
                direction: vec2(1, 0),
            }))
        )
        expect(r.bursts).toEqual([])
        expect(r.shakes).toEqual([SHAKES.enemyBreath])
        // Softer than the boss's (KDA-291).
        expect(SHAKES.enemyBreath).toBeLessThan(SHAKES.bossBreath)
        expect(ENEMY_BREATH.particles.count).toBeLessThan(
            BOSS_BREATH.particles.count
        )
    })

    it("nothing for a breather winding up (drawn from its state)", () => {
        const r = run({
            type: "enemyWindUp",
            enemy: 1,
            at: vec2(1, 1),
            facing: vec2(0, 1),
        })
        expect(r.emits).toEqual([])
        expect(r.bursts).toEqual([])
        expect(r.shakes).toEqual([])
    })

    it("nothing for the boss winding up (drawn from its state)", () => {
        const r = run({
            type: "bossWindUp",
            at: vec2(1, 1),
            facing: vec2(0, 1),
        })
        expect(r.emits).toEqual([])
        expect(r.bursts).toEqual([])
        expect(r.shakes).toEqual([])
    })

    it("a small red burst and a small shake when a player is hurt", () => {
        const r = run({ type: "hurt", player: 1, at: vec2(4, 1), damage: 25 })
        expect(r.bursts).toEqual([{ kind: "hurt", at: vec2(4, 1) }])
        expect(r.shakes).toEqual([SHAKES.hurt])
        expect(SHAKES.hurt).toBeLessThan(SHAKES.caught)
    })

    it("only the caught shake when a player is knocked out: its look is the knockout's", () => {
        const r = run({ type: "playerCaught", player: 0, at: vec2(2, 3) })
        expect(r.bursts).toEqual([])
        expect(r.shakes).toEqual([SHAKES.caught])
    })

    it("a light shake and no burst when a player is panicked", () => {
        const r = run({
            type: "playerPanicked",
            player: 1,
            by: 0,
            at: vec2(2, 3),
        })
        expect(r.bursts).toEqual([])
        expect(r.shakes).toEqual([SHAKES.panic])
        expect(SHAKES.panic).toBeLessThan(SHAKES.hurt)
    })

    // KDA-324.
    it("a sparkle per content as a box opens, and a shake for the Earthquake", () => {
        const at = vec2(2, 3)
        const open = (content: PresentContent) =>
            run({ type: "presentOpened", player: 0, at, content })
        expect(open("heal").bursts).toEqual([{ kind: "presentHeal", at }])
        expect(open("heal").shakes).toEqual([])
        expect(open("germ").bursts).toEqual([{ kind: "presentGerm", at }])
        const quake = open("quake")
        expect(quake.bursts).toEqual([{ kind: "presentQuake", at }])
        expect(quake.shakes).toEqual([SHAKES.quake])
        expect(run({ type: "presentExpired", at }).bursts).toEqual([
            { kind: "presentPuff", at },
        ])
        expect(run({ type: "presentDropped", at }).bursts).toEqual([])
    })

    it.each([{ type: "gameWon" }, { type: "gameLost" }] as GameEvent[])(
        "nothing for $type",
        (event) => {
            const r = run(event)
            expect(r.bursts).toEqual([])
            expect(r.emits).toEqual([])
            expect(r.shakes).toEqual([])
        }
    )

    describe("a breath", () => {
        const breathed = (
            at: Vec2,
            facing: Vec2,
            cells: readonly Vec2[],
            player = 0
        ): GameEvent => ({
            type: "breathed",
            player,
            animal: "dragon",
            at,
            facing,
            cells,
        })

        it("emits its look on every cell it covered, along the facing", () => {
            const state = room({ breath: BREATHS.dragon })
            const cells = [vec2(2, 2), vec2(3, 2), vec2(4, 2)]
            const r = run(breathed(vec2(1, 2), vec2(1, 0), cells), state)
            expect(r.emits.map((e) => e.at)).toEqual(cells)
            for (const e of r.emits) {
                expect(e.look).toBe(BREATHS.dragon.particles)
                expect(e.direction).toEqual(vec2(1, 0))
            }
            expect(r.shakes).toEqual([])
        })

        it("uses the breathing player's own breath", () => {
            const state = makeState(ROOM, [vec2(1, 2), vec2(1, 3)], [], {
                breath: [BREATHS.dragon, BREATHS.penguin],
                mode: "coop",
            })
            const r = run(
                breathed(vec2(1, 3), vec2(1, 0), [vec2(2, 3)], 1),
                state
            )
            expect(r.emits[0].look).toBe(BREATHS.penguin.particles)
        })

        it("emits nothing for a breath without a look", () => {
            const state = room({ breath: testBreath() })
            const r = run(breathed(vec2(1, 2), vec2(1, 0), [vec2(2, 2)]), state)
            expect(r.emits).toEqual([])
        })
    })

    // Through a real tick: the cells are the ones the breath covered when
    // it was breathed, whatever changes later in the tick.
    describe("a breath in a tick", () => {
        const TICK = 1 / TICK_RATE
        const idle: MoveInput = { held: [], pressed: vec2(0, 0) }
        const breathe: MoveInput = { ...idle, breath: true }

        // Where each look's particles were emitted.
        function emitted(state: GameState, moves: readonly MoveInput[]) {
            step(state, TICK, moves, fixedRandom(0))
            const r = recorder()
            effectsForEvents(takeEvents(state), state, r.targets)
            return (look: ParticleLook | undefined) =>
                r.emits.filter((e) => e.look === look).map((e) => e.at)
        }

        // A hall 9 wide and 2 high, the player at (1, 1) facing right, a
        // boss on (3, 1)-(4, 2).
        const bossHall = (health: number) => {
            const boss = makeBoss(3, 1)
            boss.health = health
            const state = makeState(
                [
                    Array(9).fill(1),
                    [1, ...Array(7).fill(0), 1],
                    [1, ...Array(7).fill(0), 1],
                    Array(9).fill(1),
                ],
                { x: 1, y: 1 },
                [],
                { breath: lineFire(), boss }
            )
            state.players[0].breather.energy = 100
            return state
        }

        // Regression: the cells were worked out after the tick, with the
        // boss gone, so the fire ran on through where it stood.
        it("stops at the boss its killing blow defeats", () => {
            // A Dragon tap does 0.8.
            const state = bossHall(0.8)
            const at = emitted(state, [breathe])
            expect(state.boss?.defeated).toBe(true)
            expect(at(BREATHS.dragon.particles)).toEqual([
                vec2(2, 1),
                vec2(3, 1),
            ])
        })

        // Regression: a boss that moved after the breath changed the line.
        it("keeps the line the boss stopped, even once the boss has moved", () => {
            const state = bossHall(12)
            step(state, TICK, [breathe], fixedRandom(0))
            const events = takeEvents(state)
            // Out of the line later in the tick.
            state.boss!.pos = vec2(5, 2)
            const r = recorder()
            effectsForEvents(events, state, r.targets)
            expect(r.emits.map((e) => e.at)).toEqual([vec2(2, 1), vec2(3, 1)])
        })

        // A hall with an inner wall at (3, 1): player 1 (Dragon) at (1, 1)
        // facing it, player 2 (Boar) at (4, 1) facing it from the other side.
        const wallHall = () => {
            const state = makeState(
                [
                    Array(9).fill(1),
                    [1, 0, 0, 1, 0, 0, 0, 0, 1],
                    Array(9).fill(1),
                ],
                [vec2(1, 1), vec2(4, 1)],
                [],
                { breath: [BREATHS.dragon, BREATHS.boar], mode: "coop" }
            )
            for (const p of state.players) p.breather.energy = 100
            state.players[1].breather.facing = vec2(-1, 0)
            return state
        }

        // Regression: player 2's Boar opening the wall later in the same
        // tick let player 1's embers through it.
        it("doesn't pass a wall another breath opens later in the tick", () => {
            const state = wallHall()
            const at = emitted(state, [breathe, breathe])
            expect(state.cells[1][3]).not.toBe(1)
            expect(at(BREATHS.dragon.particles)).toEqual([vec2(2, 1)])
        })

        it("throws the Boar's rubble from the wall it opened", () => {
            const state = wallHall()
            const at = emitted(state, [idle, breathe])
            expect(at(BREATHS.boar.particles)).toEqual([vec2(3, 1)])
        })
    })
})

describe("effectsForEvents", () => {
    it("handles every event of the tick, in order", () => {
        const r = recorder()
        effectsForEvents(
            [
                { type: "dotEaten", player: 0, at: vec2(2, 2) },
                {
                    type: "playerCaught",
                    player: 0,
                    at: vec2(2, 2),
                },
            ],
            room(),
            r.targets
        )
        expect(r.bursts.map((b) => b.kind)).toEqual(["dot"])
        expect(r.shakes).toEqual([SHAKES.caught])
    })
})

describe("applyMotion", () => {
    const targets = () => ({
        particles: createParticles({ random: Math.random }),
        shake: createShake(),
    })

    it("follows reduced motion while the setting is unset", () => {
        const t = targets()
        applyMotion(t, defaultSettings(), true)
        expect(t.particles.reduced).toBe(true)
        expect(t.shake.enabled).toBe(false)
        applyMotion(t, defaultSettings(), false)
        expect(t.particles.reduced).toBe(false)
        expect(t.shake.enabled).toBe(true)
    })

    it("turns the shake on with reduced motion when the setting says so", () => {
        const t = targets()
        applyMotion(t, { ...defaultSettings(), screenShake: true }, true)
        expect(t.shake.enabled).toBe(true)
        // Particles still follow reduced motion.
        expect(t.particles.reduced).toBe(true)
    })

    it("turns the shake off without reduced motion when the setting says so", () => {
        const t = targets()
        applyMotion(t, { ...defaultSettings(), screenShake: false }, false)
        expect(t.shake.enabled).toBe(false)
        expect(t.particles.reduced).toBe(false)
    })

    it("stops a shake under way when the setting turns it off", () => {
        const t = targets()
        t.shake.add(1)
        applyMotion(t, { ...defaultSettings(), screenShake: false }, false)
        expect(t.shake.trauma).toBe(0)
    })
})
