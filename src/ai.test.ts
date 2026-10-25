import { describe, expect, it, vi } from "vite-plus/test"
import { AiType } from "./constants"
import { candidateMoves, enemyMove } from "./ai"
import { cellsFrom, fixedRandom, makeEnemy } from "./test/helpers"
import { vec2 } from "./vec2"

// An open crossroads: from the centre (2, 2) every direction is free.
const cross = [
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [0, 0, 0, 0, 0],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
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

    it("does not reverse even if that would be closest", () => {
        const cells = cellsFrom(cross)
        const enemy = makeEnemy(2, 2, AiType.chase, { x: 1, y: 2 })
        enemyMove(cells, enemy, vec2(0, 2), fixedRandom(0))
        // Reversing to (1, 2) is excluded. Up (2, 1) and down (2, 3) tie at
        // sqrt(5), closer than right (3, 2); the first in direction order wins.
        expect(enemy.pos).toEqual(vec2(2, 1))
    })
})

describe("enemyMove in a dead end", () => {
    // (1, 1) is a dead end whose only exit is east, back to (2, 1).
    const deadEnd = [
        [1, 1, 1, 1],
        [1, 0, 0, 1],
        [1, 1, 1, 1],
    ] as const

    for (const ai of [AiType.random, AiType.chase]) {
        const name = ai === AiType.random ? "random" : "chase"

        it(`${name}: turns back when there is nowhere else to go`, () => {
            const cells = cellsFrom(deadEnd)
            const enemy = makeEnemy(1, 1, ai, { x: 2, y: 1 })
            enemyMove(cells, enemy, vec2(1, 1), fixedRandom(0.5))
            expect(enemy.pos).toEqual(vec2(2, 1))
            expect(enemy.lastPos).toEqual(vec2(1, 1))
        })

        it(`${name}: stays put when boxed in on every side`, () => {
            const cells = cellsFrom([
                [1, 1, 1],
                [1, 0, 1],
                [1, 1, 1],
            ])
            const enemy = makeEnemy(1, 1, ai)
            enemyMove(cells, enemy, vec2(0, 0), fixedRandom(0.5))
            expect(enemy.pos).toEqual(vec2(1, 1))
            expect(enemy.lastPos).toEqual(vec2(1, 1))
        })
    }
})
