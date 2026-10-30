import { describe, expect, it } from "vite-plus/test"
import { addStatus, inPlay } from "./breath"
import {
    AiType,
    BOSS_HEALTH,
    CharacterId,
    PUNCH_REACH,
    SPRITE_SCALE,
    TICK_RATE,
} from "./constants"
import type { GameEvent } from "./events"
import {
    drawnPos,
    IDLE,
    step,
    takeOut,
    type GameState,
    type MoveInput,
} from "./game"
import { inReach, punchOffset } from "./punch"
import { createSplitter, isSplitterHalf, isWholeSplitter } from "./splitter"
import {
    fixedRandom,
    makeBoss,
    makeEnemy,
    makeState,
    textMap,
} from "./test/helpers"
import { vec2 } from "./vec2"
import { stun } from "./versus"

// The punch (KDA-258) through step(), as the players play it.

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

// A wrap-around corridor (row 1, open at both edges) over a dead end.
const corridor = textMap([
    "#########",
    "         ",
    "#### ####",
    "#.#######",
]).map

// An enemy gliding from `last` into (x, y), `progress` of the way.
function gliding(
    x: number,
    y: number,
    last: { x: number; y: number },
    progress: number,
    id: CharacterId = CharacterId.enemy1
) {
    const enemy = makeEnemy(x, y, AiType.random, last, id)
    enemy.moveProgress = progress
    return enemy
}

describe("the punch's reach", () => {
    it("is a third of a sprite past the player's front", () => {
        expect(PUNCH_REACH).toBeCloseTo(SPRITE_SCALE + SPRITE_SCALE / 3)
        expect(PUNCH_REACH).toBeGreaterThan(1)
    })

    it("counts only what is ahead, and in its lane", () => {
        const right = vec2(1, 0)
        const at = (x: number, y: number) =>
            inReach(punchOffset(vec2(x, y), right))
        expect(at(1, 0)).toBe(true)
        expect(at(PUNCH_REACH, 0)).toBe(true)
        expect(at(PUNCH_REACH + 0.01, 0)).toBe(false)
        expect(at(0, 0)).toBe(false)
        expect(at(-1, 0)).toBe(false)
        expect(at(1, 0.5)).toBe(true)
        expect(at(1, -0.51)).toBe(false)
        const up = vec2(0, -1)
        expect(inReach(punchOffset(vec2(0, -1), up))).toBe(true)
        expect(inReach(punchOffset(vec2(0, 1), up))).toBe(false)
    })
})

describe("punching an enemy", () => {
    it("knocks an enemy a cell ahead back one cell, without defeating it", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        expect(tick(state)).toBeNull()
        expect(enemy.pos).toEqual(vec2(4, 1))
        // It glides in from where it was.
        expect(enemy.lastPos).toEqual(vec2(3, 1))
        expect(inPlay(enemy)).toBe(true)
        expect(state.players[0].score).toBe(0)
    })

    it("reaches an enemy drawn just inside its reach, not just outside", () => {
        // Drawn 1.06 and 1.08 cells ahead of the player at (1, 1).
        const inside = gliding(3, 1, { x: 2, y: 1 }, 0.06)
        const state = makeState(room, { x: 1, y: 1 }, [inside])
        tick(state)
        expect(inside.pos).toEqual(vec2(4, 1))

        const outside = gliding(3, 1, { x: 2, y: 1 }, 0.08)
        const missed = makeState(room, { x: 1, y: 1 }, [outside])
        tick(missed)
        expect(outside.pos).toEqual(vec2(3, 1))
        expect(ofType(missed, "punchHit")).toEqual([])
    })

    it("reaches half a cell to either side of the facing, no further", () => {
        // Gliding down from (3, 1): drawn 0.4, then 0.6, below the line.
        const near = gliding(3, 2, { x: 3, y: 1 }, 0.4)
        const state = makeState(room, { x: 2, y: 1 }, [near])
        tick(state)
        expect(near.pos).toEqual(vec2(4, 2))

        const far = gliding(3, 2, { x: 3, y: 1 }, 0.6)
        const missed = makeState(room, { x: 2, y: 1 }, [far])
        tick(missed)
        expect(far.pos).toEqual(vec2(3, 2))
    })

    it("doesn't hit behind the player", () => {
        const behind = makeEnemy(1, 1)
        const state = makeState(room, { x: 2, y: 1 }, [behind])
        tick(state)
        expect(behind.pos).toEqual(vec2(1, 1))
        expect(ofType(state, "punchHit")).toEqual([])
        expect(ofType(state, "punched")).toHaveLength(1)
    })

    it("punches along the way the player faces", () => {
        const above = makeEnemy(2, 1)
        const ahead = makeEnemy(
            3,
            2,
            AiType.random,
            undefined,
            CharacterId.enemy2
        )
        const state = makeState(room, { x: 2, y: 2 }, [above, ahead])
        state.players[0].breather.facing = vec2(0, -1)
        tick(state)
        expect(above.pos).toEqual(vec2(2, 1))
        expect(ahead.pos).toEqual(vec2(3, 2))
        // Against the wall above: hit, but nowhere to go.
        expect(ofType(state, "punchHit")).toHaveLength(1)
    })

    it("reaches through a wrap tunnel and knocks the enemy on through it", () => {
        const enemy = makeEnemy(0, 1)
        const state = makeState(corridor, { x: 8, y: 1 }, [enemy])
        tick(state)
        expect(enemy.pos).toEqual(vec2(1, 1))
        expect(enemy.lastPos).toEqual(vec2(0, 1))
    })

    it("stops a knocked-back enemy before a wall, still reporting the hit", () => {
        const enemy = makeEnemy(7, 1)
        const state = makeState(room, { x: 6, y: 1 }, [enemy])
        tick(state)
        expect(enemy.pos).toEqual(vec2(7, 1))
        expect(ofType(state, "punchHit")).toEqual([
            {
                type: "punchHit",
                player: 0,
                at: vec2(7, 1),
                target: "enemy",
                enemy: 0,
            },
        ])
    })

    it("sends an enemy knocked onto ice sliding on", () => {
        const { map, ice } = textMap([
            "#########",
            "#  ~~~  #",
            "#########",
            "#.#######",
        ])
        const enemy = makeEnemy(3, 1)
        const state = makeState(map, { x: 2, y: 1 }, [enemy], { ice })
        tick(state)
        expect(enemy.pos).toEqual(vec2(4, 1))
        // Its next moves are the slide's, whatever its AI wants.
        const moves = []
        for (let i = 0; i < TICK_RATE * 2 && moves.length < 2; i++) {
            const was = vec2(enemy.pos.x, enemy.pos.y)
            expect(tick(state, IDLE)).toBeNull()
            if (enemy.pos.x !== was.x) moves.push(enemy.pos.x)
        }
        expect(moves).toEqual([5, 6])
    })

    it("hits every enemy in reach, each one cell", () => {
        const a = makeEnemy(3, 1)
        const b = makeEnemy(3, 1, AiType.chase, undefined, CharacterId.enemy2)
        const state = makeState(room, { x: 2, y: 1 }, [a, b])
        tick(state)
        expect(a.pos).toEqual(vec2(4, 1))
        expect(b.pos).toEqual(vec2(4, 1))
        expect(ofType(state, "punchHit").map((e) => e.enemy)).toEqual([0, 1])
    })

    it("reports the nearest hit first", () => {
        const far = gliding(3, 1, { x: 2, y: 1 }, 0.05)
        const near = makeEnemy(
            2,
            1,
            AiType.random,
            undefined,
            CharacterId.enemy2
        )
        const state = makeState(room, { x: 1, y: 1 }, [far, near])
        tick(state)
        expect(ofType(state, "punchHit").map((e) => e.enemy)).toEqual([1, 0])
    })

    it("never splits a Splitter, whole or half", () => {
        const [whole, spare] = createSplitter(
            [CharacterId.enemy1, CharacterId.enemy2],
            vec2(3, 1)
        )
        const state = makeState(room, { x: 2, y: 1 }, [whole, spare])
        tick(state)
        expect(isWholeSplitter(whole)).toBe(true)
        expect(whole.pos).toEqual(vec2(4, 1))
        expect(inPlay(spare)).toBe(false)
        expect(ofType(state, "enemyDefeated")).toEqual([])

        const [, half] = createSplitter(
            [CharacterId.enemy1, CharacterId.enemy2],
            vec2(3, 1)
        )
        half.respawnIn = 0
        const halves = makeState(room, { x: 2, y: 1 }, [half])
        tick(halves)
        expect(isSplitterHalf(half)).toBe(true)
        expect(inPlay(half)).toBe(true)
        expect(half.pos).toEqual(vec2(4, 1))
    })

    it("hits a held enemy without moving it", () => {
        const enemy = makeEnemy(3, 1)
        addStatus(enemy, { name: "test.hold", holds: true }, 3)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        tick(state)
        expect(enemy.pos).toEqual(vec2(3, 1))
        expect(ofType(state, "punchHit")).toHaveLength(1)
    })

    it("knocks a harmless enemy back too", () => {
        const enemy = makeEnemy(3, 1)
        addStatus(enemy, { name: "test.harmless", harmless: true }, 3)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        tick(state)
        expect(enemy.pos).toEqual(vec2(4, 1))
    })

    it("doesn't hit an enemy out of play", () => {
        const enemy = makeEnemy(3, 1)
        enemy.respawnIn = 2
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        tick(state)
        expect(enemy.pos).toEqual(vec2(3, 1))
        expect(ofType(state, "punchHit")).toEqual([])
    })

    it("never lets the knocked-back enemy catch on its own tick", () => {
        // On the player's cell, its sprite still 0.7 cells off, gliding in.
        const enemy = gliding(2, 1, { x: 3, y: 1 }, 0.3)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        expect(tick(state)).toBeNull()
        expect(enemy.pos).toEqual(vec2(3, 1))
        // Drawn on its new cell at once, not gliding in from the player's.
        expect(drawnPos(enemy, 9, 6)).toEqual(vec2(3, 1))
    })

    it("knocks back a chaser about to step onto the player", () => {
        // Ready to move: without the punch it would step onto the player.
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.moveProgress = 1
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        expect(tick(state)).toBeNull()
        expect(enemy.pos).toEqual(vec2(4, 1))
        // It has a whole move to make before it moves on.
        expect(enemy.moveProgress).toBeLessThan(0.1)
    })
})

describe("punching", () => {
    it("reports the punch, hit or not, where the player is drawn", () => {
        const state = makeState(room, { x: 2, y: 1 }, [])
        tick(state)
        expect(state.events).toEqual([
            { type: "punched", player: 0, at: vec2(2, 1), facing: vec2(1, 0) },
        ])
    })

    it("reports the punch before its hits", () => {
        const state = makeState(room, { x: 2, y: 1 }, [makeEnemy(3, 1)])
        tick(state)
        expect(state.events.map((e) => e.type)).toEqual(["punched", "punchHit"])
    })

    it("punches once a tick", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        tick(state)
        expect(ofType(state, "punched")).toHaveLength(1)
        expect(enemy.pos).toEqual(vec2(4, 1))
    })

    it("has no cooldown or cost: every press punches", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        // A knocked-back enemy glides in from its old cell, so on the next
        // tick it is still drawn in reach, and is knocked on again.
        tick(state)
        expect(ofType(state, "punched")).toHaveLength(1)
        tick(state)
        expect(ofType(state, "punched")).toHaveLength(1)
        expect(ofType(state, "punchHit")).toHaveLength(1)
        expect(enemy.pos).toEqual(vec2(5, 1))
        expect(state.players[0].breather.energy).toBe(0)
    })

    it("doesn't punch without a press", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(room, { x: 2, y: 1 }, [enemy])
        tick(state, IDLE)
        expect(ofType(state, "punched")).toEqual([])
        expect(enemy.pos).toEqual(vec2(3, 1))
    })

    it("doesn't stop or slow the player", () => {
        const held = { held: [vec2(1, 0)], pressed: vec2(0, 0) }
        const walking = makeState(room, { x: 1, y: 1 }, [])
        const punching = makeState(room, { x: 1, y: 1 }, [])
        for (let i = 0; i < TICK_RATE; i++) {
            tick(walking, held)
            tick(punching, { ...held, punch: true })
        }
        const { character } = punching.players[0]
        expect(character.pos).toEqual(walking.players[0].character.pos)
        expect(character.moveProgress).toBeCloseTo(
            walking.players[0].character.moveProgress
        )
    })

    it("can't punch while out of play", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(
            room,
            [
                { x: 2, y: 1 },
                { x: 5, y: 3 },
            ],
            [enemy],
            { mode: "coop" }
        )
        takeOut(state.players[0], 3)
        tick(state, [PUNCH, IDLE])
        expect(ofType(state, "punched")).toEqual([])
        expect(enemy.pos).toEqual(vec2(3, 1))
    })

    it("can't punch while stunned (versus)", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(
            room,
            [
                { x: 2, y: 1 },
                { x: 5, y: 3 },
            ],
            [enemy],
            { mode: "versus" }
        )
        stun(state.players[0])
        tick(state, [PUNCH, IDLE])
        expect(ofType(state, "punched")).toEqual([])
        expect(enemy.pos).toEqual(vec2(3, 1))
    })

    it("punches for each player, player 1's first", () => {
        const enemy = makeEnemy(3, 1)
        const state = makeState(
            room,
            [
                { x: 2, y: 1 },
                { x: 5, y: 3 },
            ],
            [enemy],
            { mode: "coop" }
        )
        tick(state, [PUNCH, PUNCH])
        expect(ofType(state, "punched").map((e) => e.player)).toEqual([0, 1])
        expect(ofType(state, "punchHit").map((e) => e.player)).toEqual([0])
    })
})

describe("punching the boss", () => {
    it("reports a hit but doesn't hurt or move it", () => {
        const boss = makeBoss(3, 1)
        boss.moveProgress = 0
        const state = makeState(room, { x: 2, y: 2 }, [], { boss })
        tick(state)
        expect(boss.health).toBe(BOSS_HEALTH)
        expect(boss.flash).toBe(0)
        expect(boss.pos).toEqual(vec2(3, 1))
        expect(ofType(state, "punchHit")).toEqual([
            { type: "punchHit", player: 0, at: vec2(3, 2), target: "boss" },
        ])
        expect(ofType(state, "bossHit")).toEqual([])
    })

    it("misses a boss out of reach or defeated", () => {
        const far = makeBoss(5, 1)
        far.moveProgress = 0
        const state = makeState(room, { x: 2, y: 2 }, [], { boss: far })
        tick(state)
        expect(ofType(state, "punchHit")).toEqual([])

        const defeated = makeBoss(3, 1)
        defeated.defeated = true
        const gone = makeState(room, { x: 2, y: 2 }, [], { boss: defeated })
        tick(gone)
        expect(ofType(gone, "punchHit")).toEqual([])
    })

    it("reaches its body from its side, past its top-left cell", () => {
        // Facing up at (4, 4): the body's bottom row is a cell up.
        const boss = makeBoss(3, 2)
        boss.moveProgress = 0
        const { map } = textMap([
            "#########",
            "#       #",
            "#       #",
            "#       #",
            "#       #",
            "#########",
            "#.#######",
        ])
        const state = makeState(map, { x: 4, y: 4 }, [], { boss })
        state.players[0].breather.facing = vec2(0, -1)
        tick(state)
        expect(ofType(state, "punchHit")).toEqual([
            { type: "punchHit", player: 0, at: vec2(4, 3), target: "boss" },
        ])
    })
})

describe("punching in co-op", () => {
    it("passes through the partner", () => {
        const state = makeState(
            room,
            [
                { x: 2, y: 1 },
                { x: 3, y: 1 },
            ],
            [],
            { mode: "coop" }
        )
        const partner = state.players[1].character
        tick(state, [PUNCH, IDLE])
        expect(partner.pos).toEqual(vec2(3, 1))
        expect(partner.lastPos).toEqual(vec2(3, 1))
        expect(ofType(state, "punchHit")).toEqual([])
    })
})
