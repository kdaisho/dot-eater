import { describe, expect, it, vi } from "vite-plus/test"
import { AiType, AMBUSH_AHEAD } from "./constants"
import { ambushTarget, candidateMoves, enemyMove } from "./ai"
import {
    cellsFrom,
    fixedRandom,
    makeEnemy,
    makePatroller,
    textMap,
} from "./test/helpers"
import type { Character } from "./character"
import type { Cells } from "./level"
import { vec2, type Vec2 } from "./vec2"
import { slideDistances } from "./ice"

// slideDistances is spied on (still doing its real work) so tests can tell
// whether enemy pathing used it or took the no-ice fast path.
vi.mock("./ice", async (importOriginal) => {
    const ice = await importOriginal<typeof import("./ice")>()
    return { ...ice, slideDistances: vi.fn(ice.slideDistances) }
})

// An open crossroads: from the centre (2, 2) every direction is free.
const cross = [
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [0, 0, 0, 0, 0],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
] as const

// (1, 1) is a dead end whose only exit is east, to (2, 1).
const deadEnd = [
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
] as const

// (0, 1) is a dead end whose only exit is west, across the edge to (2, 1).
const wrapDeadEnd = [
    [1, 1, 1],
    [0, 1, 0],
    [1, 1, 1],
] as const

// From (2, 1), (3, 4) looks closer going right, but the right arm is a dead
// end: the only way there is down the left side.
const uTurn = [
    [1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 0, 1],
    [1, 0, 1, 1, 0, 1],
    [1, 0, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1],
] as const

// A single row that wraps around from east to west.
const corridor = [
    [1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1],
] as const

// A loop around a single wall block at (2, 2).
const ring = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
] as const

// (2, 3) is sealed off from the corridor on row 1.
const sealed = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
    [1, 1, 0, 1, 1],
    [1, 1, 1, 1, 1],
] as const

// An enemy at the junction (4, 7) that came from (3, 7), with the player at
// (2, 7). Up is a 6-cell dead end; right loops back round to the player in
// 10 moves (down is a wall).
const junction = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1, 1],
    [1, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 0, 1, 1, 1, 0, 1],
    [1, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
] as const

// (1, 1) is walled in on every side.
const boxed = [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
] as const

describe("candidateMoves", () => {
    it("excludes walls and the previous cell", () => {
        const cells = cellsFrom([
            [1, 1, 1],
            [0, 0, 0],
            [1, 0, 1],
        ])
        const enemy = makeEnemy(1, 1, AiType.random, { x: 0, y: 1 })
        expect(candidateMoves(cells, enemy)).toEqual([vec2(1, 2), vec2(2, 1)])
    })

    it("wraps around the map edges", () => {
        const cells = cellsFrom(cross)
        const enemy = makeEnemy(0, 2, AiType.random, { x: 1, y: 2 })
        expect(candidateMoves(cells, enemy)).toEqual([vec2(4, 2)])
    })

    it("allows only the previous cell in a dead end", () => {
        const cells = cellsFrom(deadEnd)
        const enemy = makeEnemy(1, 1, AiType.random, { x: 2, y: 1 })
        expect(candidateMoves(cells, enemy)).toEqual([vec2(2, 1)])
    })

    it("allows the way back across the map edge in a dead end", () => {
        const cells = cellsFrom(wrapDeadEnd)
        const enemy = makeEnemy(0, 1, AiType.random, { x: 2, y: 1 })
        expect(candidateMoves(cells, enemy)).toEqual([vec2(2, 1)])
    })

    it("is empty when boxed in on every side", () => {
        const cells = cellsFrom(boxed)
        const enemy = makeEnemy(1, 1, AiType.random)
        expect(candidateMoves(cells, enemy)).toEqual([])
    })
})

describe("enemyMove (random)", () => {
    it("always picks a valid candidate and never reverses", () => {
        const cells = cellsFrom(cross)
        for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) {
            const enemy = makeEnemy(2, 2, AiType.random, { x: 1, y: 2 })
            enemyMove(cells, enemy, vec2(0, 0), fixedRandom(r))
            expect([vec2(2, 1), vec2(2, 3), vec2(3, 2)]).toContainEqual(
                enemy.pos
            )
            expect(enemy.lastPos).toEqual(vec2(2, 2))
        }
    })

    it("uses the random source to choose among candidates", () => {
        const cells = cellsFrom(cross)
        // Candidates in direction order: up, down, right.
        const first = makeEnemy(2, 2, AiType.random, { x: 1, y: 2 })
        enemyMove(cells, first, vec2(0, 0), fixedRandom(0))
        expect(first.pos).toEqual(vec2(2, 1))
        const last = makeEnemy(2, 2, AiType.random, { x: 1, y: 2 })
        enemyMove(cells, last, vec2(0, 0), fixedRandom(0.99))
        expect(last.pos).toEqual(vec2(3, 2))
    })
})

describe("enemyMove (chase)", () => {
    // Also guards the missing-break regression: falling through from the
    // chase case would hit the default branch (which throws now, and used to
    // console.log), so assert neither happens.
    it("moves to the candidate closest to the target", () => {
        const cells = cellsFrom(cross)
        const cases = [
            { target: vec2(2, 0), expected: vec2(2, 1) },
            { target: vec2(2, 4), expected: vec2(2, 3) },
            { target: vec2(4, 2), expected: vec2(3, 2) },
            { target: vec2(0, 2), expected: vec2(1, 2) },
        ]
        const log = vi.spyOn(console, "log").mockImplementation(() => {})
        try {
            for (const { target, expected } of cases) {
                const enemy = makeEnemy(2, 2, AiType.chase)
                expect(() =>
                    enemyMove(cells, enemy, target, fixedRandom(0))
                ).not.toThrow()
                expect(enemy.pos).toEqual(expected)
                expect(enemy.lastPos).toEqual(vec2(2, 2))
            }
            expect(log).not.toHaveBeenCalled()
        } finally {
            log.mockRestore()
        }
    })

    // Regression: standing on its own aim point, every neighbour scored the
    // same and it took direction order (up), away from the player.
    it("goes for the player when it already stands where it aims", () => {
        const cells = cellsFrom(longRing)
        // The player at (5, 3) heads east from (4, 3); the cell ahead that is
        // open is (7, 3), where the ambusher stands.
        const ambusher = makeEnemy(7, 3, AiType.ambusher)
        enemyMove(cells, ambusher, vec2(5, 3), fixedRandom(0), vec2(4, 3))
        expect(ambusher.pos).toEqual(vec2(6, 3))
    })

    it("does not reverse even if that would be closest", () => {
        const cells = cellsFrom(cross)
        const enemy = makeEnemy(2, 2, AiType.chase, { x: 1, y: 2 })
        enemyMove(cells, enemy, vec2(0, 2), fixedRandom(0))
        // Reversing to (1, 2) is excluded. Right (3, 2) reaches (0, 2) in 2
        // steps across the east edge; up and down need 3 via the centre.
        expect(enemy.pos).toEqual(vec2(3, 2))
    })

    it("scores candidates by paths that don't double back through the enemy", () => {
        const cells = cellsFrom(junction)
        const enemy = makeEnemy(4, 7, AiType.chase, { x: 3, y: 7 })
        // Through the enemy's own cell, up and right would both be 3 steps
        // from the player and up would win the tie, costing 14 moves.
        enemyMove(cells, enemy, vec2(2, 7), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(5, 7))

        // Following the chase all the way reaches the player in 10 moves.
        let moves = 1
        while (!(enemy.pos.x === 2 && enemy.pos.y === 7) && moves < 30) {
            enemyMove(cells, enemy, vec2(2, 7), fixedRandom(0))
            moves++
        }
        expect(moves).toBe(10)
    })

    it("breaks ties by direction order", () => {
        const cells = cellsFrom(ring)
        const enemy = makeEnemy(2, 1, AiType.chase)
        // Left (1, 1) and right (3, 1) are both 3 steps from (2, 3); left
        // comes first in direction order.
        enemyMove(cells, enemy, vec2(2, 3), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(1, 1))
    })

    it("goes around a wall instead of towards the target in a straight line", () => {
        const cells = cellsFrom(uTurn)
        const enemy = makeEnemy(2, 1, AiType.chase)
        // Right (3, 1) is closer in a straight line but leads into a dead end.
        enemyMove(cells, enemy, vec2(3, 4), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(1, 1))
    })

    it("takes the short way across the map edge", () => {
        const cells = cellsFrom(corridor)
        const enemy = makeEnemy(1, 1, AiType.chase)
        // (6, 1) is 1 step west across the edge, 5 steps east.
        enemyMove(cells, enemy, vec2(6, 1), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(0, 1))
    })

    it("moves to the first candidate when the target is unreachable", () => {
        const cells = cellsFrom(sealed)
        const enemy = makeEnemy(2, 1, AiType.chase)
        expect(() =>
            enemyMove(cells, enemy, vec2(2, 3), fixedRandom(0))
        ).not.toThrow()
        // Candidates in direction order: left (1, 1), right (3, 1).
        expect(enemy.pos).toEqual(vec2(1, 1))
    })
})

describe("enemyMove in a dead end", () => {
    // AIs that keep to the no-reverse rule of candidateMoves.
    for (const [name, ai] of [
        ["random", AiType.random],
        ["chase", AiType.chase],
        ["ambusher", AiType.ambusher],
    ] as const) {
        it(`${name}: turns back when there is nowhere else to go`, () => {
            const cells = cellsFrom(deadEnd)
            const enemy = makeEnemy(1, 1, ai, { x: 2, y: 1 })
            enemyMove(cells, enemy, vec2(1, 1), fixedRandom(0.5))
            expect(enemy.pos).toEqual(vec2(2, 1))
            expect(enemy.lastPos).toEqual(vec2(1, 1))
        })

        it(`${name}: turns back across the map edge`, () => {
            const cells = cellsFrom(wrapDeadEnd)
            const enemy = makeEnemy(0, 1, ai, { x: 2, y: 1 })
            enemyMove(cells, enemy, vec2(1, 1), fixedRandom(0.5))
            expect(enemy.pos).toEqual(vec2(2, 1))
            expect(enemy.lastPos).toEqual(vec2(0, 1))
        })

        it(`${name}: stays put when boxed in on every side`, () => {
            const cells = cellsFrom(boxed)
            const enemy = makeEnemy(1, 1, ai)
            enemyMove(cells, enemy, vec2(0, 0), fixedRandom(0.5))
            expect(enemy.pos).toEqual(vec2(1, 1))
            expect(enemy.lastPos).toEqual(vec2(1, 1))
        })

        it(`${name}: remembers where it came from when boxed in`, () => {
            const cells = cellsFrom(boxed)
            // Came from (1, 0), which has since been walled off.
            const enemy = makeEnemy(1, 1, ai, { x: 1, y: 0 })
            enemyMove(cells, enemy, vec2(0, 0), fixedRandom(0.5))
            expect(enemy.pos).toEqual(vec2(1, 1))
            expect(enemy.lastPos).toEqual(vec2(1, 0))
        })
    }
})

// A ring of corridors around a solid wall block, 9 wide and 5 tall.
const longRing = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
] as const

// A straight corridor closed at both ends: (1, 1) to (5, 1).
const closedCorridor = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
] as const

describe("ambushTarget", () => {
    it("is the player itself before the player has moved", () => {
        const cells = cellsFrom(longRing)
        expect(ambushTarget(cells, vec2(2, 1), vec2(2, 1))).toEqual(vec2(2, 1))
    })

    it(`is ${AMBUSH_AHEAD} cells ahead along the player's latest move`, () => {
        const cells = cellsFrom(longRing)
        // Heading east from (1, 1) to (2, 1).
        expect(ambushTarget(cells, vec2(2, 1), vec2(1, 1))).toEqual(vec2(6, 1))
        // Heading west from (7, 3) to (6, 3).
        expect(ambushTarget(cells, vec2(6, 3), vec2(7, 3))).toEqual(vec2(2, 3))
    })

    it("reads a move across a wrap-around tunnel as one step", () => {
        const cells = cellsFrom(corridor)
        // The player stepped east off the edge, from (6, 1) to (0, 1).
        expect(ambushTarget(cells, vec2(0, 1), vec2(6, 1))).toEqual(vec2(4, 1))
        // And west, from (0, 1) to (6, 1).
        expect(ambushTarget(cells, vec2(6, 1), vec2(0, 1))).toEqual(vec2(2, 1))
    })

    it("walks back towards the player when the cell ahead is a wall", () => {
        const cells = cellsFrom(longRing)
        // Heading down from (1, 1) to (1, 2): (1, 6) and (1, 5) are off the
        // map and (1, 4) is a wall, so (1, 3).
        expect(ambushTarget(cells, vec2(1, 2), vec2(1, 1))).toEqual(vec2(1, 3))
        // Heading east from (4, 1) to (5, 1): (9, 1) is off the map and
        // (8, 1) a wall, so (7, 1).
        expect(ambushTarget(cells, vec2(5, 1), vec2(4, 1))).toEqual(vec2(7, 1))
    })

    it("is the player when nothing ahead is open", () => {
        const cells = cellsFrom(closedCorridor)
        // Heading east into the end wall of the corridor.
        expect(ambushTarget(cells, vec2(5, 1), vec2(4, 1))).toEqual(vec2(5, 1))
    })
})

describe("enemyMove (ambusher)", () => {
    // The enemy at (4, 3) can go west or east round the ring; the player at
    // (2, 1) is heading east from (1, 1).
    it("heads for the cell ahead of the player rather than the player", () => {
        const cells = cellsFrom(longRing)
        const chaser = makeEnemy(4, 3, AiType.chase)
        enemyMove(cells, chaser, vec2(2, 1), fixedRandom(0), vec2(1, 1))
        // The player is 5 moves away going west, 9 going east.
        expect(chaser.pos).toEqual(vec2(3, 3))

        const ambusher = makeEnemy(4, 3, AiType.ambusher)
        enemyMove(cells, ambusher, vec2(2, 1), fixedRandom(0), vec2(1, 1))
        // (6, 1) is 5 moves away going east, 9 going west.
        expect(ambusher.pos).toEqual(vec2(5, 3))
        expect(ambusher.lastPos).toEqual(vec2(4, 3))
    })

    it("chases the player directly before the player has moved", () => {
        const cells = cellsFrom(longRing)
        const ambusher = makeEnemy(4, 3, AiType.ambusher)
        enemyMove(cells, ambusher, vec2(2, 1), fixedRandom(0))
        expect(ambusher.pos).toEqual(vec2(3, 3))
    })

    it("does not reverse even if that would be closest", () => {
        const cells = cellsFrom(longRing)
        // Came from (5, 3), the short way to (6, 1); it may not turn back.
        const ambusher = makeEnemy(4, 3, AiType.ambusher, { x: 5, y: 3 })
        enemyMove(cells, ambusher, vec2(2, 1), fixedRandom(0), vec2(1, 1))
        expect(ambusher.pos).toEqual(vec2(3, 3))
    })
})

// Make `moves` patroller moves and return the cells it visits.
function walk(cells: Cells, enemy: Character, moves: number): Vec2[] {
    const visited: Vec2[] = []
    for (let i = 0; i < moves; i++) {
        enemyMove(cells, enemy, vec2(0, 0), fixedRandom(0))
        visited.push(enemy.pos)
    }
    return visited
}

describe("enemyMove (patroller)", () => {
    it("walks to its first waypoint, then back and forth along the route", () => {
        const cells = cellsFrom(closedCorridor)
        const enemy = makePatroller(3, 1, [
            [1, 1],
            [5, 1],
        ])
        const xs = walk(cells, enemy, 12).map((p) => p.x)
        expect(xs).toEqual([2, 1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3])
    })

    it("loops round its route, taking the shortest path between waypoints", () => {
        const cells = cellsFrom(ring)
        const enemy = makePatroller(1, 1, [
            [1, 1],
            [3, 1],
            [3, 3],
            [1, 3],
        ])
        expect(walk(cells, enemy, 10)).toEqual([
            vec2(2, 1),
            vec2(3, 1),
            vec2(3, 2),
            vec2(3, 3),
            vec2(2, 3),
            vec2(1, 3),
            vec2(1, 2),
            vec2(1, 1),
            vec2(2, 1),
            vec2(3, 1),
        ])
        expect(enemy.routeIndex).toBe(1)
    })

    it("turns back at a waypoint even where it could go on", () => {
        const cells = cellsFrom(corridor)
        // At its waypoint (3, 1), having come from (2, 1). The next
        // waypoint (1, 1) is 2 steps back the way it came, 5 onwards.
        const enemy = makePatroller(
            3,
            1,
            [
                [1, 1],
                [3, 1],
            ],
            { x: 2, y: 1 }
        )
        enemy.routeIndex = 1
        enemyMove(cells, enemy, vec2(0, 0), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(2, 1))
        expect(enemy.routeIndex).toBe(0)
    })

    it("uses wrap-around tunnels on the way", () => {
        const cells = cellsFrom(corridor)
        const enemy = makePatroller(1, 1, [
            [5, 1],
            [1, 1],
        ])
        // (5, 1) is 3 steps west across the edge, 4 east.
        expect(walk(cells, enemy, 3)).toEqual([
            vec2(0, 1),
            vec2(6, 1),
            vec2(5, 1),
        ])
    })

    it("ignores the player", () => {
        const cells = cellsFrom(closedCorridor)
        const enemy = makePatroller(3, 1, [
            [5, 1],
            [4, 1],
        ])
        enemyMove(cells, enemy, vec2(1, 1), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(4, 1))
    })

    it("throws without a route", () => {
        const cells = cellsFrom(closedCorridor)
        const enemy = makeEnemy(3, 1, AiType.patroller)
        expect(() =>
            enemyMove(cells, enemy, vec2(1, 1), fixedRandom(0))
        ).toThrow("A patroller needs a route")
    })
})

describe("enemyMove (phantom)", () => {
    it("passes through walls straight towards the player", () => {
        const cells = cellsFrom(longRing)
        // From (4, 1) to the player at (4, 3), through the wall at (4, 2).
        const enemy = makeEnemy(4, 1, AiType.phantom)
        enemyMove(cells, enemy, vec2(4, 3), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(4, 2))
        enemyMove(cells, enemy, vec2(4, 3), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(4, 3))
        expect(enemy.lastPos).toEqual(vec2(4, 2))
    })

    it("moves even when walled in on every side", () => {
        const cells = cellsFrom(boxed)
        const enemy = makeEnemy(1, 1, AiType.phantom)
        enemyMove(cells, enemy, vec2(1, 0), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(1, 0))
    })

    it("stays inside the map instead of using wrap-around tunnels", () => {
        const cells = cellsFrom(corridor)
        // The player at (6, 1) is 1 step west across the edge, but the
        // phantom goes the long way east.
        const enemy = makeEnemy(0, 1, AiType.phantom)
        enemyMove(cells, enemy, vec2(6, 1), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(1, 1))
    })

    it("never steps off the map in a corner", () => {
        const cells = cellsFrom(boxed)
        const enemy = makeEnemy(0, 0, AiType.phantom)
        enemyMove(cells, enemy, vec2(0, 2), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(0, 1))
    })

    it("breaks ties by direction order", () => {
        const cells = cellsFrom(longRing)
        // Down (1, 2) and right (2, 1) both bring it to 3 from (3, 3).
        const enemy = makeEnemy(1, 1, AiType.phantom)
        enemyMove(cells, enemy, vec2(3, 3), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(1, 2))
    })

    it("may turn back towards the player", () => {
        const cells = cellsFrom(longRing)
        const enemy = makeEnemy(3, 1, AiType.phantom, { x: 4, y: 1 })
        enemyMove(cells, enemy, vec2(6, 1), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(4, 1))
    })

    it("stays put on the player's cell", () => {
        const cells = cellsFrom(longRing)
        const enemy = makeEnemy(3, 1, AiType.phantom, { x: 2, y: 1 })
        enemyMove(cells, enemy, vec2(3, 1), fixedRandom(0))
        expect(enemy.pos).toEqual(vec2(3, 1))
        expect(enemy.lastPos).toEqual(vec2(2, 1))
    })
})

describe("enemyMove on ice", () => {
    // (1, 1) beside an ice lane (2, 1) to (6, 1) that ends on floor at
    // (7, 1), a dead end. The cell under (4, 1) leads down to (4, 3).
    const rink = textMap([
        "#########",
        "#.~~~~~.#",
        "#.##.####",
        "#.##.####",
        "#....####",
        "#########",
    ])
    const cells = cellsFrom(rink.map)

    // Regression: plain BFS treated ice as floor, so the chaser stepped east
    // onto the lane as the "shortest" way (5 moves) and slid away to (7, 1).
    it("a chaser doesn't step onto ice that carries it past the way to the player", () => {
        const enemy = makeEnemy(1, 1, AiType.chase)
        enemyMove(
            cells,
            enemy,
            vec2(4, 3),
            fixedRandom(0),
            vec2(4, 3),
            rink.ice
        )
        expect(enemy.pos).toEqual(vec2(1, 2))
    })

    it("a chaser still slides at a player on the lane", () => {
        // Stepping east slides over (4, 1): 3 moves, against 9 round below.
        const enemy = makeEnemy(1, 1, AiType.chase)
        enemyMove(
            cells,
            enemy,
            vec2(4, 1),
            fixedRandom(0),
            vec2(4, 1),
            rink.ice
        )
        expect(enemy.pos).toEqual(vec2(2, 1))
    })

    // Regression: the patroller went east for the waypoint, slid to (7, 1)
    // and back to (1, 1) over and over, never getting there.
    it("a patroller takes the way that really reaches its waypoint", () => {
        const enemy = makePatroller(1, 1, [
            [4, 3],
            [1, 1],
        ])
        enemyMove(
            cells,
            enemy,
            vec2(7, 1),
            fixedRandom(0),
            vec2(7, 1),
            rink.ice
        )
        expect(enemy.pos).toEqual(vec2(1, 2))
    })

    it("a phantom ignores ice", () => {
        // Onto the lane straight towards the player, and back along it, as
        // if the ice were floor.
        const enemy = makeEnemy(1, 1, AiType.phantom)
        enemyMove(
            cells,
            enemy,
            vec2(3, 1),
            fixedRandom(0),
            vec2(3, 1),
            rink.ice
        )
        expect(enemy.pos).toEqual(vec2(2, 1))
        const onIce = makeEnemy(3, 1, AiType.phantom, { x: 2, y: 1 })
        enemyMove(
            cells,
            onIce,
            vec2(1, 1),
            fixedRandom(0),
            vec2(1, 1),
            rink.ice
        )
        expect(onIce.pos).toEqual(vec2(2, 1))
    })
})

describe("enemyMove without ice", () => {
    const rink = textMap([
        "#######",
        "#.~~~.#",
        "#.###.#",
        "#.....#",
        "#######",
    ])
    const cells = cellsFrom(rink.map)
    const bare = cells.map((row) => row.map(() => false))
    const enemies = (): Character[] => [
        makeEnemy(1, 1, AiType.chase),
        makeEnemy(1, 1, AiType.ambusher),
        makePatroller(1, 1, [
            [5, 3],
            [1, 1],
        ]),
    ]

    it("skips the slide-aware search when the map has no ice", () => {
        vi.mocked(slideDistances).mockClear()
        for (const enemy of enemies()) {
            enemyMove(cells, enemy, vec2(5, 3), fixedRandom(0), vec2(5, 2))
            enemyMove(
                cells,
                enemy,
                vec2(5, 3),
                fixedRandom(0),
                vec2(5, 2),
                bare
            )
        }
        expect(slideDistances).not.toHaveBeenCalled()
    })

    it("still uses it when there is ice", () => {
        vi.mocked(slideDistances).mockClear()
        for (const enemy of enemies()) {
            enemyMove(
                cells,
                enemy,
                vec2(5, 3),
                fixedRandom(0),
                vec2(5, 2),
                rink.ice
            )
        }
        expect(slideDistances).toHaveBeenCalledTimes(3)
    })
})

describe("blocked cells", () => {
    // Blocked cells from a list of [x, y], on a map of `cells`' size.
    function blocks(
        cells: Cells,
        list: readonly (readonly [number, number])[]
    ): boolean[][] {
        const map = cells.map((row) => row.map(() => false))
        for (const [x, y] of list) map[y][x] = true
        return map
    }

    function move(enemy: Character, target: Vec2, blocked: boolean[][]) {
        const cells = cellsFrom(cross)
        enemyMove(
            cells,
            enemy,
            target,
            fixedRandom(0),
            target,
            undefined,
            blocked
        )
    }

    it("are walls to a chaser: it paths round them", () => {
        const enemy = makeEnemy(2, 2, AiType.chase)
        // The player is up, and the way up is blocked: it goes down, round
        // through the tunnel at the bottom.
        move(enemy, vec2(2, 0), blocks(cellsFrom(cross), [[2, 1]]))
        expect(enemy.pos).toEqual(vec2(2, 3))
    })

    it("are kept out of by a phantom", () => {
        const enemy = makeEnemy(2, 2, AiType.phantom)
        move(enemy, vec2(2, 0), blocks(cellsFrom(cross), [[2, 1]]))
        expect(enemy.pos).toEqual(vec2(2, 2))
    })

    it("are left by the shortest way by an enemy inside them", () => {
        // Inside a blocked patch: the only cell out within one step is east,
        // where it came from, though the player is west.
        const enemy = makeEnemy(2, 2, AiType.chase, { x: 3, y: 2 })
        const blocked = blocks(cellsFrom(cross), [
            [0, 2],
            [1, 2],
            [2, 2],
            [2, 1],
            [2, 3],
        ])
        move(enemy, vec2(0, 2), blocked)
        expect(enemy.pos).toEqual(vec2(3, 2))
    })
})
