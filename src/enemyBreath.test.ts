import { describe, expect, it } from "vite-plus/test"
import {
    addStatus,
    defeatEnemy,
    pushEnemy,
    type EnemyStatus,
    type TileEffect,
} from "./breath"
import type { Character } from "./character"
import {
    AiType,
    Cell,
    ENEMY_BREATH_DAMAGE,
    ENEMY_BREATH_EVERY,
    ENEMY_BREATH_RANGE,
    ENEMY_BREATH_WIND_UP,
    ENEMY_IDS,
    MAX_HEALTH,
    RESPAWN_DELAY,
    TICK_RATE,
} from "./constants"
import { DIFFICULTIES, ENEMY_COUNT, MAP_SIZE } from "./difficulty"
import {
    ENEMY_BREATH,
    ENEMY_BREATH_EVERY_TICKS,
    ENEMY_BREATH_WIND_UP_TICKS,
    createEnemyBreath,
    enemyBreathCells,
    enemyBreathLooks,
    enemyBreathTarget,
    enemyInLine,
    enemyWarnings,
} from "./enemyBreath"
import type { GameEvent, GameEventType } from "./events"
import {
    createGameState,
    HURT_INVULNERABLE_TICKS,
    IDLE,
    step,
    takeOut,
    type GameState,
    type Mode,
    type MoveInput,
    type Outcome,
} from "./game"
import { stages } from "./levels"
import {
    fixedRandom,
    makeEnemy,
    makeState,
    textMap,
    type MapLiteral,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// The breather's breath (enemyBreath.ts, KDA-291): where it reaches, who is
// in line, its cadence through step(), what it does to the players it
// strikes, what calls it off, and the stages it comes out on. Its moves are
// in ai.breather.test.ts.

const EVERY = ENEMY_BREATH_EVERY * TICK_RATE
const WIND_UP = Math.round(ENEMY_BREATH_WIND_UP * TICK_RATE)

const right = vec2(1, 0)
const left = vec2(-1, 0)
const up = vec2(0, -1)
const down = vec2(0, 1)

// A 10x5 room. The dot in the wall pocket (bottom row) is never eaten, so
// the game isn't won by clearing the dots.
const room = textMap([
    "############",
    "#          #",
    "#          #",
    "#          #",
    "#          #",
    "#          #",
    "############",
    "#.##########",
]).map

// `room` with a wall at (5, 1).
const pillar = textMap([
    "############",
    "#    #     #",
    "#          #",
    "#          #",
    "#          #",
    "#          #",
    "############",
    "#.##########",
]).map

// A breather on (x, y) in slot `slot`, at rest there, its breath ready
// unless `ready` is false (then it has its grace period ahead, as it comes
// into play).
function breather(
    x: number,
    y: number,
    { ready = true, slot = 0 }: { ready?: boolean; slot?: number } = {}
): Character {
    const enemy = makeEnemy(x, y, AiType.breather, undefined, ENEMY_IDS[slot])
    enemy.moveProgress = 1
    if (ready) enemy.breath!.cooldown = 0
    return enemy
}

// A game on `map` with players on `players` at full health (unless
// `health` says otherwise) and `enemies`.
function game(
    players: Vec2 | readonly Vec2[],
    enemies: Character[],
    {
        map = room,
        mode = "solo",
        health = MAX_HEALTH,
    }: { map?: MapLiteral; mode?: Mode; health?: number } = {}
): GameState {
    const starts = "x" in players ? [players] : players
    return makeState(map, starts, enemies, { health, mode })
}

// One tick, player 1 doing `move` and any others idle.
function tick(state: GameState, move: MoveInput = IDLE): Outcome | null {
    return step(
        state,
        1 / TICK_RATE,
        state.players.map((_, i) => (i === 0 ? move : IDLE)),
        fixedRandom(0)
    )
}

// The events of `type` in the latest tick.
function eventsOf<T extends GameEventType>(
    state: GameState,
    type: T
): Extract<GameEvent, { type: T }>[] {
    return state.events.filter(
        (e): e is Extract<GameEvent, { type: T }> => e.type === type
    )
}

// Tick until an event of `type` happens; returns how many ticks that took.
// Fails after `max` ticks.
function ticksUntil(
    state: GameState,
    type: GameEventType,
    max = EVERY * 3
): number {
    for (let i = 1; i <= max; i++) {
        tick(state)
        if (eventsOf(state, type).length > 0) return i
    }
    throw new Error(`No ${type} within ${max} ticks`)
}

// Tick `n` times, failing on any event of `type`.
function ticksWithout(state: GameState, type: GameEventType, n: number) {
    for (let i = 0; i < n; i++) {
        tick(state)
        expect(eventsOf(state, type), `tick ${i + 1}`).toEqual([])
    }
}

const opensWall: TileEffect = { name: "test.open", opensWall: true }
const blocks: TileEffect = { name: "test.block", blocksEnemies: true }
const frozen: EnemyStatus = { name: "test.freeze", holds: true }

// Open the wall at `cell` as the Boar's breath does.
function openWall(state: GameState, cell: Vec2) {
    expect(state.cells[cell.y][cell.x]).toBe(Cell.wall)
    state.cells[cell.y][cell.x] = Cell.none
    state.tiles.push({ pos: cell, effect: opensWall, left: 100 })
}

const PUNCH: MoveInput = { held: [], pressed: vec2(0, 0), punch: true }

describe("createEnemyBreath", () => {
    it("starts with a whole cooldown ahead, the grace period", () => {
        expect(createEnemyBreath()).toEqual({
            cooldown: EVERY,
            windingUp: 0,
            facing: down,
            move: "chase",
        })
        expect(ENEMY_BREATH_EVERY_TICKS).toBe(EVERY)
        expect(ENEMY_BREATH_WIND_UP_TICKS).toBe(WIND_UP)
    })

    it("is the placeholder tuning: every 3 s, a 0.6 s wind-up, 4 cells, 20", () => {
        expect(ENEMY_BREATH_EVERY).toBe(3)
        expect(ENEMY_BREATH_WIND_UP).toBe(0.6)
        expect(ENEMY_BREATH_RANGE).toBe(4)
        expect(ENEMY_BREATH_DAMAGE).toBe(20)
    })

    it("is given to breathers, and only to them", () => {
        for (const ai of Object.values(AiType)) {
            const enemy = makeEnemy(1, 1, ai)
            expect(enemy.breath !== undefined, `ai ${ai}`).toBe(
                ai === AiType.breather
            )
        }
    })
})

describe("enemyBreathCells", () => {
    it("is one cell wide and up to 4 long, nearest first", () => {
        const state = game(vec2(9, 4), [])
        expect(enemyBreathCells(state, vec2(1, 2), right)).toEqual([
            vec2(2, 2),
            vec2(3, 2),
            vec2(4, 2),
            vec2(5, 2),
        ])
        expect(enemyBreathCells(state, vec2(5, 3), up)).toEqual([
            vec2(5, 2),
            vec2(5, 1),
        ])
    })

    it("stops at the first wall", () => {
        const state = game(vec2(9, 4), [], { map: pillar })
        expect(enemyBreathCells(state, vec2(2, 1), right)).toEqual([
            vec2(3, 1),
            vec2(4, 1),
        ])
    })

    it("stops at a Boar-opened wall, as at the wall it will be again", () => {
        const state = game(vec2(9, 4), [], { map: pillar })
        openWall(state, vec2(5, 1))
        expect(enemyBreathCells(state, vec2(2, 1), right)).toEqual([
            vec2(3, 1),
            vec2(4, 1),
        ])
    })

    it("isn't stopped by a tile that blocks enemies", () => {
        const state = game(vec2(9, 4), [])
        state.tiles.push({ pos: vec2(3, 2), effect: blocks, left: 5 })
        expect(enemyBreathCells(state, vec2(1, 2), right)).toHaveLength(4)
    })

    it("stops at the map's edge, without wrapping through a tunnel", () => {
        const tunnel = textMap(["#####", "     ", "#####"]).map
        const state = game(vec2(4, 1), [], { map: tunnel })
        expect(enemyBreathCells(state, vec2(1, 1), left)).toEqual([vec2(0, 1)])
    })
})

describe("enemyInLine", () => {
    it("finds a player in its row or column within 4 cells", () => {
        const state = game(vec2(9, 4), [])
        const at = vec2(5, 3)
        expect(enemyInLine(state, at, vec2(9, 3))).toEqual({
            facing: right,
            distance: 4,
        })
        expect(enemyInLine(state, at, vec2(5, 1))).toEqual({
            facing: up,
            distance: 2,
        })
        expect(enemyInLine(state, at, vec2(4, 3))).toEqual({
            facing: left,
            distance: 1,
        })
        expect(enemyInLine(state, at, vec2(10, 3))).toBeNull()
        expect(enemyInLine(state, at, vec2(6, 4))).toBeNull()
        expect(enemyInLine(state, at, at)).toBeNull()
    })

    it("can't see through a wall or into a Boar-opened wall", () => {
        const state = game(vec2(9, 4), [], { map: pillar })
        expect(enemyInLine(state, vec2(3, 1), vec2(6, 1))).toBeNull()
        openWall(state, vec2(5, 1))
        expect(enemyInLine(state, vec2(3, 1), vec2(6, 1))).toBeNull()
        expect(enemyInLine(state, vec2(3, 1), vec2(5, 1))).toBeNull()
        expect(enemyInLine(state, vec2(3, 1), vec2(4, 1))).not.toBeNull()
    })

    it("can't see past a tile that blocks enemies, but sees a player on one", () => {
        const state = game(vec2(9, 4), [])
        state.tiles.push({ pos: vec2(3, 2), effect: blocks, left: 5 })
        expect(enemyInLine(state, vec2(1, 2), vec2(4, 2))).toBeNull()
        expect(enemyInLine(state, vec2(1, 2), vec2(3, 2))).toEqual({
            facing: right,
            distance: 2,
        })
    })
})

describe("enemyBreathTarget", () => {
    it("targets the nearest player in play in line, player 1 on ties", () => {
        const enemy = breather(5, 3)
        const state = game([vec2(5, 1), vec2(8, 3)], [enemy], {
            mode: "coop",
        })
        expect(enemyBreathTarget(state, enemy)).toEqual({
            player: 0,
            facing: up,
        })
        state.players[1].character.pos = vec2(6, 3)
        expect(enemyBreathTarget(state, enemy)).toEqual({
            player: 1,
            facing: right,
        })
        state.players[1].character.pos = vec2(3, 3)
        expect(enemyBreathTarget(state, enemy)).toEqual({
            player: 0,
            facing: up,
        })
        takeOut(state.players[0], null)
        expect(enemyBreathTarget(state, enemy)).toEqual({
            player: 1,
            facing: left,
        })
        takeOut(state.players[1], null)
        expect(enemyBreathTarget(state, enemy)).toBeNull()
    })
})

describe("the breath, through step", () => {
    it("waits out a whole cooldown after it comes into play", () => {
        // In line from the start, 3 cells off, so it holds its spot.
        const state = game(vec2(4, 1), [breather(1, 1, { ready: false })])
        expect(ticksUntil(state, "enemyWindUp")).toBe(EVERY)
        expect(eventsOf(state, "enemyWindUp")).toEqual([
            { type: "enemyWindUp", enemy: 0, at: vec2(1, 1), facing: right },
        ])
    })

    it("winds up holding still, then breathes along its facing", () => {
        const enemy = breather(1, 1)
        const state = game(vec2(4, 1), [enemy])
        expect(ticksUntil(state, "enemyWindUp", 1)).toBe(1)
        for (let i = 0; i < WIND_UP - 1; i++) {
            tick(state)
            expect(enemy.pos).toEqual(vec2(1, 1))
            expect(eventsOf(state, "enemyBreathed")).toEqual([])
        }
        tick(state)
        expect(eventsOf(state, "enemyBreathed")).toEqual([
            {
                type: "enemyBreathed",
                enemy: 0,
                at: vec2(1, 1),
                facing: right,
                cells: [vec2(2, 1), vec2(3, 1), vec2(4, 1), vec2(5, 1)],
            },
        ])
        // Shown on its cells for a moment, as a look-only tile.
        const shown = state.tiles.filter((t) => t.effect === ENEMY_BREATH.blast)
        expect(shown.map((t) => t.pos)).toEqual([
            vec2(2, 1),
            vec2(3, 1),
            vec2(4, 1),
            vec2(5, 1),
        ])
    })

    it("hurts a player it strikes for 20, knocked away from it", () => {
        const state = game(vec2(4, 1), [breather(1, 1)])
        expect(ticksUntil(state, "enemyBreathed")).toBe(1 + WIND_UP)
        const player = state.players[0]
        expect(player.health).toBe(MAX_HEALTH - ENEMY_BREATH_DAMAGE)
        expect(eventsOf(state, "hurt")).toEqual([
            {
                type: "hurt",
                player: 0,
                at: vec2(4, 1),
                damage: ENEMY_BREATH_DAMAGE,
            },
        ])
        expect(player.character.pos).toEqual(vec2(5, 1))
        expect(player.invulnerableFor).toBe(HURT_INVULNERABLE_TICKS)
    })

    it("misses a player who steps out of line during the wind-up", () => {
        const state = game(vec2(4, 1), [breather(1, 1)])
        tick(state)
        expect(eventsOf(state, "enemyWindUp")).toHaveLength(1)
        const move: MoveInput = { held: [down], pressed: down }
        for (let i = 0; i < WIND_UP; i++) tick(state, move)
        expect(state.players[0].health).toBe(MAX_HEALTH)
    })

    it("doesn't wind up at a player just out of reach, or behind a wall", () => {
        // Ready, but nobody in line: it moves on instead (see
        // ai.breather.test.ts).
        const far = game(vec2(6, 1), [breather(1, 1)])
        ticksWithout(far, "enemyWindUp", 1)
        const walled = game(vec2(7, 1), [breather(3, 1)], { map: pillar })
        ticksWithout(walled, "enemyWindUp", 1)
    })

    it("doesn't hurt an invulnerable player, nor enemies on its cells", () => {
        const chaser = makeEnemy(2, 1, AiType.chase)
        chaser.moveProgress = 1
        const state = game(vec2(4, 1), [breather(1, 1), chaser])
        // The chaser would catch the player: keep it held.
        addStatus(chaser, frozen, 60)
        state.players[0].invulnerableFor = 1000
        expect(ticksUntil(state, "enemyBreathed")).toBe(1 + WIND_UP)
        expect(state.players[0].health).toBe(MAX_HEALTH)
        expect(chaser.respawnIn).toBe(0)
        expect(chaser.pos).toEqual(vec2(2, 1))
    })

    it("hits a player drawn within catching distance of a struck cell", () => {
        const state = game(vec2(4, 1), [breather(1, 1)])
        tick(state)
        expect(eventsOf(state, "enemyWindUp")).toHaveLength(1)
        for (let i = 0; i < WIND_UP - 1; i++) tick(state)
        // Gliding down out of the lane, not yet halfway.
        const c = state.players[0].character
        c.lastPos = vec2(4, 1)
        c.pos = vec2(4, 2)
        c.moveProgress = 0.3
        // The wind-up's last tick moves the glide on a little first.
        tick(state)
        expect(eventsOf(state, "enemyBreathed")).toHaveLength(1)
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_BREATH_DAMAGE)
    })

    it("knocks out a player with 20 health or less", () => {
        const state = game(vec2(4, 1), [breather(1, 1)], {
            health: ENEMY_BREATH_DAMAGE,
        })
        let outcome: Outcome | null = null
        for (let i = 0; i < 1 + WIND_UP && !outcome; i++) outcome = tick(state)
        expect(outcome).toBe("dead")
        expect(eventsOf(state, "playerCaught")).toHaveLength(1)
    })

    it("breathes again a whole cooldown after its last breath", () => {
        // 2 cells off in a corridor, the breather at its end: the player is
        // knocked to 3 off, still in line, and the breather can't step out
        // of line.
        const corridor = textMap([
            "#########",
            "#       #",
            "#########",
            "#.#######",
        ]).map
        const state = game(vec2(3, 1), [breather(1, 1)], { map: corridor })
        expect(ticksUntil(state, "enemyBreathed")).toBe(1 + WIND_UP)
        expect(state.players[0].character.pos).toEqual(vec2(4, 1))
        ticksWithout(state, "enemyWindUp", EVERY - 1)
        tick(state)
        expect(eventsOf(state, "enemyWindUp")).toHaveLength(1)
    })

    it("hurts either player in versus, as an enemy hit, not a stun", () => {
        const state = game([vec2(3, 1), vec2(4, 1)], [breather(1, 1)], {
            mode: "versus",
        })
        expect(ticksUntil(state, "enemyBreathed")).toBe(1 + WIND_UP)
        expect(state.players.map((p) => p.health)).toEqual([
            MAX_HEALTH - ENEMY_BREATH_DAMAGE,
            MAX_HEALTH - ENEMY_BREATH_DAMAGE,
        ])
        expect(eventsOf(state, "hurt").map((e) => e.player)).toEqual([0, 1])
        expect(eventsOf(state, "playerStunned")).toEqual([])
        expect(state.players.every((p) => p.stunnedFor === 0)).toBe(true)
    })

    it("doesn't breathe on the tick the last dot is eaten", () => {
        const map = textMap(["#######", "#    .#", "#######"]).map
        const state = game(vec2(4, 1), [breather(1, 1)], { map, health: 1 })
        tick(state)
        expect(eventsOf(state, "enemyWindUp")).toHaveLength(1)
        for (let i = 0; i < WIND_UP - 1; i++) tick(state)
        // The player steps onto the last dot as the breath would come.
        const move: MoveInput = { held: [right], pressed: right }
        state.players[0].character.moveProgress = 1
        expect(tick(state, move)).toBe("won")
        expect(eventsOf(state, "enemyBreathed")).toEqual([])
        expect(state.players[0].health).toBe(1)
    })

    it("is drawn as a glow and warning tint while it winds up", () => {
        const enemy = breather(1, 1)
        const state = game(vec2(4, 1), [enemy])
        expect(enemyWarnings(state)).toEqual([])
        expect(enemyBreathLooks(enemy)).toEqual([])
        tick(state)
        expect(enemyWarnings(state)).toEqual([
            {
                cells: [vec2(2, 1), vec2(3, 1), vec2(4, 1), vec2(5, 1)],
                color: ENEMY_BREATH.warning,
            },
        ])
        const alpha = () =>
            Number(/, ([\d.]+)\)$/.exec(enemyBreathLooks(enemy)[0].color!)![1])
        const first = alpha()
        for (let i = 0; i < WIND_UP / 2; i++) tick(state)
        expect(alpha()).toBeGreaterThan(first)
        expect(alpha()).toBeLessThanOrEqual(ENEMY_BREATH.glowTo)
    })
})

describe("calling the breath off", () => {
    // A breather on (2, 1) winding up at the player on (3, 1), who faces
    // it, so a punch reaches it.
    function windingUp(): { state: GameState; enemy: Character } {
        const enemy = breather(2, 1)
        const state = game(vec2(3, 1), [enemy])
        state.players[0].breather.facing = left
        tick(state)
        expect(eventsOf(state, "enemyWindUp")).toHaveLength(1)
        return { state, enemy }
    }

    it("is done by a punch that lands, which starts its cooldown", () => {
        const { state, enemy } = windingUp()
        tick(state, PUNCH)
        expect(eventsOf(state, "punchHit")).toHaveLength(1)
        expect(enemy.breath).toMatchObject({ windingUp: 0, cooldown: EVERY })
        expect(enemyWarnings(state)).toEqual([])
        ticksWithout(state, "enemyBreathed", WIND_UP + 10)
        expect(state.players[0].health).toBe(MAX_HEALTH)
    })

    it("is done by a punch that lands but knocks it nowhere", () => {
        const { state, enemy } = windingUp()
        // Punched so often it no longer moves (see KNOCK_STEPS).
        enemy.knocks = 4
        tick(state, PUNCH)
        expect(eventsOf(state, "punchHit")).toHaveLength(1)
        expect(enemy.knocks).toBe(4)
        expect(enemy.breath).toMatchObject({ windingUp: 0, cooldown: EVERY })
    })

    it("isn't done by a punch it blocks", () => {
        const { state, enemy } = windingUp()
        enemy.guard = 0.85
        // fixedRandom(0) is under any chance, so it blocks.
        tick(state, PUNCH)
        expect(eventsOf(state, "punchBlocked")).toHaveLength(1)
        expect(enemy.breath!.windingUp).toBe(WIND_UP - 1)
        // So it breathes on time: 1 + WIND_UP from the start.
        expect(ticksUntil(state, "enemyBreathed")).toBe(WIND_UP - 1)
        expect(state.players[0].health).toBeLessThan(MAX_HEALTH)
    })

    it("is done by a freeze, and a frozen breather doesn't wind up", () => {
        const { state, enemy } = windingUp()
        addStatus(enemy, frozen, 0.5)
        tick(state)
        expect(enemy.breath!.windingUp).toBe(0)
        // Still ready, but held for the rest of the freeze.
        expect(enemy.breath!.cooldown).toBe(0)
        ticksWithout(state, "enemyWindUp", 0.5 * TICK_RATE - 2)
        // Once it thaws it winds up again.
        expect(ticksUntil(state, "enemyWindUp", 5)).toBeGreaterThan(0)
    })

    it("is done by a push off its cell", () => {
        const { state, enemy } = windingUp()
        pushEnemy(state.cells, enemy, left, 1, [state.players[0].character])
        expect(enemy.pos).toEqual(vec2(1, 1))
        tick(state)
        expect(enemy.breath!.windingUp).toBe(0)
        expect(eventsOf(state, "enemyBreathed")).toEqual([])
    })

    it("is done by a defeat; it comes back with a whole cooldown", () => {
        const { state, enemy } = windingUp()
        defeatEnemy(state, enemy)
        tick(state)
        expect(enemy.breath).toMatchObject({ windingUp: 0, cooldown: EVERY })
        ticksWithout(state, "enemyBreathed", WIND_UP)
        // Back after RESPAWN_DELAY, then the grace before it breathes.
        for (let i = WIND_UP + 1; i < RESPAWN_DELAY * TICK_RATE; i++) {
            tick(state)
        }
        expect(enemy.respawnIn).toBe(0)
        expect(enemy.breath!.cooldown).toBeGreaterThan(EVERY - 5)
    })

    // KDA-290 brings it back sooner on Super Hard (GameState.respawnDelay),
    // and KDA-293 clears its stance: it still gets a whole grace period.
    it("comes back with a whole cooldown and no stance on Super Hard too", () => {
        const { state, enemy } = windingUp()
        state.respawnDelay = 3
        enemy.stance = 0.2
        defeatEnemy(state, enemy)
        expect(enemy.respawnIn).toBe(3)
        expect(enemy.stance).toBe(0)
        let back = 0
        while (enemy.respawnIn > 0) {
            tick(state)
            back++
            expect(back).toBeLessThanOrEqual(3 * TICK_RATE)
        }
        // Its first tick back in play counts towards the cooldown.
        expect(enemy.breath).toMatchObject({
            windingUp: 0,
            cooldown: EVERY - 1,
        })
        expect(enemy.stance).toBe(0)
    })

    it("is done while nobody is in play", () => {
        const { state, enemy } = windingUp()
        takeOut(state.players[0], 10)
        tick(state)
        expect(enemy.breath!.windingUp).toBe(0)
    })

    it("is done for a breather sharing its cell with an earlier one", () => {
        const first = breather(2, 1)
        const second = breather(2, 1, { slot: 1 })
        const state = game(vec2(4, 1), [first, second])
        tick(state)
        // Only the first winds up; the second steps off.
        expect(eventsOf(state, "enemyWindUp").map((e) => e.enemy)).toEqual([0])
        expect(second.pos).not.toEqual(vec2(2, 1))
    })
})

describe("breathers on the stages", () => {
    it("come out on every stage at every difficulty, two from Hard", () => {
        for (const [i, stage] of stages.entries()) {
            for (const d of DIFFICULTIES) {
                const count = stage[d].enemies.filter(
                    (e) => e.ai === AiType.breather
                ).length
                const want = MAP_SIZE[d] === "large" ? 2 : 1
                expect(count, `stage ${i + 1} at ${d}`).toBe(want)
                const breathers = createGameState(stage[d]).enemies.filter(
                    (e) => e.breath !== undefined
                )
                expect(breathers, `stage ${i + 1} at ${d}`).toHaveLength(want)
            }
        }
    })

    it("are within the first 3 of both maps, so Easy and Hard have one", () => {
        for (const [i, stage] of stages.entries()) {
            for (const d of ["easy", "hard"] as const) {
                expect(ENEMY_COUNT[d]).toBeGreaterThanOrEqual(3)
                const first = stage[d].enemies.slice(0, 3).map((e) => e.ai)
                expect(first, `stage ${i + 1} at ${d}`).toContain(
                    AiType.breather
                )
            }
        }
    })
})
