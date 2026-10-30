import { describe, expect, it } from "vite-plus/test"
import { Cell, DOT_ENERGY, DOT_POINTS, TICK_RATE } from "./constants"
import {
    createGameState,
    IDLE,
    step,
    takeOut,
    type GameState,
    type MoveInput,
} from "./game"
import { parseLevel, type LevelData } from "./level"
import { createRegrow } from "./regrow"
import {
    fixedRandom,
    makeBoss,
    makeEnemy,
    makeState,
    p2Move,
    textMap,
    type MapLiteral,
} from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// Regrowing dots (KDA-269, rules.regrowDots) through step().

const TICK = 1 / TICK_RATE
const east = vec2(1, 0)
const west = vec2(-1, 0)
const hold = (d: Vec2): MoveInput => ({ held: [d], pressed: vec2(0, 0) })

function tick(state: GameState, move: MoveInput | MoveInput[] = IDLE) {
    return step(state, TICK, move, fixedRandom(0))
}

// Step until the player is ready to move again (its glide done).
function settleMove(state: GameState, move: MoveInput | MoveInput[] = IDLE) {
    tick(state, move)
    for (let i = 0; i < TICK_RATE; i++) {
        if (state.players.every((p) => p.character.moveProgress >= 1)) return
        tick(state)
    }
}

// A hall (1, 1) to (7, 1) of dots, with a dot in a pocket below so a level
// without a boss isn't won. Dots regrow after 1 s.
const hall = textMap(["#########", "#.......#", "#######.#", "#########"]).map

function regrowGame(
    map: MapLiteral = hall,
    players: Vec2 | Vec2[] = vec2(1, 1),
    seconds = 1,
    options: Parameters<typeof makeState>[3] = {}
): GameState {
    const state = makeState(map, players, [], options)
    state.regrow = createRegrow({ seconds }, state.cells)
    for (const p of state.players) p.character.moveProgress = 1
    return state
}

const regrown = (state: GameState) =>
    state.events.filter((e) => e.type === "dotRegrown")

describe("regrowing dots", () => {
    it(`grows an eaten dot back on its cell after the rule's seconds`, () => {
        const state = regrowGame()
        // Eat (2, 1), then (3, 1), and stop there.
        tick(state, hold(east))
        expect(state.cells[1][2]).toBe(Cell.none)
        // Eaten on the first tick, it's back a second (TICK_RATE ticks)
        // later.
        for (let i = 1; i < TICK_RATE; i++) {
            tick(state, i < 20 ? hold(east) : IDLE)
            expect(state.cells[1][2], `tick ${i}`).toBe(Cell.none)
            expect(regrown(state)).toEqual([])
        }
        tick(state)
        expect(state.cells[1][2]).toBe(Cell.dot)
        expect(regrown(state)).toEqual([{ type: "dotRegrown", at: vec2(2, 1) }])
    })

    it("never grows back without the rule", () => {
        const state = makeState(hall, vec2(1, 1))
        state.players[0].character.moveProgress = 1
        tick(state, hold(east))
        for (let i = 0; i < TICK_RATE * 3; i++) tick(state)
        expect(state.cells[1][2]).toBe(Cell.none)
    })

    it("waits while a player stands on the cell, and grows once it leaves", () => {
        const state = regrowGame()
        settleMove(state, hold(east))
        expect(state.players[0].character.pos).toEqual(vec2(2, 1))
        for (let i = 0; i < TICK_RATE * 2; i++) tick(state)
        expect(state.cells[1][2]).toBe(Cell.none)
        // Moving off: not while it is still gliding out of it.
        tick(state, hold(east))
        expect(state.cells[1][2]).toBe(Cell.none)
        let ticks = 1
        while (state.cells[1][2] !== Cell.dot && ticks < TICK_RATE) {
            tick(state)
            ticks++
        }
        expect(state.cells[1][2]).toBe(Cell.dot)
        expect(state.players[0].character.moveProgress).toBeGreaterThanOrEqual(
            1
        )
    })

    it("waits while an enemy is on the cell, but not for one out of play", () => {
        const state = regrowGame()
        // Eat (2, 1) and walk on to (3, 1).
        settleMove(state, hold(east))
        settleMove(state, hold(east))
        const enemy = makeEnemy(2, 1)
        enemy.speed = 0
        enemy.moveProgress = 1
        state.enemies.push(enemy)
        state.spawns = { ...state.spawns, enemies: [vec2(2, 1)] }
        for (let i = 0; i < TICK_RATE * 2; i++) tick(state)
        expect(state.cells[1][2]).toBe(Cell.none)
        enemy.respawnIn = 5
        tick(state)
        expect(state.cells[1][2]).toBe(Cell.dot)
    })

    it("waits under the boss's footprint, but not once it is defeated", () => {
        const arena = textMap([
            "########",
            "#......#",
            "#......#",
            "########",
        ]).map
        const state = regrowGame(arena, vec2(6, 1))
        // A still boss on (2, 1) to (3, 2), over (3, 1), whose dot is due.
        state.boss = makeBoss(2, 1, 0)
        state.boss.moveProgress = 1
        state.cells[1][3] = Cell.none
        state.regrow!.pending.push({ at: vec2(3, 1), left: 0 })
        tick(state)
        expect(state.cells[1][3]).toBe(Cell.none)
        state.boss.defeated = true
        tick(state)
        expect(state.cells[1][3]).toBe(Cell.dot)
    })

    it("waits while a player glides out of the cell, and doesn't count one out of play", () => {
        const state = regrowGame(hall, [vec2(1, 1), vec2(6, 1)], 1, {
            mode: "coop",
        })
        // Player 2 eats (7, 1) and sits there; it then goes out of play.
        settleMove(state, p2Move(hold(east)))
        expect(state.players[1].character.pos).toEqual(vec2(7, 1))
        for (let i = 0; i < TICK_RATE * 2; i++) tick(state)
        expect(state.cells[1][7]).toBe(Cell.none)
        takeOut(state.players[1], null)
        tick(state)
        expect(state.cells[1][7]).toBe(Cell.dot)
    })

    it("regrows only the map's dots", () => {
        const state = regrowGame()
        // (1, 1) was the player's start, empty from the start; a dot put
        // there later (as a Splitter drops one) doesn't come back once eaten.
        state.cells[1][1] = Cell.dot
        state.players[0].character.pos = vec2(2, 1)
        state.players[0].character.lastPos = vec2(2, 1)
        state.cells[1][2] = Cell.none
        tick(state, hold(west))
        expect(state.cells[1][1]).toBe(Cell.none)
        expect(state.regrow!.pending).toEqual([])
    })

    it("makes an ordinary dot: eaten again it scores, fills energy and regrows again", () => {
        const state = regrowGame()
        settleMove(state, hold(east))
        settleMove(state, hold(east))
        // Back at (3, 1), (2, 1) behind it regrows a second after eating.
        for (let i = 0; i < TICK_RATE; i++) tick(state)
        expect(state.cells[1][2]).toBe(Cell.dot)
        const player = state.players[0]
        const { score, dots } = player
        player.breather.energy = 0
        settleMove(state, hold(west))
        expect(player.score).toBe(score + DOT_POINTS)
        expect(player.dots).toBe(dots + 1)
        expect(player.breather.energy).toBe(DOT_ENERGY)
        // (3, 1), eaten before, waits for the player gliding out of it.
        expect(state.regrow!.pending.map((p) => p.at)).toEqual([
            vec2(3, 1),
            vec2(2, 1),
        ])
    })

    it("counts toward a versus player's dots", () => {
        const state = regrowGame(hall, [vec2(1, 1), vec2(4, 1)], 1, {
            mode: "versus",
        })
        // Player 1 eats (2, 1) and walks on past; player 2 takes it once
        // it is back.
        settleMove(state, hold(east))
        settleMove(state, hold(east))
        for (let i = 0; i < TICK_RATE; i++) tick(state)
        expect(state.cells[1][2]).toBe(Cell.dot)
        state.players[1].character.pos = vec2(3, 1)
        state.players[1].character.lastPos = vec2(3, 1)
        state.players[0].character.pos = vec2(5, 1)
        state.players[0].character.lastPos = vec2(5, 1)
        const before = state.players[1].dots
        tick(state, p2Move(hold(west)))
        expect(state.players[1].dots).toBe(before + 1)
    })
})

describe("createGameState with rules.regrowDots", () => {
    const data: LevelData = {
        name: "regrow",
        parTime: 60,
        map: ["#######", "#PQ...#", "#######"],
        enemies: [],
        rules: { regrowDots: { seconds: 2.5 } },
    }

    it("regrows the level's dots, at its seconds", () => {
        const game = createGameState(parseLevel(data))
        expect(game.regrow?.seconds).toBe(2.5)
        expect(game.regrow?.pending).toEqual([])
        expect(game.regrow?.home[1]).toEqual([
            false,
            false,
            true,
            true,
            true,
            true,
            false,
        ])
    })

    it("doesn't regrow player 2's spawn in a 2-player game", () => {
        const game = createGameState(
            parseLevel(data),
            ["dragon", "owl"],
            "coop"
        )
        expect(game.regrow?.home[1][2]).toBe(false)
    })

    it("has none without the rule", () => {
        const { rules: _, ...plain } = data
        expect(createGameState(parseLevel(plain)).regrow).toBeNull()
    })
})
