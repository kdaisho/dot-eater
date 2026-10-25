import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell, CharacterId } from "./constants"
import { enemyMove } from "./ai"
import { checkEnd, createGameState, movePlayer, tick } from "./game"
import { parseLevel } from "./level"
import { fixedRandom, makeEnemy, makeState, OLD_MAP } from "./test/helpers"
import { vec2 } from "./vec2"

const map = [
    [1, 0, 1],
    [0, 2, 2],
    [1, 1, 1],
] as const

describe("movePlayer", () => {
    it("is blocked by walls", () => {
        const state = makeState(map, { x: 1, y: 1 })
        expect(movePlayer(state, vec2(0, 1))).toBe(true)
        expect(state.player.pos).toEqual(vec2(1, 1))
    })

    it("moves into empty cells", () => {
        const state = makeState(map, { x: 1, y: 1 })
        movePlayer(state, vec2(0, -1))
        expect(state.player.pos).toEqual(vec2(1, 0))
    })

    it("eats dots", () => {
        const state = makeState(map, { x: 1, y: 1 })
        movePlayer(state, vec2(1, 0))
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.cells[1][2]).toBe(Cell.none)
    })

    it("wraps around the edges", () => {
        const state = makeState(map, { x: 0, y: 1 })
        movePlayer(state, vec2(-1, 0))
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.cells[1][2]).toBe(Cell.none)

        const vertical = makeState(map, { x: 1, y: 0 })
        vertical.cells[2][1] = Cell.none
        movePlayer(vertical, vec2(0, -1))
        expect(vertical.player.pos).toEqual(vec2(1, 2))
    })

    it("ignores moves while locked", () => {
        const state = makeState(map, { x: 1, y: 1 })
        state.locked = true
        expect(movePlayer(state, vec2(1, 0))).toBe(false)
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.cells[1][2]).toBe(Cell.dot)
    })
})

describe("checkEnd", () => {
    it("returns null while dots remain and no enemy touches the player", () => {
        const state = makeState(map, { x: 1, y: 0 }, [makeEnemy(0, 1)])
        expect(checkEnd(state)).toBeNull()
        expect(state.locked).toBe(false)
    })

    it("wins when all dots are eaten", () => {
        const state = makeState(map, { x: 0, y: 1 })
        movePlayer(state, vec2(1, 0)) // eats the dot at (1, 1)
        expect(checkEnd(state)).toBeNull()
        movePlayer(state, vec2(1, 0)) // eats the last dot at (2, 1)
        expect(checkEnd(state)).toBe("won")
        expect(state.locked).toBe(true)
    })

    it("loses when an enemy shares the player's cell", () => {
        const state = makeState(map, { x: 1, y: 1 }, [makeEnemy(1, 1)])
        expect(checkEnd(state)).toBe("dead")
        expect(state.locked).toBe(true)
    })

    it("returns null once locked", () => {
        const state = makeState(map, { x: 1, y: 1 }, [makeEnemy(1, 1)])
        state.locked = true
        expect(checkEnd(state)).toBeNull()
    })
})

describe("swap collisions", () => {
    // Each enemy's lastPos is set so it can only move one way: from (2, 1)
    // with lastPos (3, 1) it goes west; from (1, 1) with lastPos (0, 1) east.
    const corridor = [
        [1, 1, 1, 1, 1],
        [2, 2, 2, 2, 2],
        [1, 1, 1, 1, 1],
    ] as const

    it("is a collision when the player moves into the cell an enemy just left", () => {
        const state = makeState(corridor, { x: 0, y: 1 }, [
            makeEnemy(2, 1, AiType.chase, { x: 3, y: 1 }),
        ])
        // An earlier move, so the swap below is the player's second move and
        // relies on movePlayer keeping lastPos up to date.
        movePlayer(state, vec2(1, 0))
        expect(checkEnd(state)).toBeNull()
        // Both move "at once": the enemy west, the player east.
        enemyMove(
            state.cells,
            state.enemies[0],
            state.player.pos,
            fixedRandom(0)
        )
        movePlayer(state, vec2(1, 0))
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(1, 1))
        expect(checkEnd(state)).toBe("dead")
    })

    it("is a collision when an enemy moves into the cell the player just left", () => {
        const state = makeState(corridor, { x: 1, y: 1 }, [
            makeEnemy(2, 1, AiType.random, { x: 3, y: 1 }),
        ])
        // Both move "at once": the player east, then the enemy west.
        movePlayer(state, vec2(1, 0))
        expect(tick(state, fixedRandom(0))).toBe("dead")
        expect(state.player.pos).toEqual(vec2(2, 1))
        expect(state.enemies[0].pos).toEqual(vec2(1, 1))
    })

    it("is a collision when the swapping enemy is not the first one", () => {
        const state = makeState(
            [
                [1, 1, 1, 1, 1, 1, 1],
                [2, 2, 2, 2, 2, 2, 2],
                [1, 1, 1, 1, 1, 1, 1],
            ],
            { x: 1, y: 1 },
            [
                // Moves west to (4, 1), away from the player.
                makeEnemy(5, 1, AiType.random, { x: 6, y: 1 }),
                // Swaps with the player.
                makeEnemy(
                    2,
                    1,
                    AiType.random,
                    { x: 3, y: 1 },
                    CharacterId.enemy2
                ),
            ]
        )
        // Both move "at once": the player east, then the enemies.
        movePlayer(state, vec2(1, 0))
        expect(tick(state, fixedRandom(0))).toBe("dead")
        expect(state.enemies[0].pos).toEqual(vec2(4, 1))
        expect(state.enemies[1].pos).toEqual(vec2(1, 1))
        expect(state.player.pos).toEqual(vec2(2, 1))
    })

    it("is not a collision when an enemy follows the player", () => {
        const state = makeState(corridor, { x: 2, y: 1 }, [
            makeEnemy(1, 1, AiType.chase, { x: 0, y: 1 }),
        ])
        movePlayer(state, vec2(1, 0))
        expect(checkEnd(state)).toBeNull()
        expect(tick(state, fixedRandom(0))).toBeNull()
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
    })
})

describe("tick", () => {
    it("moves every enemy and reports a collision", () => {
        const corridor = [
            [1, 1, 1, 1, 1],
            [0, 2, 2, 2, 0],
            [1, 1, 1, 1, 1],
        ] as const
        const state = makeState(corridor, { x: 2, y: 1 }, [
            makeEnemy(1, 1, AiType.chase, { x: 0, y: 1 }),
            makeEnemy(4, 1, AiType.random, { x: 0, y: 1 }, CharacterId.enemy2),
        ])
        expect(tick(state, fixedRandom(0))).toBe("dead")
        expect(state.enemies[0].pos).toEqual(vec2(2, 1))
        expect(state.enemies[1].pos).toEqual(vec2(3, 1))
    })
})

const OLD_PLAYER_START = vec2(4, 1)

describe("createGameState", () => {
    it("starts from the first level like the old hard-coded map", () => {
        const state = createGameState()
        expect(state.player.id).toBe(CharacterId.player)
        expect(state.player.pos).toEqual(OLD_PLAYER_START)
        expect(state.enemies.map((e) => e.id)).toEqual([
            CharacterId.enemy1,
            CharacterId.enemy2,
        ])
        expect(state.enemies.map((e) => e.pos)).toEqual([
            vec2(1, 4),
            vec2(7, 4),
        ])
        expect(state.enemies.map((e) => e.ai)).toEqual([
            AiType.random,
            AiType.chase,
        ])
        for (const enemy of state.enemies) {
            expect(enemy.lastPos).toEqual(enemy.pos)
        }
        expect(state.locked).toBe(false)
        expect(state.intervalId).toBeUndefined()
    })

    it("puts dots everywhere except walls and the player start", () => {
        const { cells } = createGameState()
        for (let y = 0; y < OLD_MAP.length; y++) {
            for (let x = 0; x < OLD_MAP[y].length; x++) {
                if (OLD_MAP[y][x] === Cell.wall) {
                    expect(cells[y][x]).toBe(Cell.wall)
                } else if (
                    x === OLD_PLAYER_START.x &&
                    y === OLD_PLAYER_START.y
                ) {
                    expect(cells[y][x]).toBe(Cell.none)
                } else {
                    expect(cells[y][x]).toBe(Cell.dot)
                }
            }
        }
    })

    it("builds the state from a given level", () => {
        const level = parseLevel({
            name: "tiny",
            map: ["#####", "#P.E#", "#####"],
            enemies: [{ ai: "chase" }],
        })
        const state = createGameState(level)
        expect(state.cells).toEqual([
            [1, 1, 1, 1, 1],
            [1, 0, 2, 2, 1],
            [1, 1, 1, 1, 1],
        ])
        expect(state.player.pos).toEqual(vec2(1, 1))
        expect(state.enemies).toHaveLength(1)
        expect(state.enemies[0].id).toBe(CharacterId.enemy1)
        expect(state.enemies[0].pos).toEqual(vec2(3, 1))
        expect(state.enemies[0].ai).toBe(AiType.chase)
    })

    it("returns a fresh state each time", () => {
        const a = createGameState()
        a.cells[0][0] = Cell.none
        a.cells[1][1] = Cell.none
        a.player.pos.x = 99
        a.enemies[0].pos.x = 99
        a.locked = true
        const b = createGameState()
        expect(b.cells[0][0]).toBe(Cell.wall)
        expect(b.cells[1][1]).toBe(Cell.dot)
        // Literals, so a shared (aliased) level spawn would be caught.
        expect(b.player.pos).toEqual(vec2(4, 1))
        expect(b.enemies[0].pos).toEqual(vec2(1, 4))
        expect(b.locked).toBe(false)
    })
})
