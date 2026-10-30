import { describe, expect, it } from "vite-plus/test"
import { addStatus } from "./breath"
import {
    AiType,
    PLAYER_RESPAWN_DELAY,
    PLAYER_SPEED,
    START_LIVES,
    TICK_RATE,
} from "./constants"
import type { Character } from "./character"
import {
    createGameState,
    IDLE,
    step,
    takeOut,
    type GameState,
    type Mode,
    type MoveInput,
} from "./game"
import { levels } from "./levels"
import { DEFAULT_ANIMAL } from "./roster"
import { fixedRandom, makeEnemy, makeState, textMap } from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// Players bumping into each other (KDA-262, the Players setting): with
// GameState.playersBump set, a player can't move into the other's cell (the
// one it is on or moving into) and waits there as at a wall. Off, they pass
// through each other (see game.players.test.ts).

const TICK = 1 / TICK_RATE
const none = vec2(0, 0)
const north = vec2(0, -1)
const east = vec2(1, 0)
const west = vec2(-1, 0)
// Ticks per player move at the default speed.
const MOVE = TICK_RATE / PLAYER_SPEED

const hold = (d: Vec2): MoveInput => ({ held: [d], pressed: none })

// An empty hall, x 1 to 9 on row 1, with a dot walled off below so the
// game isn't won.
const HALL = ["###########", "#         #", "###########", "#.#########"]

// A 2-player game (co-op unless `mode` says otherwise) on `rows` with the
// players at `p1` and `p2`, both ready to move, bumping unless `bump` is
// false.
function game(
    p1: Vec2,
    p2: Vec2,
    {
        rows = HALL,
        bump = true,
        mode = "coop",
        enemies = [],
    }: {
        rows?: readonly string[]
        bump?: boolean
        mode?: Mode
        enemies?: Character[]
    } = {}
): GameState {
    const { map, ice } = textMap(rows)
    const state = makeState(map, [p1, p2], enemies, {
        lives: START_LIVES,
        mode,
        ice,
        playersBump: bump,
    })
    for (const { character } of state.players) character.moveProgress = 1
    return state
}

function run(state: GameState, moves: readonly MoveInput[], ticks: number) {
    for (let i = 0; i < ticks; i++) {
        const outcome = step(state, TICK, moves, fixedRandom(0))
        if (outcome) throw new Error(`Ended: ${outcome}`)
    }
}

const posOf = (state: GameState, i: number) => state.players[i].character.pos

describe("players bumping into each other", () => {
    it("is off in a new game", () => {
        const state = createGameState(
            levels[0],
            [DEFAULT_ANIMAL, DEFAULT_ANIMAL],
            "coop"
        )
        expect(state.playersBump).toBe(false)
    })

    it.each(["coop", "versus"] as const)(
        "off, lets the players pass through each other in %s",
        (mode) => {
            const state = game(vec2(4, 1), vec2(6, 1), { bump: false, mode })
            run(state, [hold(east), hold(west)], MOVE * 2)
            expect(posOf(state, 0)).toEqual(vec2(6, 1))
            expect(posOf(state, 1)).toEqual(vec2(4, 1))
        }
    )

    it.each(["coop", "versus"] as const)(
        "stops a player walking into the other in %s, waiting as at a wall",
        (mode) => {
            const state = game(vec2(4, 1), vec2(5, 1), { mode })
            run(state, [hold(east), IDLE], MOVE * 2)
            const p1 = state.players[0]
            expect(p1.character.pos).toEqual(vec2(4, 1))
            // Ready, waiting at exactly 1, facing the way it pushes.
            expect(p1.character.moveProgress).toBe(1)
            expect(p1.breather.facing).toEqual(east)
            // Player 2 moves on. Player 1 moved first on that tick, so it
            // goes on the next.
            run(state, [hold(east), hold(east)], 1)
            expect(posOf(state, 1)).toEqual(vec2(6, 1))
            expect(posOf(state, 0)).toEqual(vec2(4, 1))
            run(state, [hold(east), IDLE], 1)
            expect(posOf(state, 0)).toEqual(vec2(5, 1))
        }
    )

    it("stops player 2 walking into player 1 too", () => {
        const state = game(vec2(4, 1), vec2(5, 1))
        run(state, [IDLE, hold(west)], MOVE * 2)
        expect(posOf(state, 1)).toEqual(vec2(5, 1))
        expect(state.players[1].character.moveProgress).toBe(1)
    })

    it("stops a player walking into the cell the other is moving into", () => {
        const state = game(vec2(4, 1), vec2(5, 1))
        // Player 2 is gliding from (6, 1) into (5, 1).
        const p2 = state.players[1].character
        p2.lastPos = vec2(6, 1)
        p2.moveProgress = 0.2
        run(state, [hold(east), IDLE], 1)
        expect(posOf(state, 0)).toEqual(vec2(4, 1))
    })

    it("lets a player follow right behind the other", () => {
        const state = game(vec2(4, 1), vec2(6, 1))
        // Player 2 is gliding out of (5, 1) into (6, 1).
        const p2 = state.players[1].character
        p2.lastPos = vec2(5, 1)
        p2.moveProgress = 0.1
        run(state, [hold(east), hold(east)], 1)
        expect(posOf(state, 0)).toEqual(vec2(5, 1))
        run(state, [hold(east), hold(east)], MOVE * 2)
        expect(posOf(state, 0).x).toBe(posOf(state, 1).x - 1)
    })

    it("keeps two players next to each other from swapping cells", () => {
        const state = game(vec2(4, 1), vec2(5, 1))
        run(state, [hold(east), hold(west)], MOVE * 2)
        expect(posOf(state, 0)).toEqual(vec2(4, 1))
        expect(posOf(state, 1)).toEqual(vec2(5, 1))
        expect(state.players[0].breather.facing).toEqual(east)
        expect(state.players[1].breather.facing).toEqual(west)
    })

    it("lets player 1 into a cell both head into on one tick; player 2 waits", () => {
        const rows = [...HALL]
        rows[1] = "#    .    #"
        const state = game(vec2(4, 1), vec2(6, 1), { rows })
        run(state, [hold(east), hold(west)], 1)
        const [p1, p2] = state.players
        expect(p1.character.pos).toEqual(vec2(5, 1))
        expect(p1.dots).toBe(1)
        expect(p2.character.pos).toEqual(vec2(6, 1))
        expect(p2.dots).toBe(0)
        expect(p2.character.moveProgress).toBe(1)
        run(state, [IDLE, hold(west)], MOVE * 2)
        expect(p2.character.pos).toEqual(vec2(6, 1))
    })

    it("stops a slide next to the other player, as against a wall", () => {
        // Ice from (2, 2) to (6, 2); player 2 stands on it at (5, 2).
        const rows = [
            "#########",
            "#### ####",
            "# ~~~~~ #",
            "#########",
            "#.#######",
        ]
        const state = game(vec2(1, 2), vec2(5, 2), { rows })
        run(state, [hold(east), IDLE], MOVE * 6)
        const p1 = state.players[0].character
        expect(p1.pos).toEqual(vec2(4, 2))
        expect(p1.moveProgress).toBe(1)
        expect(posOf(state, 1)).toEqual(vec2(5, 2))
        // The slide is over: it is free to make a move of its own.
        run(state, [hold(north), IDLE], 1)
        expect(p1.pos).toEqual(vec2(4, 1))
    })

    it("off, lets a slide carry a player through the other", () => {
        const rows = ["#########", "# ~~~~~ #", "#########", "#.#######"]
        const state = game(vec2(1, 1), vec2(5, 1), { rows, bump: false })
        run(state, [hold(east), IDLE], MOVE * 7)
        expect(posOf(state, 0)).toEqual(vec2(7, 1))
    })

    it("isn't blocked by a player out of play", () => {
        const state = game(vec2(4, 1), vec2(5, 1))
        takeOut(state.players[1], PLAYER_RESPAWN_DELAY)
        run(state, [hold(east), IDLE], 1)
        expect(posOf(state, 0)).toEqual(vec2(5, 1))
    })

    describe("coming back onto a spawn the other player is on", () => {
        // Player 1's spawn is (1, 1); player 2 stands on it.
        function onSpawn(bump = true): GameState {
            const state = game(vec2(1, 1), vec2(3, 1), { bump })
            takeOut(state.players[0], 0)
            const p2 = state.players[1].character
            p2.pos = vec2(1, 1)
            p2.lastPos = vec2(1, 1)
            return state
        }

        it("waits while the other is on it, then comes back", () => {
            const state = onSpawn()
            const p1 = state.players[0]
            run(state, [IDLE, IDLE], MOVE * 2)
            expect(p1.out).toBe(true)
            expect(p1.respawnIn).toBe(0)
            // Player 2 steps off. The wait is checked before anyone
            // moves, so player 1 is back on the next tick.
            run(state, [IDLE, hold(east)], 1)
            expect(posOf(state, 1)).toEqual(vec2(2, 1))
            expect(p1.out).toBe(true)
            run(state, [IDLE, IDLE], 1)
            expect(p1.out).toBe(false)
            expect(p1.character.pos).toEqual(vec2(1, 1))
        })

        it("waits while the other is moving onto it", () => {
            const state = onSpawn()
            const p2 = state.players[1].character
            p2.lastPos = vec2(2, 1)
            p2.moveProgress = 0.3
            run(state, [IDLE, IDLE], 1)
            expect(state.players[0].out).toBe(true)
        })

        it("comes back on top of the other when players pass through", () => {
            const state = onSpawn(false)
            run(state, [IDLE, IDLE], 1)
            expect(state.players[0].out).toBe(false)
            expect(posOf(state, 0)).toEqual(posOf(state, 1))
        })
    })

    it("never blocks an enemy, and an enemy never blocks a player", () => {
        // A harmless chaser goes after player 1 and onto its cell.
        const chaser = makeEnemy(7, 1, AiType.chase)
        addStatus(chaser, { name: "test.calm", harmless: true }, 10)
        chaser.moveProgress = 1
        const state = game(vec2(5, 1), vec2(1, 1), { enemies: [chaser] })
        run(state, [IDLE, IDLE], 1 + TICK_RATE / chaser.speed)
        expect(chaser.pos).toEqual(vec2(5, 1))
        // Player 1 walks through it.
        run(state, [hold(east), IDLE], 1)
        expect(posOf(state, 0)).toEqual(vec2(6, 1))
    })

    it("changes nothing with one player", () => {
        const { map } = textMap(HALL)
        const state = makeState(map, vec2(4, 1), [], { playersBump: true })
        state.players[0].character.moveProgress = 1
        run(state, [hold(east)], MOVE * 2 + 1)
        expect(posOf(state, 0)).toEqual(vec2(7, 1))
    })
})
