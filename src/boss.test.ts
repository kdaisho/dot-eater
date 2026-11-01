import { describe, expect, it } from "vite-plus/test"
import {
    bossDamage,
    bossFits,
    bossMove,
    createBoss,
    damageBoss,
    footprint,
    inFootprint,
    mapFloor,
    squareDistance,
    tickBoss,
} from "./boss"
import type { BlockMap } from "./breath"
import { BREATHS } from "./breaths"
import {
    BOSS_DEFEAT_POINTS,
    BOSS_FLASH,
    BOSS_HEALTH,
    BOSS_SPEED,
    Cell,
} from "./constants"
import { makeBoss, makeState, textMap, type MapLiteral } from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// A 4x4 arena (x 1-4, y 1-4) with a 1-wide corridor off it to the east
// along row 2. The dot in the wall pocket (bottom row) is never reached.
const lair = textMap([
    "##########",
    "#    #####",
    "#        #",
    "#    #####",
    "#    #####",
    "##########",
    "#.########",
]).map

// Cells `cells` marked blocked, the rest of `map` not.
function blockedAt(map: MapLiteral, cells: readonly Vec2[]): BlockMap {
    return map.map((row, y) =>
        row.map((_, x) => cells.some((c) => c.x === x && c.y === y))
    )
}

describe("createBoss", () => {
    it("starts at its spawn with full health, at the default speed", () => {
        const boss = createBoss(vec2(3, 4))
        expect(boss.pos).toEqual(vec2(3, 4))
        expect(boss.lastPos).toEqual(vec2(3, 4))
        expect(boss.spawn).toEqual(vec2(3, 4))
        expect(boss.speed).toBe(BOSS_SPEED)
        expect(boss.health).toBe(BOSS_HEALTH)
        expect(boss.maxHealth).toBe(BOSS_HEALTH)
        expect(boss.defeated).toBe(false)
        // A grace period before it first moves, as for enemies.
        expect(boss.moveProgress).toBe(0)
        expect(createBoss(vec2(0, 0), 3).speed).toBe(3)
    })

    it("starts with the health it is given, full", () => {
        const boss = createBoss(vec2(0, 0), undefined, undefined, 18)
        expect(boss.health).toBe(18)
        expect(boss.maxHealth).toBe(18)
        expect(boss.speed).toBe(BOSS_SPEED)
    })
})

describe("footprint", () => {
    it("is the 2x2 block down and right of its top-left cell", () => {
        expect(footprint(vec2(3, 4))).toEqual([
            vec2(3, 4),
            vec2(4, 4),
            vec2(3, 5),
            vec2(4, 5),
        ])
        for (const cell of footprint(vec2(3, 4))) {
            expect(inFootprint(vec2(3, 4), cell)).toBe(true)
        }
        for (const cell of [vec2(2, 4), vec2(5, 4), vec2(3, 3), vec2(3, 6)]) {
            expect(inFootprint(vec2(3, 4), cell)).toBe(false)
        }
    })

    it("fits only where all four cells are open and on the map", () => {
        const floor = mapFloor(lair)
        expect(bossFits(floor, vec2(1, 1))).toBe(true)
        expect(bossFits(floor, vec2(3, 3))).toBe(true)
        // Half in the corridor's walls.
        expect(bossFits(floor, vec2(4, 1))).toBe(false)
        expect(bossFits(floor, vec2(4, 2))).toBe(false)
        expect(bossFits(floor, vec2(9, 6))).toBe(false)
    })
})

describe("damage", () => {
    // KDA-289: by energy, whatever the breath or its charge level.
    it("is the energy a breath spends over 25", () => {
        expect(bossDamage(BREATHS.owl.cost)).toBeCloseTo(0.4)
        expect(bossDamage(BREATHS.dragon.cost)).toBeCloseTo(0.8)
        expect(bossDamage(BREATHS.skunk.cost)).toBeCloseTo(1.2)
        expect(bossDamage(BREATHS.dragon.cost * 5)).toBe(4)
        expect(bossDamage(25)).toBe(1)
    })

    it("takes health off and flashes, then defeats it at 0 for points, once", () => {
        const state = makeState(lair, { x: 1, y: 1 }, [], {
            boss: makeBoss(1, 3),
        })
        const boss = state.boss!
        damageBoss(state, 5)
        expect(boss.health).toBe(BOSS_HEALTH - 5)
        expect(boss.flash).toBe(BOSS_FLASH)
        expect(boss.defeated).toBe(false)
        expect(state.players[0].score).toBe(0)
        damageBoss(state, BOSS_HEALTH)
        expect(boss.health).toBe(0)
        expect(boss.defeated).toBe(true)
        expect(state.players[0].score).toBe(BOSS_DEFEAT_POINTS)
        damageBoss(state, 1)
        expect(boss.health).toBe(0)
        expect(state.players[0].score).toBe(BOSS_DEFEAT_POINTS)
    })

    it("counts the flash down", () => {
        const boss = makeBoss(1, 1)
        boss.flash = BOSS_FLASH
        tickBoss(boss, 0.1)
        expect(boss.flash).toBeCloseTo(BOSS_FLASH - 0.1)
        tickBoss(boss, 0.1)
        expect(boss.flash).toBe(0)
    })
})

describe("bossMove", () => {
    function move(
        boss: Vec2,
        player: Vec2,
        blocked: BlockMap | null = null,
        map: MapLiteral = lair
    ) {
        const state = makeState(map, player, [], {
            boss: makeBoss(boss.x, boss.y),
        })
        return bossMove(state, player, blocked)
    }

    it("heads for the player by the shortest way", () => {
        // Up and left are as short; up is first in direction order.
        expect(move(vec2(3, 3), vec2(1, 1))).toEqual(vec2(3, 2))
        expect(move(vec2(1, 3), vec2(1, 1))).toEqual(vec2(1, 2))
    })

    it("stays put once its footprint covers the player", () => {
        expect(move(vec2(1, 1), vec2(2, 2))).toBeNull()
        expect(move(vec2(1, 1), vec2(1, 1))).toBeNull()
    })

    it("doesn't follow the player into a 1-wide corridor", () => {
        // It waits at the corridor's mouth: its footprint covers (4, 2).
        expect(move(vec2(1, 2), vec2(7, 2))).toEqual(vec2(2, 2))
        expect(move(vec2(3, 2), vec2(7, 2))).toBeNull()
        expect(move(vec2(3, 1), vec2(7, 2))).toBeNull()
    })

    it("keeps out of blocked cells", () => {
        // The column in its way is blocked: no way round it fits.
        const blocked = blockedAt(lair, [vec2(3, 1), vec2(3, 2), vec2(3, 3)])
        expect(move(vec2(1, 1), vec2(4, 1), blocked)).toBeNull()
        // Without the block it goes straight for the player.
        expect(move(vec2(1, 1), vec2(4, 1))).toEqual(vec2(2, 1))
    })

    it("leaves a blocked cell by the shortest way", () => {
        const blocked = blockedAt(lair, [vec2(1, 1)])
        // Down (direction order) is as short as right, and clear of it.
        expect(move(vec2(1, 1), vec2(1, 1), blocked)).toEqual(vec2(1, 2))
    })

    it("stays put when every way out is blocked", () => {
        const all: Vec2[] = []
        lair.forEach((row, y) =>
            row.forEach((_, x) => {
                if (row[x] !== Cell.wall) all.push(vec2(x, y))
            })
        )
        expect(move(vec2(1, 1), vec2(4, 4), blockedAt(lair, all))).toBeNull()
    })

    it("treats a wall a breath has opened as a wall", () => {
        // Two rooms split by a wall column at x 3, open at (3, 1) and
        // (3, 2): wide enough for the boss, but it will grow back.
        const { map } = textMap([
            "#######",
            "#  #  #",
            "#  #  #",
            "#######",
            "#.#####",
        ])
        const state = makeState(map, { x: 5, y: 1 }, [], {
            boss: makeBoss(1, 1),
        })
        for (const pos of [vec2(3, 1), vec2(3, 2)]) {
            state.cells[pos.y][pos.x] = Cell.none
            state.tiles.push({
                pos,
                effect: { name: "test.opened", opensWall: true },
                left: 5,
            })
        }
        expect(bossMove(state, vec2(5, 1), null)).toBeNull()
        // Plain open floor there, it goes through.
        state.tiles = []
        expect(bossMove(state, vec2(5, 1), null)).toEqual(vec2(2, 1))
    })

    it("doesn't move once defeated", () => {
        const state = makeState(lair, { x: 1, y: 1 }, [], {
            boss: makeBoss(3, 3),
        })
        state.boss!.defeated = true
        expect(bossMove(state, vec2(1, 1), null)).toBeNull()
    })
})

describe("squareDistance", () => {
    const p = (x: number, y: number) => vec2(x, y)

    it("is 0 for a segment that starts, ends or passes inside", () => {
        expect(squareDistance(p(0.5, 0.5), p(3, 3))).toBe(0)
        expect(squareDistance(p(3, 3), p(1, 1))).toBe(0)
        expect(squareDistance(p(-2, 0.5), p(3, 0.5))).toBe(0)
        // Straight through a corner.
        expect(squareDistance(p(-1, 1), p(1, -1))).toBe(0)
    })

    it("measures to the nearest side for a point", () => {
        expect(squareDistance(p(1.6, 0.5), p(1.6, 0.5))).toBeCloseTo(0.6)
        expect(squareDistance(p(0.5, -0.6), p(0.5, -0.6))).toBeCloseTo(0.6)
    })

    it("measures to a corner off the diagonal", () => {
        expect(squareDistance(p(2, 2), p(2, 2))).toBeCloseTo(Math.SQRT2)
        expect(squareDistance(p(-0.4, -0.4), p(-0.4, -0.4))).toBeCloseTo(
            0.4 * Math.SQRT2
        )
    })

    it("finds the closest approach of a segment passing outside", () => {
        // Along a side, a cell away.
        expect(squareDistance(p(-3, 2), p(4, 2))).toBeCloseTo(1)
        // Past a corner: the segment x + y = 2.8 comes within
        // (2.8 - 2) / sqrt(2) of the corner (1, 1).
        expect(squareDistance(p(2.8, 0), p(0, 2.8))).toBeCloseTo(
            0.8 / Math.SQRT2
        )
        // Moving away: nearest at its start.
        expect(squareDistance(p(1.7, 0.5), p(3, 0.5))).toBeCloseTo(0.7)
    })
})
