import { describe, expect, it } from "vite-plus/test"
import { enemyMove } from "./ai"
import type { Character } from "./character"
import {
    AiType,
    BREATHER_KEEP_FAR,
    BREATHER_KEEP_NEAR,
    ENEMY_DAMAGE,
    ENEMY_IDS,
    MAX_HEALTH,
    TICK_RATE,
} from "./constants"
import { enemyInLine, type EnemyBreath } from "./enemyBreath"
import { IDLE, step, type GameState, type MoveInput } from "./game"
import type { Cells } from "./level"
import { distanceMap } from "./path"
import {
    cellsFrom,
    fixedRandom,
    makeEnemy,
    makeState,
    textMap,
    type MapLiteral,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// The breather's moves (breatherStep in ai.ts, KDA-291): it chases while
// its breath is ready, stops once a player is in line, and keeps its
// distance between breaths. Its breath is in enemyBreath.test.ts.

// An open 10x5 room. The dot in the wall pocket (bottom row) is never
// eaten, so the game isn't won by clearing the dots.
const roomMap = textMap([
    "############",
    "#          #",
    "#          #",
    "#          #",
    "#          #",
    "#          #",
    "############",
    "#.##########",
]).map

// A 1-wide corridor, (1, 1) to (9, 1).
const corridorMap = textMap([
    "###########",
    "#         #",
    "###########",
    "#.#########",
]).map

// A breather on (x, y) that came from `last` (its own cell by default),
// ready to move, moving `move` (see EnemyBreath.move), in slot `slot`.
function breather(
    x: number,
    y: number,
    move: EnemyBreath["move"],
    { last = vec2(x, y), slot = 0 }: { last?: Vec2; slot?: number } = {}
): Character {
    const enemy = makeEnemy(x, y, AiType.breather, last, ENEMY_IDS[slot])
    enemy.moveProgress = 1
    enemy.breath!.move = move
    return enemy
}

// Where `enemy` moves going after `target` on `map` (see enemyMove), with
// `crowd` the enemies in play.
function moveOn(
    map: MapLiteral,
    enemy: Character,
    target: Vec2,
    crowd: readonly Character[] = [enemy]
): Vec2 {
    const cells: Cells = cellsFrom(map)
    enemyMove(
        cells,
        enemy,
        target,
        fixedRandom(0),
        target,
        undefined,
        null,
        cells,
        new Map(),
        crowd
    )
    return enemy.pos
}

// The path distance from `a` to `b` on `map`.
function pathDistance(map: MapLiteral, a: Vec2, b: Vec2): number {
    return distanceMap(cellsFrom(map), a)[b.y][b.x]
}

describe("a breather's moves", () => {
    it("chases like a chaser while its breath is ready", () => {
        for (const [x, y, lx, ly] of [
            [8, 4, 9, 4],
            [3, 5, 3, 4],
            [6, 2, 6, 2],
        ]) {
            const target = vec2(1, 1)
            const chaser = makeEnemy(x, y, AiType.chase, vec2(lx, ly))
            const mine = breather(x, y, "chase", { last: vec2(lx, ly) })
            expect(moveOn(roomMap, mine, target)).toEqual(
                moveOn(roomMap, chaser, target)
            )
        }
    })

    it("stays put while it holds (winding up, or a player in line)", () => {
        const enemy = breather(5, 3, "hold")
        expect(moveOn(roomMap, enemy, vec2(1, 1))).toEqual(vec2(5, 3))
    })

    it("holds its spot between breaths 3 to 4 moves from the player", () => {
        expect([BREATHER_KEEP_NEAR, BREATHER_KEEP_FAR]).toEqual([3, 4])
        for (const x of [4, 5]) {
            const enemy = breather(x, 1, "keep", { last: vec2(x + 1, 1) })
            expect(moveOn(corridorMap, enemy, vec2(1, 1))).toEqual(vec2(x, 1))
        }
    })

    it("comes closer between breaths when farther than that", () => {
        const enemy = breather(7, 1, "keep", { last: vec2(8, 1) })
        expect(moveOn(corridorMap, enemy, vec2(1, 1))).toEqual(vec2(6, 1))
    })

    it("steps away between breaths when nearer, back the way it came too", () => {
        // In a corridor heading for the player: back is the only way out.
        const enemy = breather(3, 1, "keep", { last: vec2(4, 1) })
        expect(moveOn(corridorMap, enemy, vec2(1, 1))).toEqual(vec2(4, 1))
        // In the open, the farthest way, ties in direction order (up first).
        const open = breather(6, 3, "keep", { last: vec2(7, 3) })
        const target = vec2(5, 3)
        const to = moveOn(roomMap, open, target)
        expect(to).toEqual(vec2(6, 2))
        expect(pathDistance(roomMap, target, to)).toBe(2)
    })

    it("stays put when cornered, rather than going for contact", () => {
        const enemy = breather(1, 1, "keep")
        expect(moveOn(corridorMap, enemy, vec2(2, 1))).toEqual(vec2(1, 1))
    })

    it("never steps onto another breather's cell", () => {
        // The best way, (5, 1), is taken by a breather holding there; there
        // is no other way within reach, so it holds instead of stacking.
        const ahead = breather(5, 1, "hold", { slot: 0 })
        const enemy = breather(6, 1, "chase", { last: vec2(7, 1), slot: 1 })
        expect(moveOn(corridorMap, enemy, vec2(1, 1), [ahead, enemy])).toEqual(
            vec2(6, 1)
        )
        // However long it has held already.
        enemy.heldFor = 10
        expect(moveOn(corridorMap, enemy, vec2(1, 1), [ahead, enemy])).toEqual(
            vec2(6, 1)
        )
        // In the open it goes round, a way within SPREAD_SLACK of the best.
        const near = breather(5, 3, "hold", { slot: 0 })
        const other = breather(6, 3, "chase", { last: vec2(7, 3), slot: 1 })
        expect(moveOn(roomMap, other, vec2(1, 3), [near, other])).toEqual(
            vec2(6, 2)
        )
    })

    it("parts from another breather on its cell, away from the player", () => {
        const first = breather(5, 3, "hold", { slot: 0 })
        const second = breather(5, 3, "part", { slot: 1 })
        const to = moveOn(roomMap, second, vec2(1, 3), [first, second])
        // Up, down or right are each 1 farther; up comes first.
        expect(to).toEqual(vec2(5, 2))
    })
})

describe("a breather in play", () => {
    // A game on `map` with the player on `player` at full health and
    // `enemies`.
    function game(
        map: MapLiteral,
        player: Vec2,
        enemies: Character[]
    ): GameState {
        return makeState(map, player, enemies, { health: MAX_HEALTH })
    }
    const tick = (state: GameState, move: MoveInput = IDLE) =>
        step(state, 1 / TICK_RATE, move, fixedRandom(0))

    it("chases until a player is in line within 4 cells, then breathes", () => {
        const enemy = makeEnemy(10, 5, AiType.breather)
        enemy.breath!.cooldown = 0
        const state = game(roomMap, vec2(3, 1), [enemy])
        let ticks = 0
        while (!state.events.some((e) => e.type === "enemyWindUp")) {
            tick(state)
            ticks++
            expect(ticks).toBeLessThan(TICK_RATE * 10)
        }
        const line = enemyInLine(state, enemy.pos, vec2(3, 1))
        expect(line).not.toBeNull()
        expect(line!.distance).toBeLessThanOrEqual(4)
        // It stopped as soon as it got in line: the cell before wasn't.
        expect(enemyInLine(state, enemy.lastPos, vec2(3, 1))).toBeNull()
    })

    it("stops on the cell it glides into once a player is in line", () => {
        // Gliding into (5, 3) with the player 4 cells off along the row.
        const enemy = makeEnemy(5, 3, AiType.breather, vec2(6, 3))
        enemy.breath!.cooldown = 0
        enemy.moveProgress = 0.99
        const chaser = makeEnemy(5, 3, AiType.chase, vec2(6, 3), ENEMY_IDS[1])
        chaser.moveProgress = 0.99
        const state = game(roomMap, vec2(1, 3), [enemy, chaser])
        tick(state)
        // The chaser goes on; the breather stays to wind up.
        expect(chaser.pos).toEqual(vec2(4, 3))
        expect(enemy.pos).toEqual(vec2(5, 3))
        tick(state)
        expect(state.events.filter((e) => e.type === "enemyWindUp")).toEqual([
            {
                type: "enemyWindUp",
                enemy: 0,
                at: vec2(5, 3),
                facing: vec2(-1, 0),
            },
        ])
    })

    it("keeps 3 to 4 moves off between breaths, never going for contact", () => {
        const enemy = makeEnemy(10, 5, AiType.breather)
        // Always cooling down.
        enemy.breath!.cooldown = Infinity
        const player = vec2(1, 1)
        const state = game(roomMap, player, [enemy])
        let nearest = Infinity
        for (let i = 0; i < TICK_RATE * 10; i++) {
            tick(state)
            nearest = Math.min(
                nearest,
                pathDistance(roomMap, player, enemy.pos)
            )
        }
        expect(nearest).toBeGreaterThanOrEqual(BREATHER_KEEP_NEAR)
        const at = pathDistance(roomMap, player, enemy.pos)
        expect(at).toBeGreaterThanOrEqual(BREATHER_KEEP_NEAR)
        expect(at).toBeLessThanOrEqual(BREATHER_KEEP_FAR)
        expect(state.players[0].health).toBe(MAX_HEALTH)
    })

    it("backs off from a player coming at it", () => {
        const enemy = makeEnemy(5, 1, AiType.breather, vec2(6, 1))
        enemy.breath!.cooldown = Infinity
        enemy.moveProgress = 1
        // The player 2 off along the corridor.
        const state = game(corridorMap, vec2(3, 1), [enemy])
        tick(state)
        expect(enemy.pos).toEqual(vec2(6, 1))
    })

    it("still hurts a player who touches it", () => {
        const enemy = makeEnemy(4, 1, AiType.breather)
        enemy.breath!.cooldown = Infinity
        enemy.moveProgress = 1
        const state = game(corridorMap, vec2(1, 1), [enemy])
        const move: MoveInput = { held: [vec2(1, 0)], pressed: vec2(1, 0) }
        let hurt = false
        for (let i = 0; i < TICK_RATE * 4 && !hurt; i++) {
            tick(state, move)
            hurt = state.events.some((e) => e.type === "hurt")
        }
        expect(hurt).toBe(true)
        expect(state.players[0].health).toBe(MAX_HEALTH - ENEMY_DAMAGE)
    })

    it("doesn't stand on one cell with another breather", () => {
        const one = makeEnemy(10, 5, AiType.breather, undefined, ENEMY_IDS[0])
        const two = makeEnemy(10, 4, AiType.breather, undefined, ENEMY_IDS[1])
        for (const e of [one, two]) e.breath!.cooldown = Infinity
        const state = game(roomMap, vec2(1, 1), [one, two])
        for (let i = 0; i < TICK_RATE * 10; i++) {
            tick(state)
            expect(one.pos, `tick ${i + 1}`).not.toEqual(two.pos)
        }
    })
})
