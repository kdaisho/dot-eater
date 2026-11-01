import { describe, expect, it } from "vite-plus/test"
import { BOSS_BREATH } from "./bossBreath"
import { ENEMY_BREATH } from "./enemyBreath"
import { BREATHS } from "./breaths"
import { TICK_RATE } from "./constants"
import {
    applyMotion,
    BLOCK_IMPACT,
    effectsForEvent,
    effectsForEvents,
    type EffectTargets,
} from "./eventEffects"
import { takeEvents, type GameEvent } from "./events"
import { step, type GameState, type MoveInput } from "./game"
import { createJabs } from "./jab"
import { BURSTS, createParticles, type ParticleLook } from "./particles"
import { defaultSettings } from "./settings"
import { createShake, SHAKES } from "./shake"
import { fixedRandom, makeBoss, makeState, testBreath } from "./test/helpers"
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

    it("a big burst and shake when the boss is defeated", () => {
        const r = run({ type: "bossDefeated", player: 1, at: vec2(2, 2) })
        expect(r.bursts).toEqual([{ kind: "bossDefeat", at: vec2(2.5, 2.5) }])
        expect(r.shakes).toEqual([SHAKES.bossDefeat])
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
        expect(BURSTS.hurt.count).toBeLessThan(BURSTS.caught.count)
        expect(SHAKES.hurt).toBeLessThan(SHAKES.caught)
    })

    it("a caught burst and the caught shake when a player is knocked out", () => {
        for (const outForGood of [false, true]) {
            const r = run({
                type: "playerCaught",
                player: 0,
                at: vec2(2, 3),
                outForGood,
            })
            expect(r.bursts).toEqual([{ kind: "caught", at: vec2(2, 3) }])
            expect(r.shakes).toEqual([SHAKES.caught])
        }
    })

    it("a small shake, no particles, when a player is stunned", () => {
        const r = run({
            type: "playerStunned",
            player: 1,
            by: 0,
            at: vec2(2, 2),
        })
        expect(r.bursts).toEqual([])
        expect(r.emits).toEqual([])
        expect(r.shakes).toEqual([SHAKES.stun])
        expect(SHAKES.stun).toBeLessThan(SHAKES.hit)
    })

    it("a jab look, nothing else, for a punch", () => {
        const r = recorder()
        const jabs: { player: number; facing: Vec2 }[] = []
        r.targets.jabs = {
            add: (player, facing) => jabs.push({ player, facing }),
            block: () => {},
        }
        effectsForEvent(
            { type: "punched", player: 1, at: vec2(2, 2), facing: vec2(0, -1) },
            room(),
            r.targets
        )
        expect(jabs).toEqual([{ player: 1, facing: vec2(0, -1) }])
        expect(r.bursts).toEqual([])
        expect(r.shakes).toEqual([])
    })

    // KDA-293, with the user.
    it("sparks at the impact and a fist bounce, no shake, for a block", () => {
        const r = recorder()
        const directions: (Vec2 | undefined)[] = []
        const burst = r.targets.particles.burst
        r.targets.particles.burst = (kind, at, options) => {
            directions.push(options?.direction)
            burst(kind, at, options)
        }
        const blocked: number[] = []
        r.targets.jabs = {
            add: () => {},
            block: (player) => blocked.push(player),
        }
        // Punched from the left: the enemy's left side faces the puncher.
        effectsForEvent(
            {
                type: "punchBlocked",
                player: 1,
                at: vec2(3, 2),
                facing: vec2(1, 0),
                enemy: 3,
            },
            room(),
            r.targets
        )
        expect(r.bursts).toEqual([
            { kind: "block", at: vec2(3 - BLOCK_IMPACT, 2) },
        ])
        // Thrown back at the puncher.
        // (+ 0 turns a -0 into 0.)
        expect(directions.map((d) => vec2(d!.x + 0, d!.y + 0))).toEqual([
            vec2(-1, 0),
        ])
        expect(blocked).toEqual([1])
        expect(r.shakes).toEqual([])
        // Punched upwards: the impact is on its bottom side.
        const up = run({
            type: "punchBlocked",
            player: 0,
            at: vec2(3, 2),
            facing: vec2(0, -1),
            enemy: 3,
        })
        expect(up.bursts).toEqual([
            { kind: "block", at: vec2(3, 2 + BLOCK_IMPACT) },
        ])
        expect(up.shakes).toEqual([])
    })

    it("throws white and yellow sparks for a block, fewer with reduced motion", () => {
        const look = BURSTS.block
        expect(look.colors).toEqual(["#fff7cc", "#facc15"])
        const sparks = (reduced: boolean) => {
            const particles = createParticles({ random: () => 0.5, reduced })
            particles.burst("block", vec2(2, 2), { direction: vec2(-1, 0) })
            return particles.list
        }
        expect(sparks(false)).toHaveLength(look.count)
        expect(sparks(true).length).toBeLessThan(look.count)
        expect(sparks(true).length).toBeGreaterThan(0)
        // Outlined, so the pale ones show on the white floor.
        expect(sparks(false)[0].outline).toBe(look.outline)
        // Flying back along the direction they were given.
        expect(sparks(false)[0].vx).toBeLessThan(0)
    })

    it("a tiny burst and a very small shake where a punch lands", () => {
        for (const target of ["enemy", "boss", "player"] as const) {
            const at = vec2(2.4, 2)
            const r = run({ type: "punchHit", player: 0, at, target })
            expect(r.bursts).toEqual([{ kind: "punch", at }])
            expect(r.shakes).toEqual([SHAKES.punch])
        }
        expect(SHAKES.punch).toBeLessThan(SHAKES.stun)
    })

    it.each([
        { type: "playerRespawned", player: 0, at: vec2(1, 2) },
        { type: "gameWon" },
        { type: "gameLost" },
    ] as GameEvent[])("nothing for $type", (event) => {
        const r = run(event)
        expect(r.bursts).toEqual([])
        expect(r.emits).toEqual([])
        expect(r.shakes).toEqual([])
    })

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
                { breath: BREATHS.dragon, boss }
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
                { breath: [BREATHS.dragon, BREATHS.boar], mode: "versus" }
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
                    outForGood: false,
                },
                { type: "playerRespawned", player: 0, at: vec2(1, 2) },
            ],
            room(),
            r.targets
        )
        expect(r.bursts.map((b) => b.kind)).toEqual(["dot", "caught"])
        expect(r.shakes).toEqual([SHAKES.caught])
    })

    // Regression: each hit shook, so a jab into three stacked enemies
    // shook three times as hard as one into a single enemy.
    it("shakes once per punch, however many it hits, with a burst on each", () => {
        const r = recorder()
        const hit = (player: number, enemy: number): GameEvent => ({
            type: "punchHit",
            player,
            at: vec2(3, 2),
            target: "enemy",
            enemy,
        })
        const punched = (player: number): GameEvent => ({
            type: "punched",
            player,
            at: vec2(2, 2),
            facing: vec2(1, 0),
        })
        effectsForEvents(
            [
                punched(0),
                hit(0, 0),
                hit(0, 1),
                hit(0, 2),
                punched(1),
                hit(1, 3),
            ],
            room(),
            r.targets
        )
        expect(r.bursts.map((b) => b.kind)).toEqual([
            "punch",
            "punch",
            "punch",
            "punch",
        ])
        expect(r.shakes).toEqual([SHAKES.punch, SHAKES.punch])
    })

    it("shakes for a punch's hit, not for a block before it (KDA-288)", () => {
        const r = recorder()
        effectsForEvents(
            [
                {
                    type: "punchBlocked",
                    player: 0,
                    at: vec2(3, 2),
                    facing: vec2(1, 0),
                    enemy: 0,
                },
                {
                    type: "punchHit",
                    player: 0,
                    at: vec2(3, 2),
                    target: "enemy",
                    enemy: 1,
                },
            ],
            room(),
            r.targets
        )
        expect(r.bursts.map((b) => b.kind)).toEqual(["block", "punch"])
        expect(r.shakes).toEqual([SHAKES.punch])
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

    // Regression: the jab lunged even with reduced motion requested.
    it("stops jabs lunging with reduced motion", () => {
        const t = { ...targets(), jabs: createJabs() }
        applyMotion(t, defaultSettings(), true)
        expect(t.jabs.reduced).toBe(true)
        applyMotion(t, defaultSettings(), false)
        expect(t.jabs.reduced).toBe(false)
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
