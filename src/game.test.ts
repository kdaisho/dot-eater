import { describe, expect, it } from "vite-plus/test"
import { AiType, Cell, CharacterId } from "./constants"
import { checkEnd, createGameState, movePlayer, tick } from "./game"
import { createCells, ENEMY_STARTS, PLAYER_START } from "./level"
import { fixedRandom, makeEnemy, makeState } from "./test/helpers"
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

describe("createGameState", () => {
    it("places characters at their start positions", () => {
        const state = createGameState()
        expect(state.player.id).toBe(CharacterId.player)
        expect(state.player.pos).toEqual(PLAYER_START)
        expect(state.enemies.map((e) => e.pos)).toEqual([...ENEMY_STARTS])
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
        const base = createCells()
        for (let y = 0; y < base.length; y++) {
            for (let x = 0; x < base[y].length; x++) {
                if (base[y][x] === Cell.wall) {
                    expect(cells[y][x]).toBe(Cell.wall)
                } else if (x === PLAYER_START.x && y === PLAYER_START.y) {
                    expect(cells[y][x]).toBe(Cell.none)
                } else {
                    expect(cells[y][x]).toBe(Cell.dot)
                }
            }
        }
    })

    it("returns a fresh state each time", () => {
        const a = createGameState()
        a.cells[1][1] = Cell.none
        a.player.pos.x = 99
        a.locked = true
        const b = createGameState()
        expect(b.cells[1][1]).toBe(Cell.dot)
        expect(b.player.pos).toEqual(PLAYER_START)
        expect(b.locked).toBe(false)
    })
})
