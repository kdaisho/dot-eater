import { describe, expect, it } from "vite-plus/test"
import {
    addStatus,
    addTileEffect,
    defeatEnemy,
    enemyBlocks,
    enemyVisible,
    pushEnemy,
    resolveShape,
    tickEffects,
    type EnemyStatus,
    type TileEffect,
} from "./breath"
import { BREATHS } from "./breaths"
import {
    AiType,
    BLINK_RATE,
    Cell,
    DEFEAT_POINTS,
    RESPAWN_BLINK,
    RESPAWN_DELAY,
    TICK_RATE,
} from "./constants"
import { hasIce } from "./ice"
import { ANIMAL_IDS } from "./roster"
import { cellsFrom, makeEnemy, makeState, textMap } from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

const TICK = 1 / TICK_RATE
const east = vec2(1, 0)
const west = vec2(-1, 0)
const south = vec2(0, 1)

// Run the breath timers for `seconds`, one tick at a time.
function tickFor(state: Parameters<typeof tickEffects>[0], seconds: number) {
    for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
        tickEffects(state, TICK)
    }
}

const xy = (cells: readonly Vec2[]) => cells.map((c) => [c.x, c.y])

describe("resolveShape", () => {
    // Row 1 wraps round (open at both edges); row 3 has a wall at x 4.
    const { map } = textMap([
        "#########",
        "         ",
        "#.#.#.#.#",
        "#...#...#",
        "#.......#",
        "#########",
    ])
    const cells = cellsFrom(map)

    it("covers just the player's cell for self", () => {
        const reach = resolveShape(cells, vec2(1, 3), east, { kind: "self" })
        expect(xy(reach.cells)).toEqual([[1, 3]])
        expect(reach.wall).toBeNull()
    })

    it("runs a line ahead, nearest first, stopping at a wall", () => {
        const reach = resolveShape(cells, vec2(1, 3), east, {
            kind: "line",
            range: 5,
        })
        expect(xy(reach.cells)).toEqual([
            [2, 3],
            [3, 3],
        ])
        expect(reach.wall).toEqual(vec2(4, 3))
    })

    it("stops a line at its range with no wall", () => {
        const reach = resolveShape(cells, vec2(5, 3), east, {
            kind: "line",
            range: 2,
        })
        expect(xy(reach.cells)).toEqual([
            [6, 3],
            [7, 3],
        ])
        expect(reach.wall).toBeNull()
    })

    it("takes a line through a tunnel without covering a cell twice", () => {
        const reach = resolveShape(cells, vec2(1, 1), west, {
            kind: "line",
            range: 20,
        })
        expect(xy(reach.cells)).toEqual([
            [0, 1],
            [8, 1],
            [7, 1],
            [6, 1],
            [5, 1],
            [4, 1],
            [3, 1],
            [2, 1],
        ])
    })

    it("widens a cone, with walls casting shadows", () => {
        // From (3, 1) facing down: (3, 2), then row 3 x 2-4 (x 4 is a
        // wall), then row 4 x 1-5, fed only through open cells of the row
        // before: (5, 4) is in the wall's shadow.
        const reach = resolveShape(cells, vec2(3, 1), south, {
            kind: "cone",
            range: 3,
        })
        expect(xy(reach.cells)).toEqual([
            [3, 2],
            [3, 3],
            [2, 3],
            [4, 4],
            [3, 4],
            [2, 4],
            [1, 4],
        ])
    })

    it("reports the wall straight in front of a cone", () => {
        const reach = resolveShape(cells, vec2(2, 1), south, {
            kind: "cone",
            range: 3,
        })
        expect(reach.cells).toEqual([])
        expect(reach.wall).toEqual(vec2(2, 2))
    })

    it("spreads an area through open cells only", () => {
        // Radius 1 around (3, 3): (4, 3) is a wall and (4, 4) is reached
        // round it, (2, 2) and (4, 2) are walls.
        const reach = resolveShape(cells, vec2(3, 3), east, {
            kind: "area",
            radius: 1,
        })
        // Nearest first: breadth-first, in direction order.
        expect(xy(reach.cells)).toEqual([
            [3, 3],
            [3, 2],
            [2, 3],
            [3, 4],
            [2, 4],
            [4, 4],
        ])
    })
})

describe("enemy statuses", () => {
    const frozen: EnemyStatus = { name: "test.frozen", holds: true }

    it("count down and expire", () => {
        const enemy = makeEnemy(1, 1)
        const state = makeState([[0, 0, 0]], { x: 0, y: 0 }, [enemy])
        addStatus(enemy, frozen, 0.5)
        tickFor(state, 0.5 - TICK)
        expect(enemy.statuses).toHaveLength(1)
        tickFor(state, TICK)
        expect(enemy.statuses).toEqual([])
    })

    it("refresh to the longer time when added again", () => {
        const enemy = makeEnemy(1, 0)
        addStatus(enemy, frozen, 2)
        addStatus(enemy, { ...frozen }, 1)
        expect(enemy.statuses).toEqual([{ status: frozen, left: 2 }])
    })
})

describe("defeatEnemy", () => {
    it("scores, sends the enemy to its spawn and brings it back after the delay", () => {
        const enemy = makeEnemy(2, 0, AiType.chase)
        const state = makeState([[0, 0, 0, 0]], { x: 0, y: 0 }, [enemy])
        state.spawns.enemies = [vec2(3, 0)]
        enemy.moveProgress = 0.5
        addStatus(enemy, { name: "x", holds: true }, 10)
        defeatEnemy(state, enemy)
        expect(state.score).toBe(DEFEAT_POINTS)
        expect(enemy.respawnIn).toBe(RESPAWN_DELAY)
        expect(enemy.pos).toEqual(vec2(3, 0))
        expect(enemy.lastPos).toEqual(vec2(3, 0))
        expect(enemy.statuses).toEqual([])
        expect(enemy.moveProgress).toBe(0)

        // A second defeat while out scores nothing.
        defeatEnemy(state, enemy)
        expect(state.score).toBe(DEFEAT_POINTS)

        tickFor(state, RESPAWN_DELAY - TICK)
        expect(enemy.respawnIn).toBeGreaterThan(0)
        tickFor(state, TICK)
        expect(enemy.respawnIn).toBe(0)
    })

    it("restarts a patroller's route", () => {
        const enemy = makeEnemy(1, 0, AiType.patroller)
        enemy.routeIndex = 2
        const state = makeState([[0, 0, 0]], { x: 0, y: 0 }, [enemy])
        defeatEnemy(state, enemy)
        expect(enemy.routeIndex).toBe(0)
    })
})

describe("enemyVisible", () => {
    it("hides a defeated enemy, then blinks it before it is back", () => {
        const enemy = makeEnemy(0, 0)
        expect(enemyVisible(enemy)).toBe(true)
        enemy.respawnIn = RESPAWN_DELAY
        expect(enemyVisible(enemy)).toBe(false)
        enemy.respawnIn = RESPAWN_BLINK + 0.01
        expect(enemyVisible(enemy)).toBe(false)
        const half = 1 / (BLINK_RATE * 2)
        enemy.respawnIn = RESPAWN_BLINK
        expect(enemyVisible(enemy)).toBe(true)
        enemy.respawnIn = RESPAWN_BLINK - half * 1.5
        expect(enemyVisible(enemy)).toBe(false)
        enemy.respawnIn = RESPAWN_BLINK - half * 2.5
        expect(enemyVisible(enemy)).toBe(true)
    })
})

describe("pushEnemy", () => {
    const { map } = textMap(["#####", "     ", "## ##"])

    it("pushes up to the distance, through a tunnel", () => {
        const cells = cellsFrom(map)
        const enemy = makeEnemy(1, 1)
        expect(pushEnemy(cells, enemy, west, 3)).toBe(3)
        expect(enemy.pos).toEqual(vec2(3, 1))
        // It glides in over its last cell, as if it had just moved there.
        expect(enemy.lastPos).toEqual(vec2(4, 1))
        expect(enemy.moveProgress).toBe(0)
    })

    it("stops before a wall", () => {
        const cells = cellsFrom(map)
        const enemy = makeEnemy(2, 1)
        expect(pushEnemy(cells, enemy, south, 3)).toBe(1)
        expect(enemy.pos).toEqual(vec2(2, 2))
        const stuck = makeEnemy(1, 1)
        stuck.moveProgress = 0.5
        expect(pushEnemy(cells, stuck, south, 3)).toBe(0)
        expect(stuck.pos).toEqual(vec2(1, 1))
        expect(stuck.moveProgress).toBe(0.5)
    })
})

describe("tile effects", () => {
    const blocker: TileEffect = { name: "test.block", blocksEnemies: true }
    const ice: TileEffect = { name: "test.ice", ice: true }
    const opening: TileEffect = { name: "test.open", opensWall: true }

    it("block cells for enemies until they expire", () => {
        const state = makeState([[0, 0, 0]], { x: 0, y: 0 })
        expect(enemyBlocks(state)).toBeNull()
        addTileEffect(state, vec2(2, 0), blocker, 1)
        expect(enemyBlocks(state)).toEqual([[false, false, true]])
        tickFor(state, 1)
        expect(state.tiles).toEqual([])
        expect(enemyBlocks(state)).toBeNull()
    })

    it("refresh to the longer time when added again", () => {
        const state = makeState([[0, 0, 0]], { x: 0, y: 0 })
        addTileEffect(state, vec2(2, 0), blocker, 1)
        addTileEffect(state, vec2(2, 0), blocker, 3)
        addTileEffect(state, vec2(2, 0), blocker, 2)
        expect(state.tiles).toEqual([
            { pos: vec2(2, 0), effect: blocker, left: 3 },
        ])
    })

    it("make temporary ice as a new grid, then melt it", () => {
        const state = makeState([[0, 0, 0]], { x: 0, y: 0 })
        const before = state.ice
        expect(hasIce(before)).toBe(false)
        addTileEffect(state, vec2(1, 0), ice, 1)
        expect(state.ice).not.toBe(before)
        expect(state.ice).toEqual([[false, true, false]])
        expect(hasIce(state.ice)).toBe(true)
        // The level's own ice is untouched.
        expect(state.floorIce).toEqual([[false, false, false]])
        tickFor(state, 1)
        expect(state.ice).toEqual([[false, false, false]])
        expect(hasIce(state.ice)).toBe(false)
    })

    it("keep level ice when temporary ice melts", () => {
        const { map, ice: levelIce } = textMap(["~  "])
        const state = makeState(map, { x: 2, y: 0 }, [], { ice: levelIce })
        addTileEffect(state, vec2(0, 0), ice, 1)
        addTileEffect(state, vec2(1, 0), ice, 1)
        tickFor(state, 1)
        expect(state.ice).toEqual([[true, false, false]])
    })

    it("never form ice under a character", () => {
        const enemy = makeEnemy(1, 0)
        const state = makeState([[0, 0, 0]], { x: 0, y: 0 }, [enemy])
        addTileEffect(state, vec2(0, 0), ice, 1)
        addTileEffect(state, vec2(1, 0), ice, 1)
        addTileEffect(state, vec2(2, 0), ice, 1)
        expect(state.ice).toEqual([[false, false, true]])
    })

    it("open a wall and grow it back", () => {
        const state = makeState([[0, 1, 0]], { x: 0, y: 0 })
        addTileEffect(state, vec2(1, 0), opening, 1)
        expect(state.cells[0][1]).toBe(Cell.none)
        tickFor(state, 1)
        expect(state.cells[0][1]).toBe(Cell.wall)
    })

    it("don't open a cell that isn't a wall", () => {
        const state = makeState([[0, 2, 0]], { x: 0, y: 0 })
        addTileEffect(state, vec2(1, 0), opening, 1)
        expect(state.tiles).toEqual([])
        expect(state.cells[0][1]).toBe(Cell.dot)
    })

    it("push anyone in a regrowing wall back where they came from", () => {
        const enemy = makeEnemy(1, 1, AiType.random, { x: 1, y: 0 })
        const state = makeState(
            [
                [0, 0, 0],
                [0, 1, 0],
            ],
            { x: 0, y: 1 },
            [enemy]
        )
        addTileEffect(state, vec2(1, 1), opening, 1)
        state.player.pos = vec2(1, 1)
        state.player.lastPos = vec2(0, 1)
        tickFor(state, 1)
        expect(state.cells[1][1]).toBe(Cell.wall)
        expect(state.player.pos).toEqual(vec2(0, 1))
        expect(state.player.lastPos).toEqual(vec2(0, 1))
        expect(enemy.pos).toEqual(vec2(1, 0))
    })

    it("push to the nearest open cell when there is no way back", () => {
        const state = makeState(
            [
                [1, 1, 1],
                [1, 1, 0],
            ],
            { x: 2, y: 1 }
        )
        addTileEffect(state, vec2(1, 0), opening, 1)
        state.player.pos = vec2(1, 0)
        state.player.lastPos = vec2(1, 0)
        tickFor(state, 1)
        expect(state.player.pos).toEqual(vec2(2, 1))
    })
})

describe("the breath registry", () => {
    it("has a breath for every animal, with the decided costs and stats", () => {
        for (const id of ANIMAL_IDS) expect(BREATHS[id].animal).toBe(id)
        const costs = ANIMAL_IDS.map((id) => BREATHS[id].cost)
        expect(costs).toEqual([50, 50, 25, 50, 75])
        const cooldowns = ANIMAL_IDS.map((id) => BREATHS[id].cooldown)
        expect(cooldowns).toEqual([1, 1, 0.5, 1, 1])
        const meters = ANIMAL_IDS.map((id) => BREATHS[id].maxEnergy)
        expect(meters).toEqual([100, 100, 100, 150, 100])
        expect(BREATHS.boar.speedScale).toBe(0.875)
    })
})
