import { describe, expect, it } from "vite-plus/test"
import { defeatEnemy } from "./breath"
import { AiType, ENEMY_IDS, RESPAWN_DELAY, TICK_RATE } from "./constants"
import { GUARD } from "./difficulty"
import type { GameEvent } from "./events"
import { drawnPos, IDLE, step, type GameState, type MoveInput } from "./game"
import {
    KNOCK_LULL,
    KNOCK_RECOVER,
    KNOCK_STEPS,
    knockLevel,
    punch,
    tickPunches,
} from "./punch"
import {
    fixedRandom,
    makeEnemy,
    makeState,
    seededRandom,
    textMap,
} from "./test/helpers"
import { samePos, vec2 } from "./vec2"

// The punch's knockback decay and pressing on (KDA-288).

const TICK = 1 / TICK_RATE

const PUNCH: MoveInput = { held: [], pressed: vec2(0, 0), punch: true }

function tick(state: GameState, moves: MoveInput | MoveInput[] = PUNCH) {
    return step(state, TICK, moves, fixedRandom(0))
}

function ofType<T extends GameEvent["type"]>(state: GameState, type: T) {
    return state.events.filter(
        (e): e is Extract<GameEvent, { type: T }> => e.type === type
    )
}

// An open room, with a dot shut away below so the game isn't won.
const room = textMap([
    "#########",
    "#       #",
    "#       #",
    "#       #",
    "#########",
    "#.#######",
]).map

// A corridor along row 1 with one way off it, down from (4, 1).
const corridor = textMap([
    "#########",
    "#       #",
    "#### ####",
    "#.#######",
]).map

// Put `enemy` back at rest on (3, 1), keeping what the punch counts.
function rest(enemy: ReturnType<typeof makeEnemy>) {
    enemy.pos = vec2(3, 1)
    enemy.lastPos = vec2(3, 1)
    enemy.moveProgress = 1
    enemy.knockTurn = null
    enemy.turnsBack = false
}

describe("the knockback's decay", () => {
    it("knocks a full cell, then 0.7, 0.5, 0.3 and none, then none again", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        const player = state.players[0]
        expect(KNOCK_STEPS).toEqual([1, 0.7, 0.5, 0.3, 0])
        // How far each punch in a row sends it from rest on (3, 1): to
        // (4, 1) for a full cell, else turning round that far out.
        const knocks = [1, 2, 3, 4, 5, 6].map(() => {
            rest(enemy)
            punch(state, player)
            if (samePos(enemy.pos, vec2(3, 1))) return 0
            return enemy.knockTurn ?? 1
        })
        expect(knocks).toEqual([1, 0.7, 0.5, 0.3, 0, 0])
    })

    it("still reports a knock of nothing as a hit, without moving", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        enemy.knocks = KNOCK_STEPS.length - 1
        rest(enemy)
        // Not about to move off on its own.
        enemy.moveProgress = 0
        tick(state)
        expect(ofType(state, "punchHit")).toHaveLength(1)
        expect(enemy.pos).toEqual(vec2(3, 1))
        expect(enemy.lastPos).toEqual(vec2(3, 1))
        // Not harmless either: it can catch on the punch's tick.
        expect(enemy.statuses).toEqual([])
    })

    it("glides a short knock out from where it is drawn and back, with no jump", () => {
        const enemy = makeEnemy(3, 1, AiType.chase)
        const state = makeState(room, { x: 2, y: 1 }, [enemy], {
            health: 100,
        })
        // Its second punch in a row: 0.7 of a cell.
        enemy.knocks = 1
        const xs = [drawnPos(enemy, 9, 6).x]
        tick(state)
        xs.push(drawnPos(enemy, 9, 6).x)
        for (let i = 0; i < TICK_RATE; i++) {
            tick(state, IDLE)
            xs.push(drawnPos(enemy, 9, 6).x)
        }
        const most = Math.max(...xs)
        // Out to 3.7 (within a tick's glide), never on to (4, 1).
        expect(most).toBeGreaterThan(3.7 - enemy.speed * TICK)
        expect(most).toBeLessThanOrEqual(3.7 + 1e-9)
        // A tick's glide at most between ticks: no jump either way.
        for (let i = 1; i < xs.length; i++) {
            expect(Math.abs(xs[i] - xs[i - 1])).toBeLessThanOrEqual(
                enemy.speed * TICK + 1e-9
            )
        }
        // Back in on (3, 1) and on towards the player.
        expect(xs[xs.length - 1]).toBeLessThan(3)
    })

    it("stops a short knock before a wall, as a full one", () => {
        // On (7, 1), the room's last cell before its wall.
        const enemy = makeEnemy(7, 1)
        enemy.knocks = 2
        const state = makeState(room, { x: 6, y: 1 }, [enemy])
        tick(state)
        expect(ofType(state, "punchHit")).toHaveLength(1)
        expect(enemy.pos).toEqual(vec2(7, 1))
        expect(enemy.knockTurn).toBeNull()
    })

    it("doesn't slide a short knock on ice it never reaches", () => {
        const { map, ice } = textMap([
            "#########",
            "#  ~~~~ #",
            "#########",
            "#.#######",
        ])
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.knocks = 1
        const state = makeState(map, { x: 2, y: 1 }, [enemy], {
            ice,
            health: 100,
        })
        tick(state)
        for (let i = 0; i < TICK_RATE / 2; i++) {
            tick(state, IDLE)
            expect(drawnPos(enemy, 9, 4).x).toBeLessThan(4)
        }
    })

    it("recovers a step after the lull, then one every half second", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        enemy.knocks = KNOCK_STEPS.length - 1
        expect(KNOCK_LULL).toBe(2)
        expect(KNOCK_RECOVER).toBe(0.5)
        const at = (seconds: number) => {
            enemy.sinceKnock = 0
            tickPunches(state, seconds)
            return KNOCK_STEPS[knockLevel(enemy)]
        }
        expect(at(1.99)).toBe(0)
        expect(at(2)).toBe(0.3)
        expect(at(2.49)).toBe(0.3)
        expect(at(2.5)).toBe(0.5)
        expect(at(3)).toBe(0.7)
        expect(at(3.5)).toBe(1)
        expect(at(10)).toBe(1)
    })

    it("counts the lull in game ticks", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(room, { x: 2, y: 1 }, [enemy], {
            health: 100,
        })
        enemy.knocks = 3
        for (let i = 0; i < 2 * TICK_RATE; i++) tick(state, IDLE)
        expect(knockLevel(enemy)).toBe(2)
    })

    it("starts the lull again on every landed punch", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        const player = state.players[0]
        for (let i = 0; i < 4; i++) {
            rest(enemy)
            punch(state, player)
        }
        // Part way back (0.3 of a cell), then hit again: 0.3, and no
        // further back than none for the next.
        tickPunches(state, 2.2)
        rest(enemy)
        punch(state, player)
        expect(enemy.knockTurn).toBeCloseTo(0.3)
        expect(enemy.sinceKnock).toBe(0)
        expect(KNOCK_STEPS[knockLevel(enemy)]).toBe(0)
    })

    it("keeps knocking a full cell when the punches are spaced out", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        const player = state.players[0]
        for (let i = 0; i < 4; i++) {
            rest(enemy)
            punch(state, player)
            expect(enemy.pos).toEqual(vec2(4, 1))
            expect(enemy.knockTurn).toBeNull()
            tickPunches(state, 4)
        }
    })

    it("lets a spammed enemy close in on the player and hurt it", () => {
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.moveProgress = 1
        const state = makeState(room, { x: 2, y: 1 }, [enemy], {
            health: 100,
        })
        // Punching every tick for a second.
        let hurt = false
        for (let i = 0; i < TICK_RATE && !hurt; i++) {
            tick(state)
            hurt = state.players[0].health < 100
        }
        expect(hurt).toBe(true)
    })

    it("forgets the punches when it is defeated, and rolls its guard again", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(room, { x: 2, y: 1 }, [enemy], {
            health: 100,
        })
        state.guard = GUARD.superHard
        step(state, TICK, IDLE, () => 0.1)
        expect(enemy.guard).toBeGreaterThan(0)
        enemy.knocks = 3
        enemy.sinceKnock = 1
        defeatEnemy(state, enemy)
        expect(enemy.knocks).toBe(0)
        expect(enemy.sinceKnock).toBe(0)
        expect(enemy.guard).toBeNull()
        const random = seededRandom(1)
        for (let i = 0; i < (RESPAWN_DELAY + 0.1) * TICK_RATE; i++) {
            step(state, TICK, IDLE, random)
        }
        expect(enemy.respawnIn).toBe(0)
        expect(enemy.guard).not.toBeNull()
        expect(KNOCK_STEPS[knockLevel(enemy)]).toBe(1)
    })
})

describe("a knocked-back enemy", () => {
    // Regression: the knock left it having come from the cell towards the
    // player, so the no-reverse rule sent it on away.
    it("turns straight back at the player on its next move", () => {
        const enemy = makeEnemy(2, 1, AiType.chase)
        const state = makeState(corridor, { x: 1, y: 1 }, [enemy], {
            health: 100,
        })
        tick(state)
        expect(enemy.pos).toEqual(vec2(3, 1))
        // Its next move.
        while (samePos(enemy.pos, vec2(3, 1))) tick(state, IDLE)
        expect(enemy.pos).toEqual(vec2(2, 1))
    })

    it("only turns back on that one move", () => {
        const enemy = makeEnemy(2, 1, AiType.chase)
        const state = makeState(corridor, { x: 1, y: 1 }, [enemy], {
            health: 100,
        })
        tick(state)
        expect(enemy.turnsBack).toBe(true)
        while (samePos(enemy.pos, vec2(3, 1))) tick(state, IDLE)
        expect(enemy.turnsBack).toBe(false)
    })

    it("comes back in from a short knock and on at the player", () => {
        const enemy = makeEnemy(2, 1, AiType.chase)
        enemy.knocks = 2
        const state = makeState(corridor, { x: 1, y: 1 }, [enemy], {
            health: 100,
        })
        tick(state)
        while (enemy.knockTurn !== null) tick(state, IDLE)
        // Turned round: gliding back into (2, 1), from the far side.
        expect(enemy.pos).toEqual(vec2(2, 1))
        expect(enemy.lastPos).toEqual(vec2(3, 1))
        while (samePos(enemy.pos, vec2(2, 1))) tick(state, IDLE)
        expect(enemy.pos).toEqual(vec2(1, 1))
    })

    it("still slides on when a full knock lands it on ice", () => {
        const { map, ice } = textMap([
            "#########",
            "#   ~~  #",
            "#########",
            "#.#######",
        ])
        const enemy = makeEnemy(3, 1, AiType.chase)
        const state = makeState(map, { x: 2, y: 1 }, [enemy], {
            ice,
            health: 100,
        })
        tick(state)
        while (samePos(enemy.pos, vec2(4, 1))) tick(state, IDLE)
        // Slid on over the ice, then turned back at the player.
        expect(enemy.pos).toEqual(vec2(5, 1))
        while (samePos(enemy.pos, vec2(5, 1))) tick(state, IDLE)
        expect(enemy.pos).toEqual(vec2(6, 1))
        while (samePos(enemy.pos, vec2(6, 1))) tick(state, IDLE)
        expect(enemy.pos).toEqual(vec2(5, 1))
    })

    it("never stacks on a twin behind it as it turns back", () => {
        // A twin follows a cell behind; the punch knocks the first onto
        // the twin's cell.
        const first = makeEnemy(3, 1, AiType.chase, { x: 4, y: 1 })
        const twin = makeEnemy(4, 1, AiType.chase, { x: 5, y: 1 }, ENEMY_IDS[1])
        const state = makeState(corridor, { x: 2, y: 1 }, [first, twin], {
            health: 1000,
        })
        tick(state)
        for (let i = 0; i < 2 * TICK_RATE; i++) {
            tick(state, IDLE)
            const stacked =
                samePos(first.pos, twin.pos) &&
                samePos(first.lastPos, twin.lastPos)
            expect(stacked).toBe(false)
        }
    })
})
