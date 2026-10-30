import { describe, expect, it } from "vite-plus/test"
import { addStatus, addTileEffect, type TileEffect } from "./breath"
import {
    AiType,
    Cell,
    PLAYER_RESPAWN_DELAY,
    PLAYER_SPEED,
    RESPAWN_BLOCK_GRACE,
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
            // Player 2 moves on, and player 1 follows on the same tick (its
            // move waits for player 2's; see the order tests below).
            run(state, [hold(east), hold(east)], 1)
            expect(posOf(state, 1)).toEqual(vec2(6, 1))
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

    describe("following, whichever player is behind", () => {
        // A hall on row 2, with a side corridor north at (3, 1).
        const rows = [
            "##########",
            "### ######",
            "#        #",
            "##########",
            "#.########",
        ]
        const behind = vec2(3, 2)
        const ahead = vec2(4, 2)
        // The game with player `back` (0 or 1) behind the other.
        const line = (back: number) =>
            back === 0
                ? game(behind, ahead, { rows })
                : game(ahead, behind, { rows })
        // Each player's input, the one behind's first given.
        const inputs = (back: number, b: MoveInput, a: MoveInput) =>
            back === 0 ? [b, a] : [a, b]

        // Regression: player 1 was checked against player 2's cell before
        // player 2 moved off it, so it turned down the side corridor.
        it.each([0, 1])(
            "goes straight on, not down an older held way (player %i behind)",
            (back) => {
                const state = line(back)
                const follow = { held: [east, north], pressed: none }
                run(state, inputs(back, follow, hold(east)), 1)
                expect(posOf(state, back)).toEqual(ahead)
                expect(posOf(state, 1 - back)).toEqual(vec2(5, 2))
            }
        )

        it.each([0, 1])(
            "follows on a tap without using it up first (player %i behind)",
            (back) => {
                const state = line(back)
                const tap = { held: [], pressed: east }
                run(state, inputs(back, tap, hold(east)), 1)
                expect(posOf(state, back)).toEqual(ahead)
            }
        )

        it.each([0, 1])(
            "takes an older held way when the other doesn't move (player %i behind)",
            (back) => {
                const state = line(back)
                const follow = { held: [east, north], pressed: none }
                run(state, inputs(back, follow, IDLE), 1)
                expect(posOf(state, back)).toEqual(vec2(3, 1))
            }
        )

        it.each([0, 1])(
            "slides on behind the other (player %i behind)",
            (back) => {
                const ice = ["#########", "# ~~~~~ #", "#########", "#.#######"]
                const state =
                    back === 0
                        ? game(vec2(3, 1), vec2(4, 1), { rows: ice })
                        : game(vec2(4, 1), vec2(3, 1), { rows: ice })
                // The one behind is sliding east from (2, 1).
                state.players[back].character.lastPos = vec2(2, 1)
                run(state, inputs(back, IDLE, hold(east)), 1)
                expect(posOf(state, back)).toEqual(vec2(4, 1))
                expect(posOf(state, 1 - back)).toEqual(vec2(5, 1))
            }
        )
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

    describe("a regrowing wall", () => {
        // A wall at (5, 1) in the hall, opened for 1 s. Player 1 has
        // stepped from (4, 1) into it, and player 2 followed into (4, 1).
        const open: TileEffect = { name: "test.open", opensWall: true }
        function inWall(bump = true): GameState {
            const rows = [...HALL]
            rows[1] = "#    #    #"
            const state = game(vec2(5, 1), vec2(4, 1), { rows, bump })
            addTileEffect(state, vec2(5, 1), open, 1)
            state.players[0].character.lastPos = vec2(4, 1)
            state.players[1].character.lastPos = vec2(3, 1)
            run(state, [IDLE, IDLE], TICK_RATE)
            return state
        }

        // Regression: it put player 1 back where it came from, on player 2.
        it("doesn't push a player onto the other", () => {
            const state = inWall()
            expect(state.cells[1][5]).toBe(Cell.wall)
            expect(posOf(state, 1)).toEqual(vec2(4, 1))
            // The nearest open cell free of player 2.
            expect(posOf(state, 0)).toEqual(vec2(6, 1))
        })

        it("off, pushes a player back onto the other", () => {
            const state = inWall(false)
            expect(posOf(state, 0)).toEqual(vec2(4, 1))
            expect(posOf(state, 1)).toEqual(vec2(4, 1))
        })
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

        // Spawn camping (PM call): after RESPAWN_BLOCK_GRACE held up by the
        // other player, it comes back on the nearest free cell instead.
        const GRACE_TICKS = RESPAWN_BLOCK_GRACE * TICK_RATE

        it("comes back next to its spawn once the other has camped on it for RESPAWN_BLOCK_GRACE", () => {
            const state = onSpawn()
            const p1 = state.players[0]
            run(state, [IDLE, IDLE], GRACE_TICKS - 1)
            expect(p1.out).toBe(true)
            run(state, [IDLE, IDLE], 1)
            expect(p1.out).toBe(false)
            expect(p1.character.pos).toEqual(vec2(2, 1))
            expect(p1.character.lastPos).toEqual(vec2(2, 1))
            expect(state.events).toContainEqual({
                type: "playerRespawned",
                player: 0,
                at: vec2(2, 1),
            })
            expect(posOf(state, 1)).toEqual(vec2(1, 1))
            expect(p1.spawnHeldFor).toBe(0)
        })

        it("still doesn't come back onto or next to an enemy", () => {
            const state = onSpawn()
            const guard = makeEnemy(3, 1)
            guard.speed = 0
            state.enemies.push(guard)
            state.spawns.enemies = [vec2(3, 1)]
            run(state, [IDLE, IDLE], GRACE_TICKS)
            // (2, 1), (3, 1) and (4, 1) are on or next to the enemy.
            expect(state.players[0].out).toBe(false)
            expect(posOf(state, 0)).toEqual(vec2(5, 1))
        })

        it("doesn't count a wait an enemy causes", () => {
            const state = game(vec2(1, 1), vec2(6, 1))
            const guard = makeEnemy(2, 1)
            guard.speed = 0
            state.enemies.push(guard)
            state.spawns.enemies = [vec2(2, 1)]
            const p1 = state.players[0]
            takeOut(p1, 0)
            run(state, [IDLE, IDLE], GRACE_TICKS * 2)
            expect(p1.out).toBe(true)
            expect(p1.spawnHeldFor).toBe(0)
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
