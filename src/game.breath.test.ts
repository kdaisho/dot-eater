import { describe, expect, it, vi } from "vite-plus/test"
import {
    addStatus,
    inPlay,
    type BreathHit,
    type EnemyStatus,
    type TileEffect,
} from "./breath"
import {
    AiType,
    DEFEAT_POINTS,
    DOT_ENERGY,
    ENEMY_DAMAGE,
    MAX_HEALTH,
    PLAYER_SPEED,
    RESPAWN_DELAY,
    TICK_RATE,
} from "./constants"
import { createGameState, step, type GameState, type MoveInput } from "./game"
import { levels } from "./levels"
import {
    fixedRandom,
    makeEnemy,
    makeState,
    OLD_LEVEL,
    testBreath,
    textMap,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// The breath system end to end through step(), with test breaths (see
// testBreath) rather than the characters' own, which are later issues.

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const east = vec2(1, 0)
const west = vec2(-1, 0)
const north = vec2(0, -1)
// Ticks per player move at the default speed.
const MOVE = TICK_RATE / PLAYER_SPEED

type Press = { held?: Vec2; pressed?: Vec2; breath?: boolean }

function tick(state: GameState, { held, pressed, breath }: Press = {}) {
    const move: MoveInput = {
        held: held ? [held] : [],
        pressed: pressed ?? none,
        breath: breath ?? false,
    }
    return step(state, TICK, move, fixedRandom(0))
}

function run(state: GameState, n: number, press: Press = {}) {
    for (let i = 0; i < n; i++) tick(state, press)
}

// A line breath that defeats the first enemy it reaches and records each hit.
function defeating() {
    const hits: BreathHit[] = []
    const breath = testBreath({
        fire(hit) {
            hits.push(hit)
            if (hit.enemies[0]) hit.defeat(hit.enemies[0])
        },
    })
    return { breath, hits }
}

// A wrap-around corridor: row 1 is open at both edges. Maps here that need
// it have a dot shut away in a wall pocket (bottom row), so the game isn't
// won by clearing every dot.
const corridor = textMap([
    "#########",
    "         ",
    "#########",
    "#.#######",
]).map

describe("facing", () => {
    it("starts facing right", () => {
        expect(createGameState(OLD_LEVEL).players[0].breather.facing).toEqual(
            east
        )
    })

    it("follows the player's moves and stays while it waits at a wall", () => {
        const { map } = textMap(["#####", "#   #", "#####"])
        const state = makeState(map, { x: 2, y: 1 })
        state.players[0].character.moveProgress = 1
        tick(state, { held: west, pressed: west })
        expect(state.players[0].breather.facing).toEqual(west)
        // Against the wall, still holding left: it keeps facing left.
        run(state, MOVE * 3, { held: west })
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
        expect(state.players[0].breather.facing).toEqual(west)
        // Let go: still facing left.
        run(state, MOVE)
        expect(state.players[0].breather.facing).toEqual(west)
    })

    it("turns to face a wall the player tries to walk into", () => {
        const { map } = textMap(["#####", "#   #", "#####"])
        const state = makeState(map, { x: 2, y: 1 })
        state.players[0].character.moveProgress = 1
        tick(state, { pressed: north })
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        expect(state.players[0].breather.facing).toEqual(north)
        run(state, MOVE)
        expect(state.players[0].breather.facing).toEqual(north)
    })

    it("keeps the move's direction across a tunnel", () => {
        const state = makeState(corridor, { x: 1, y: 1 })
        state.players[0].character.moveProgress = 1
        // Two moves left: to x 0, then through the tunnel to x 8.
        run(state, MOVE + 1, { held: west })
        expect(state.players[0].character.pos).toEqual(vec2(8, 1))
        expect(state.players[0].breather.facing).toEqual(west)
        run(state, MOVE * 2)
        expect(state.players[0].breather.facing).toEqual(west)
    })

    it("follows a slide, and a breath mid-slide fires along it", () => {
        const { map, ice } = textMap(["#######", "#  ~~ #", "#######"])
        const { breath, hits } = defeating()
        const state = makeState(map, { x: 2, y: 1 }, [], { ice, breath })
        state.players[0].breather.energy = 100
        state.players[0].character.moveProgress = 1
        tick(state, { held: east, pressed: east })
        expect(state.players[0].character.pos).toEqual(vec2(3, 1))
        // Now sliding: steering up is ignored, and the breath goes east.
        run(state, MOVE, { held: north })
        expect(state.players[0].character.pos).toEqual(vec2(4, 1))
        tick(state, { held: north, breath: true })
        expect(hits).toHaveLength(1)
        expect(hits[0].facing).toEqual(east)
        expect(hits[0].origin).toEqual(vec2(4, 1))
    })

    it("keeps its facing when hurt and knocked back", () => {
        const enemy = makeEnemy(4, 1, AiType.chase)
        const state = makeState(corridor, { x: 2, y: 1 }, [enemy], {
            health: MAX_HEALTH,
        })
        state.players[0].breather.facing = west
        state.players[0].character.pos = vec2(4, 1)
        state.players[0].character.lastPos = vec2(4, 1)
        tick(state)
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(state.players[0].breather.facing).toEqual(west)
    })
})

describe("energy", () => {
    it("starts empty and fills by DOT_ENERGY per dot, up to the meter's size", () => {
        const { map } = textMap(["#########", "#.......#", "#########"])
        const state = makeState(map, { x: 1, y: 1 }, [], {
            breath: testBreath({ maxEnergy: 12 }),
        })
        expect(state.players[0].breather.energy).toBe(0)
        state.players[0].character.moveProgress = 1
        tick(state, { held: east })
        expect(state.players[0].breather.energy).toBe(DOT_ENERGY)
        run(state, MOVE, { held: east })
        expect(state.players[0].breather.energy).toBe(DOT_ENERGY * 2)
        run(state, MOVE, { held: east })
        expect(state.players[0].breather.energy).toBe(12)
    })

    it("starts empty in a new game and is kept when hurt", () => {
        const game = createGameState(levels[0])
        expect(game.players[0].breather.energy).toBe(0)
        const enemy = makeEnemy(4, 1, AiType.chase)
        const state = makeState(corridor, { x: 2, y: 1 }, [enemy], {
            health: MAX_HEALTH,
        })
        state.players[0].breather.energy = 40
        state.players[0].character.pos = vec2(4, 1)
        state.players[0].character.lastPos = vec2(4, 1)
        tick(state)
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(state.players[0].breather.energy).toBe(40)
    })
})

describe("breathing", () => {
    it("needs the energy and pays the cost", () => {
        const fire = vi.fn()
        const state = makeState(corridor, { x: 1, y: 1 }, [], {
            breath: testBreath({ cost: 25, fire }),
        })
        state.players[0].breather.energy = 20
        tick(state, { breath: true })
        expect(fire).not.toHaveBeenCalled()
        expect(state.players[0].breather.energy).toBe(20)
        state.players[0].breather.energy = 30
        tick(state, { breath: true })
        expect(fire).toHaveBeenCalledTimes(1)
        expect(state.players[0].breather.energy).toBe(5)
    })

    it("waits out the cooldown between breaths", () => {
        const fire = vi.fn()
        const state = makeState(corridor, { x: 1, y: 1 }, [], {
            breath: testBreath({ cost: 10, cooldown: 0.5, fire }),
        })
        state.players[0].breather.energy = 100
        tick(state, { breath: true })
        expect(fire).toHaveBeenCalledTimes(1)
        // A press during the cooldown is dropped, not kept for later.
        run(state, TICK_RATE / 2 - 2)
        tick(state, { breath: true })
        tick(state)
        expect(fire).toHaveBeenCalledTimes(1)
        expect(state.players[0].breather.energy).toBe(90)
        tick(state, { breath: true })
        expect(fire).toHaveBeenCalledTimes(2)
    })

    it("costs nothing when the breath refuses", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [], {
            breath: testBreath({ fire: () => false }),
        })
        state.players[0].breather.energy = 100
        tick(state, { breath: true })
        expect(state.players[0].breather.energy).toBe(100)
        expect(state.players[0].breather.cooldown).toBe(0)
    })

    it("does nothing without a press", () => {
        const fire = vi.fn()
        const state = makeState(corridor, { x: 1, y: 1 }, [], {
            breath: testBreath({ fire }),
        })
        state.players[0].breather.energy = 100
        run(state, 10)
        expect(fire).not.toHaveBeenCalled()
    })

    it("hits the enemies in its shape, nearest first", () => {
        const near = makeEnemy(3, 1)
        const far = makeEnemy(4, 1)
        const behind = makeEnemy(0, 1)
        const { breath, hits } = defeating()
        const state = makeState(corridor, { x: 1, y: 1 }, [far, near, behind], {
            breath,
        })
        state.players[0].breather.energy = 100
        tick(state, { breath: true })
        expect(hits[0].cells).toEqual([vec2(2, 1), vec2(3, 1), vec2(4, 1)])
        expect(hits[0].enemies).toEqual([near, far])
    })
    // Regression: an enemy on the player's cell, its sprite still gliding
    // in, was out of every line and cone, so breathing at it missed.
    it("hits an enemy on the player's own cell first, for a line or a cone", () => {
        for (const shape of [
            { kind: "line", range: 3 },
            { kind: "cone", range: 2 },
        ] as const) {
            const onPlayer = makeEnemy(1, 1, AiType.random, { x: 0, y: 1 })
            onPlayer.moveProgress = 0.3
            const ahead = makeEnemy(2, 1)
            const hits: BreathHit[] = []
            const breath = testBreath({
                shape: () => shape,
                fire: (hit) => void hits.push(hit),
            })
            const state = makeState(
                corridor,
                { x: 1, y: 1 },
                [ahead, onPlayer],
                {
                    breath,
                }
            )
            state.players[0].breather.energy = 100
            tick(state, { breath: true })
            expect(hits[0].enemies).toEqual([onPlayer, ahead])
            expect(hits[0].cells[0]).toEqual(vec2(2, 1))
        }
    })
})

describe("pushed enemies", () => {
    // Regression: collisions traced a pushed enemy from where it was drawn
    // before the push, so a jump past the player swept through it.
    it("aren't swept across the jump for collisions", () => {
        // On the player's cell, its sprite gliding in from the west; pushed
        // 3 cells east past the player.
        const enemy = makeEnemy(1, 1, AiType.random, { x: 0, y: 1 })
        enemy.moveProgress = 0.3
        const state = makeState(corridor, { x: 1, y: 1 }, [enemy], {
            breath: testBreath({
                fire(hit) {
                    for (const e of hit.enemies) hit.push(e, hit.facing, 3)
                },
            }),
        })
        state.players[0].breather.energy = 100
        expect(tick(state, { breath: true })).toBeNull()
        expect(enemy.pos).toEqual(vec2(4, 1))
    })
})

describe("defeated enemies", () => {
    function defeatedSetup() {
        const enemy = makeEnemy(3, 1, AiType.chase)
        const { breath } = defeating()
        const state = makeState(corridor, { x: 1, y: 1 }, [enemy], { breath })
        state.spawns.enemies = [vec2(6, 1)]
        state.players[0].breather.energy = 100
        tick(state, { breath: true })
        return { state, enemy }
    }

    it("score DEFEAT_POINTS and wait at their spawn", () => {
        const { state, enemy } = defeatedSetup()
        expect(state.players[0].score).toBe(DEFEAT_POINTS)
        expect(inPlay(enemy)).toBe(false)
        expect(enemy.pos).toEqual(vec2(6, 1))
    })

    it("don't move or catch while gone", () => {
        const { state, enemy } = defeatedSetup()
        state.players[0].character.pos = vec2(6, 1)
        state.players[0].character.lastPos = vec2(6, 1)
        for (let i = 0; i < TICK_RATE * 2; i++) {
            expect(tick(state)).toBeNull()
        }
        expect(enemy.pos).toEqual(vec2(6, 1))
    })

    it("come back after RESPAWN_DELAY and chase again", () => {
        const { state, enemy } = defeatedSetup()
        run(state, RESPAWN_DELAY * TICK_RATE - 1)
        expect(inPlay(enemy)).toBe(false)
        tick(state)
        expect(inPlay(enemy)).toBe(true)
        expect(enemy.pos).toEqual(vec2(6, 1))
        // Back with a grace period, then moving.
        run(state, TICK_RATE)
        expect(enemy.pos).not.toEqual(vec2(6, 1))
    })

    it("can catch a player on their spawn as soon as they are back", () => {
        const { state } = defeatedSetup()
        state.players[0].character.pos = vec2(6, 1)
        state.players[0].character.lastPos = vec2(6, 1)
        for (let i = 0; i < RESPAWN_DELAY * TICK_RATE - 1; i++) {
            expect(tick(state)).toBeNull()
        }
        expect(tick(state)).toBe("dead")
    })

    it("stay gone when the player is hurt", () => {
        const catcher = makeEnemy(8, 1, AiType.chase)
        const victim = makeEnemy(3, 1, AiType.chase)
        const { breath } = defeating()
        const state = makeState(corridor, { x: 1, y: 1 }, [victim, catcher], {
            breath,
            health: MAX_HEALTH,
        })
        state.spawns.enemies = [vec2(6, 1), vec2(8, 1)]
        state.players[0].breather.energy = 100
        tick(state, { breath: true })
        expect(inPlay(victim)).toBe(false)
        const wait = victim.respawnIn
        state.players[0].character.pos = vec2(8, 1)
        state.players[0].character.lastPos = vec2(8, 1)
        tick(state)
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
        expect(inPlay(victim)).toBe(false)
        expect(victim.respawnIn).toBeCloseTo(wait - 1 / TICK_RATE)
        expect(victim.pos).toEqual(vec2(6, 1))
    })
})

describe("enemy statuses", () => {
    const frozen: EnemyStatus = {
        name: "test.frozen",
        holds: true,
        harmless: true,
    }
    function freezing(seconds: number) {
        return testBreath({
            fire(hit) {
                for (const e of hit.enemies) hit.addStatus(e, frozen, seconds)
            },
        })
    }

    it("freeze an enemy: it doesn't move or catch, and the player walks over it", () => {
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.moveProgress = 1
        const state = makeState(corridor, { x: 1, y: 1 }, [enemy], {
            breath: freezing(1),
        })
        state.players[0].breather.energy = 100
        state.players[0].character.moveProgress = 1
        tick(state, { breath: true })
        // Walk east onto its cell and on past it, uncaught.
        const xs: number[] = []
        for (let i = 0; i < 1 + MOVE * 2; i++) {
            expect(tick(state, { held: east })).toBeNull()
            const { x } = state.players[0].character.pos
            if (xs.at(-1) !== x) xs.push(x)
            expect(enemy.pos).toEqual(vec2(3, 1))
        }
        expect(xs).toEqual([2, 3, 4])
    })

    it("let a slide pass over a frozen enemy", () => {
        // Ice at x 2 to 4, a frozen enemy at x 3: the player slides over it
        // to the floor at x 5, uncaught, and the enemy stays put.
        const { map, ice } = textMap([
            "##########",
            "# ~~~    #",
            "##########",
            "#.########",
        ])
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.moveProgress = 1
        const state = makeState(map, { x: 1, y: 1 }, [enemy], { ice })
        addStatus(enemy, frozen, 10)
        state.players[0].character.moveProgress = 1
        tick(state, { held: east })
        for (let i = 0; i < MOVE * 3; i++) {
            expect(tick(state)).toBeNull()
        }
        expect(state.players[0].character.pos).toEqual(vec2(5, 1))
        run(state, MOVE * 2)
        expect(state.players[0].character.pos).toEqual(vec2(5, 1))
        expect(enemy.pos).toEqual(vec2(3, 1))
    })

    it("wear off, and the enemy moves again", () => {
        const enemy = makeEnemy(3, 1, AiType.random)
        enemy.moveProgress = 1
        const state = makeState(corridor, { x: 1, y: 1 }, [enemy], {
            breath: freezing(0.5),
        })
        state.players[0].breather.energy = 100
        tick(state, { breath: true })
        run(state, TICK_RATE / 2 - 1)
        expect(enemy.pos).toEqual(vec2(3, 1))
        tick(state)
        expect(enemy.statuses).toEqual([])
        expect(enemy.pos).not.toEqual(vec2(3, 1))
    })
})

describe("tile effects", () => {
    it("keep enemies out of blocked cells", () => {
        const block: TileEffect = { name: "test.block", blocksEnemies: true }
        // A chaser at the corridor's right end heads for the player on the
        // left, but the cells in front of the player are blocked.
        const { map } = textMap(["#######", "#     #", "#######", "#.#####"])
        const enemy = makeEnemy(5, 1, AiType.chase)
        const state = makeState(map, { x: 1, y: 1 }, [enemy], {
            breath: testBreath({
                fire(hit) {
                    for (const c of hit.cells) hit.addTile(c, block, 2)
                },
            }),
        })
        state.players[0].breather.energy = 100
        tick(state, { breath: true })
        for (let i = 0; i < TICK_RATE * 2 - 2; i++) {
            expect(tick(state)).toBeNull()
            expect(enemy.pos.x).toBeGreaterThanOrEqual(5)
        }
        // Once the effect is over it comes for the player.
        run(state, TICK_RATE * 2)
        expect(enemy.pos.x).toBeLessThan(5)
    })

    it("keep a phantom out of blocked cells", () => {
        const block: TileEffect = { name: "test.block", blocksEnemies: true }
        const { map } = textMap(["#######", "#     #", "#######", "#.#####"])
        const enemy = makeEnemy(5, 1, AiType.phantom)
        const state = makeState(map, { x: 1, y: 1 }, [enemy], {
            breath: testBreath({
                fire(hit) {
                    for (const c of hit.cells) hit.addTile(c, block, 2)
                },
            }),
        })
        state.players[0].breather.energy = 100
        tick(state, { breath: true })
        for (let i = 0; i < TICK_RATE * 2 - 2; i++) {
            expect(tick(state)).toBeNull()
            expect(enemy.pos.x).toBeGreaterThanOrEqual(5)
        }
        run(state, TICK_RATE * 2)
        expect(enemy.pos.x).toBeLessThan(5)
    })

    it("send an enemy inside a blocked cell out the shortest way", () => {
        const block: TileEffect = { name: "test.block", blocksEnemies: true }
        const { map } = textMap(["#######", "#     #", "#######", "#.#####"])
        const enemy = makeEnemy(3, 1, AiType.chase)
        enemy.moveProgress = 1
        const state = makeState(map, { x: 1, y: 1 }, [enemy], {
            breath: testBreath({
                shape: () => ({ kind: "line", range: 2 }),
                fire(hit) {
                    for (const c of hit.cells) hit.addTile(c, block, 2)
                },
            }),
        })
        state.players[0].breather.energy = 100
        tick(state, { breath: true })
        // Blocked: x 2 and 3. Out is east, away from the player.
        expect(enemy.pos).toEqual(vec2(4, 1))
    })

    it("let the player through an opened wall and push it out on regrowth", () => {
        const open: TileEffect = { name: "test.open", opensWall: true }
        const { map } = textMap(["#####", "# # #", "#####"])
        const state = makeState(map, { x: 1, y: 1 }, [], {
            breath: testBreath({
                fire(hit) {
                    if (!hit.wall) return false
                    hit.addTile(hit.wall, open, 1)
                },
            }),
        })
        state.players[0].breather.energy = 100
        state.players[0].character.moveProgress = 1
        tick(state, { breath: true })
        expect(state.players[0].breather.energy).toBe(90)
        tick(state, { held: east })
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        run(state, TICK_RATE)
        expect(state.cells[1][2]).toBe(1)
        expect(state.players[0].character.pos).toEqual(vec2(1, 1))
    })

    it("make temporary ice the player slides on", () => {
        const ice: TileEffect = { name: "test.ice", ice: true }
        const state = makeState(corridor, { x: 1, y: 1 }, [], {
            breath: testBreath({
                shape: () => ({ kind: "line", range: 2 }),
                fire(hit) {
                    for (const c of hit.cells) hit.addTile(c, ice, 5)
                },
            }),
        })
        state.players[0].breather.energy = 100
        state.players[0].character.moveProgress = 1
        tick(state, { breath: true })
        tick(state, { held: east })
        // Onto the ice at x 2, then slides over x 3 to the floor at x 4,
        // even with nothing held.
        run(state, MOVE * 2)
        expect(state.players[0].character.pos).toEqual(vec2(4, 1))
        expect(state.players[0].character.lastPos).toEqual(vec2(3, 1))
    })
})

describe("characters", () => {
    it("play as the default (the Dragon) unless told otherwise", () => {
        expect(
            createGameState(OLD_LEVEL).players[0].breather.breath.animal
        ).toBe("dragon")
        expect(
            createGameState(OLD_LEVEL, "skunk").players[0].breather.breath
                .animal
        ).toBe("skunk")
    })

    it("move at the character's speed", () => {
        expect(createGameState(OLD_LEVEL).players[0].character.speed).toBe(
            PLAYER_SPEED
        )
        expect(
            createGameState(OLD_LEVEL, "boar").players[0].character.speed
        ).toBe(3.5)
    })
})
