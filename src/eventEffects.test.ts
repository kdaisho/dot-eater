import { describe, expect, it } from "vite-plus/test"
import { BREATHS } from "./breaths"
import {
    applyMotion,
    effectsForEvent,
    effectsForEvents,
    type EffectTargets,
} from "./eventEffects"
import type { GameEvent } from "./events"
import { createParticles, type ParticleLook } from "./particles"
import { defaultSettings } from "./settings"
import { createShake, SHAKES } from "./shake"
import { makeBoss, makeState, testBreath } from "./test/helpers"
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

    it("a caught burst and the caught shake when a player is caught", () => {
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
        const breathed = (at: Vec2, facing: Vec2, player = 0): GameEvent => ({
            type: "breathed",
            player,
            animal: "dragon",
            at,
            facing,
        })

        it("emits its look on every cell of its line, along the facing", () => {
            const state = room({ breath: BREATHS.dragon })
            const r = run(breathed(vec2(1, 2), vec2(1, 0)), state)
            // Range 5, but the wall at x 6 stops it after 4.
            expect(r.emits.map((e) => e.at)).toEqual([
                vec2(2, 2),
                vec2(3, 2),
                vec2(4, 2),
                vec2(5, 2),
            ])
            for (const e of r.emits) {
                expect(e.look).toBe(BREATHS.dragon.particles)
                expect(e.direction).toEqual(vec2(1, 0))
            }
            expect(r.shakes).toEqual([])
        })

        it("covers an area breath's cells", () => {
            const state = room({ breath: BREATHS.skunk })
            const r = run(breathed(vec2(3, 2), vec2(1, 0)), state)
            expect(r.emits).toHaveLength(9)
            expect(r.emits.map((e) => e.at)).toContainEqual(vec2(3, 2))
            expect(r.emits[0].look).toBe(BREATHS.skunk.particles)
        })

        it("uses the breathing player's own breath", () => {
            const state = makeState(ROOM, [vec2(1, 2), vec2(1, 3)], [], {
                breath: [BREATHS.dragon, BREATHS.penguin],
                mode: "coop",
            })
            const r = run(breathed(vec2(1, 3), vec2(1, 0), 1), state)
            expect(r.emits[0].look).toBe(BREATHS.penguin.particles)
        })

        it("comes from the player's cell when nothing is in reach", () => {
            const state = room({ breath: BREATHS.dragon })
            const r = run(breathed(vec2(1, 2), vec2(-1, 0)), state)
            expect(r.emits.map((e) => e.at)).toEqual([vec2(1, 2)])
        })

        it("stops at the boss's body", () => {
            const state = room({
                breath: BREATHS.dragon,
                boss: makeBoss(3, 1),
            })
            const r = run(breathed(vec2(1, 2), vec2(1, 0)), state)
            expect(r.emits.map((e) => e.at)).toEqual([vec2(2, 2), vec2(3, 2)])
        })

        it("emits nothing for a breath without a look", () => {
            const state = room({ breath: testBreath() })
            const r = run(breathed(vec2(1, 2), vec2(1, 0)), state)
            expect(r.emits).toEqual([])
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
