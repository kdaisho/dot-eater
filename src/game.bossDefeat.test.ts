import { describe, expect, it } from "vite-plus/test"
import { damageBoss } from "./boss"
import {
    BIG_BLAST_AT,
    CHAIN,
    CHAIN_BLASTS,
    SHATTER_AT,
    hopHeight,
} from "./bossDefeat"
import { addStatus, defeatEnemy } from "./breath"
import { FROZEN } from "./breaths/penguin"
import { TICK_RATE } from "./constants"
import { takeEvents } from "./events"
import { createGameState, IDLE, settle, step, type GameState } from "./game"
import { parseLevel, type LevelData } from "./level"
import { stage10 } from "./levels/stage10"
import { stage5 } from "./levels/stage5"
import { fixedRandom } from "./test/helpers"

// A boss's defeat played out through step and settle (KDA-301), and the
// final boss's celebration (KDA-303): when the clear jingle (gameWon) comes,
// what moves and what can't, and who hops. The timeline itself is in
// bossDefeat.test.ts.

const TICK = 1 / TICK_RATE

// `data`'s stage (two players, so both are seen to hop), its boss felled by
// player 1 and the tick that notices it stepped: the game is won and the
// outro starts.
function felled(data: LevelData, prepare?: (state: GameState) => void) {
    const state = createGameState(
        parseLevel(data, "medium"),
        ["dragon", "penguin"],
        "coop",
        "medium"
    )
    prepare?.(state)
    damageBoss(state, state.boss!.health)
    const outcome = step(state, TICK, [IDLE, IDLE], fixedRandom(0))
    expect(outcome).toBe("won")
    return state
}

// Settle tick by tick until the outro is over: each tick's events, and the
// tick (from 1) settle first returned true on.
function playOut(state: GameState) {
    const ticks: string[][] = []
    for (let i = 0; i < 10 * TICK_RATE; i++) {
        const done = settle(state, TICK)
        ticks.push(takeEvents(state).map((e) => e.type))
        if (done) return { ticks, doneAt: i + 1 }
    }
    throw new Error("The outro never ended")
}

// The tick (from 1) `type` was reported on, or -1.
function tickOf(ticks: string[][], type: string) {
    return ticks.findIndex((events) => events.includes(type)) + 1 || -1
}

describe("the Kitsune's defeat (stage 5)", () => {
    // Regression (KDA-301): the stage clear came on the killing blow's
    // tick, with no time for the boss's fall.
    it("holds the clear jingle back until the burst ends, at 2.0 s", () => {
        const state = felled(stage5)
        expect(state.events.map((e) => e.type)).not.toContain("gameWon")
        expect(state.defeat).toMatchObject({
            effect: "burst",
            celebrate: false,
        })
        takeEvents(state)
        const { ticks, doneAt } = playOut(state)
        expect(tickOf(ticks, "gameWon")).toBe(2 * TICK_RATE)
        expect(ticks.flat().filter((t) => t === "gameWon")).toHaveLength(1)
        // The stage clear screen follows with the jingle: nobody hops.
        expect(doneAt).toBe(2 * TICK_RATE)
        expect(state.defeat!.hoppers).toEqual([])
    })

    it("shatters once, as the shake ends", () => {
        const state = felled(stage5)
        takeEvents(state)
        const { ticks } = playOut(state)
        expect(tickOf(ticks, "bossShattered")).toBe(
            Math.ceil(SHATTER_AT * TICK_RATE - 1e-9)
        )
        expect(ticks.flat().filter((t) => t === "bossShattered")).toHaveLength(
            1
        )
        expect(ticks.flat()).not.toContain("bossBlast")
    })

    it("freezes the glides for the hit-stop, then lets them finish", () => {
        const state = felled(stage5)
        const player = state.players[0].character
        player.moveProgress = 0.5
        for (let i = 0; i < 0.4 * TICK_RATE - 1; i++) settle(state, TICK)
        expect(player.moveProgress).toBe(0.5)
        for (let i = 0; i < 0.2 * TICK_RATE; i++) settle(state, TICK)
        expect(player.moveProgress).toBe(1)
    })

    it("keeps the boss where it fell", () => {
        const state = felled(stage5, (s) => {
            s.boss!.moveProgress = 0.25
        })
        const boss = state.boss!
        const progress = boss.moveProgress
        playOut(state)
        expect(boss.moveProgress).toBe(progress)
    })
})

describe("the final boss's defeat (stage 10)", () => {
    it("plays the clear jingle at 2.5 s, then the ending follows the hops", () => {
        const state = felled(stage10)
        expect(state.events.map((e) => e.type)).not.toContain("gameWon")
        takeEvents(state)
        const { ticks, doneAt } = playOut(state)
        expect(tickOf(ticks, "gameWon")).toBe(2.5 * TICK_RATE)
        expect(doneAt).toBe(Math.round(4.9 * TICK_RATE))
    })

    it("sets off every small blast, then the big one, in order", () => {
        const state = felled(stage10)
        takeEvents(state)
        const blasts: { tick: number; big: boolean }[] = []
        for (let i = 1; i <= 3 * TICK_RATE; i++) {
            settle(state, TICK)
            for (const e of takeEvents(state)) {
                if (e.type === "bossBlast") blasts.push({ tick: i, big: e.big })
            }
        }
        expect(blasts).toHaveLength(CHAIN_BLASTS + 1)
        expect(blasts.filter((b) => b.big)).toEqual([
            { tick: Math.ceil(BIG_BLAST_AT * TICK_RATE - 1e-9), big: true },
        ])
        expect(blasts.at(-1)!.big).toBe(true)
        expect(blasts[0].tick).toBe(Math.ceil(CHAIN[0].at * TICK_RATE))
    })

    it("has every character still on the map hop: players, then enemies, frozen ones too", () => {
        const state = felled(stage10, (s) => {
            addStatus(s.enemies[0], FROZEN, 5)
            defeatEnemy(s, s.enemies[1])
        })
        const inPlay = state.enemies.flatMap((e, i) =>
            e.respawnIn <= 0 ? [i] : []
        )
        expect(inPlay).not.toContain(1)
        expect(inPlay).toContain(0)
        expect(state.defeat!.hoppers).toEqual([
            { kind: "player", index: 0 },
            { kind: "player", index: 1 },
            ...inPlay.map((index) => ({ kind: "enemy", index })),
        ])
    })

    it("leaves out a player who is out of play", () => {
        const state = felled(stage10, (s) => {
            s.players[1].out = true
        })
        expect(state.defeat!.hoppers[0]).toEqual({ kind: "player", index: 0 })
        expect(state.defeat!.hoppers[1].kind).toBe("enemy")
    })

    it("hops only after the jingle", () => {
        const state = felled(stage10)
        const { defeat } = state
        let hopped = false
        for (let i = 1; i <= 5 * TICK_RATE; i++) {
            settle(state, TICK)
            const up = defeat!.hoppers.some((_, k) => hopHeight(defeat!, k) > 0)
            if (i <= 2.5 * TICK_RATE) expect(up).toBe(false)
            hopped ||= up
        }
        expect(hopped).toBe(true)
    })
})

describe("during the defeat", () => {
    // Everyone and everything as it was: cells, health, positions, scores.
    function snapshot(state: GameState) {
        return JSON.stringify({
            cells: state.cells,
            players: state.players.map((p) => ({
                pos: p.character.pos,
                health: p.health,
                score: p.score,
                out: p.out,
            })),
            enemies: state.enemies.map((e) => ({
                pos: e.pos,
                respawnIn: e.respawnIn,
            })),
            boss: state.boss!.pos,
        })
    }

    for (const [name, data] of [
        ["stage 5", stage5],
        ["stage 10", stage10],
    ] as const) {
        it(`moves nobody and hurts nobody on ${name}, even with an enemy on a player`, () => {
            const state = felled(data, (s) => {
                const p = s.players[0].character.pos
                s.enemies[0].pos = { ...p }
                s.enemies[0].lastPos = { ...p }
            })
            const before = snapshot(state)
            const { ticks } = playOut(state)
            expect(snapshot(state)).toBe(before)
            for (const t of ["hurt", "playerCaught", "gameLost"]) {
                expect(ticks.flat()).not.toContain(t)
            }
        })
    }
})
