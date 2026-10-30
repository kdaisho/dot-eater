import { describe, expect, it } from "vite-plus/test"
import { addStatus, type EnemyStatus, type TileEffect } from "./breath"
import {
    Cell,
    DOT_ENERGY,
    DOT_POINTS,
    ENEMY_IDS,
    SPLITTER_DROP_SECONDS,
    TICK_RATE,
} from "./constants"
import { createGameState, step, type GameState, type MoveInput } from "./game"
import { parseLevel } from "./level"
import { createRegrow } from "./regrow"
import {
    createSplitter,
    dropDot,
    halfDefeated,
    splitSplitter,
} from "./splitter"
import { fixedRandom, makeBoss, makeState, textMap } from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"

// Splitters dropping dots (KDA-270, rules.splitterDrops).

const TICK = 1 / TICK_RATE
const DROP_TICKS = SPLITTER_DROP_SECONDS * TICK_RATE

function tick(state: GameState, move?: MoveInput) {
    return step(
        state,
        TICK,
        move ?? { held: [], pressed: vec2(0, 0) },
        fixedRandom(0)
    )
}

// A long bare corridor, x 1 to 28 on row 2, with a dot shut away in a
// pocket below.
const corridor = textMap([
    "##############################",
    "##############################",
    "#                            #",
    "##############################",
    "#.############################",
]).map

// The player at the corridor's west end and a whole Splitter at `at`
// (default its east end), with drops on unless `drops` is false.
function setup({ at = vec2(28, 2), drops = true, player = vec2(1, 2) } = {}) {
    const [main, spare] = createSplitter([ENEMY_IDS[0], ENEMY_IDS[1]], at)
    const state = makeState(corridor, player, [main, spare])
    state.spawns.enemies = [at, at]
    state.splitterDrops = drops
    return { state, main, spare }
}

const dropped = (state: GameState) =>
    state.events.filter((e) => e.type === "dotDropped")

describe("a Splitter dropping dots", () => {
    it(`drops one on the cell it leaves every ${SPLITTER_DROP_SECONDS} s`, () => {
        const { state } = setup()
        // It moves a cell every 30 ticks, west from (28, 2). Its first drop
        // is due after SPLITTER_DROP_SECONDS, on its move that tick (its
        // 8th, from (21, 2)); the next one as long again after that.
        const drops: { tick: number; at: Vec2 }[] = []
        for (let t = 1; t <= DROP_TICKS * 2; t++) {
            tick(state)
            for (const e of dropped(state)) {
                drops.push({ tick: t, at: e.at })
                expect(e).toEqual({ type: "dotDropped", enemy: 0, at: e.at })
            }
        }
        expect(drops).toEqual([
            { tick: DROP_TICKS, at: vec2(21, 2) },
            { tick: DROP_TICKS * 2, at: vec2(13, 2) },
        ])
        expect(state.cells[2][21]).toBe(Cell.dot)
        expect(state.cells[2][13]).toBe(Cell.dot)
    })

    it("never drops without the rule", () => {
        const { state } = setup({ drops: false })
        for (let t = 0; t < DROP_TICKS * 2; t++) {
            tick(state)
            expect(dropped(state)).toEqual([])
        }
        expect(state.cells[2].filter((c) => c === Cell.dot)).toEqual([])
    })

    it("skips a cell with a dot and drops on its next move", () => {
        const { state, main } = setup()
        main.part!.dropIn = 0
        state.cells[2][28] = Cell.dot
        for (let t = 0; t < 30; t++) tick(state)
        expect(main.pos).toEqual(vec2(27, 2))
        expect(main.part!.dropIn).toBe(0)
        for (let t = 0; t < 30; t++) tick(state)
        expect(state.cells[2][27]).toBe(Cell.dot)
        expect(main.part!.dropIn).toBe(SPLITTER_DROP_SECONDS)
    })

    it("makes an ordinary dot: eaten, it scores, fills energy and counts", () => {
        // Versus, where dots decide the round.
        const { state } = setup({ player: vec2(24, 2), at: vec2(26, 2) })
        state.mode = "versus"
        state.enemies[0].lastPos = vec2(25, 2)
        state.enemies[0].part!.dropIn = 0
        dropDot(state, 0)
        expect(state.cells[2][25]).toBe(Cell.dot)
        const player = state.players[0]
        player.character.moveProgress = 1
        player.breather.energy = 0
        tick(state, { held: [vec2(1, 0)], pressed: vec2(0, 0) })
        expect(player.character.pos).toEqual(vec2(25, 2))
        expect(player.score).toBe(DOT_POINTS)
        expect(player.dots).toBe(1)
        expect(player.breather.energy).toBe(DOT_ENERGY)
    })
})

describe("dropDot", () => {
    // A due whole Splitter that has just moved from (5, 2) to (4, 2).
    function due() {
        const s = setup({ at: vec2(4, 2) })
        s.main.lastPos = vec2(5, 2)
        s.main.moveProgress = 0.1
        s.main.part!.dropIn = 0
        return s
    }

    it("drops on the cell left, resets the timer and reports it", () => {
        const { state, main } = due()
        dropDot(state, 0)
        expect(state.cells[2][5]).toBe(Cell.dot)
        expect(main.part!.dropIn).toBe(SPLITTER_DROP_SECONDS)
        expect(state.events).toEqual([
            { type: "dotDropped", enemy: 0, at: vec2(5, 2) },
        ])
    })

    it("doesn't drop before it is due", () => {
        const { state, main } = due()
        main.part!.dropIn = TICK
        dropDot(state, 0)
        expect(state.cells[2][5]).toBe(Cell.none)
        expect(state.events).toEqual([])
    })

    it("doesn't drop on a cell a player is on or gliding out of", () => {
        for (const glide of [false, true]) {
            const { state, main } = due()
            const player = state.players[0].character
            player.pos = glide ? vec2(6, 2) : vec2(5, 2)
            player.lastPos = vec2(5, 2)
            player.moveProgress = glide ? 0.5 : 1
            dropDot(state, 0)
            expect(state.cells[2][5], `glide ${glide}`).toBe(Cell.none)
            // Still due, for its next move.
            expect(main.part!.dropIn).toBe(0)
        }
    })

    it("drops where a player out of play was, and next to an enemy", () => {
        const { state } = due()
        state.players[0].character.pos = vec2(5, 2)
        state.players[0].out = true
        dropDot(state, 0)
        expect(state.cells[2][5]).toBe(Cell.dot)
    })

    it("doesn't drop under the boss's footprint, unless it is defeated", () => {
        const room = textMap([
            "#########",
            "#       #",
            "#       #",
            "#       #",
            "#########",
        ]).map
        const [main, spare] = createSplitter(
            [ENEMY_IDS[0], ENEMY_IDS[1]],
            vec2(4, 3)
        )
        main.lastPos = vec2(4, 2)
        main.part!.dropIn = 0
        const state = makeState(room, vec2(1, 1), [main, spare], {
            boss: makeBoss(4, 1, 0),
        })
        state.splitterDrops = true
        dropDot(state, 0)
        expect(state.cells[2][4]).toBe(Cell.none)
        state.boss!.defeated = true
        dropDot(state, 0)
        expect(state.cells[2][4]).toBe(Cell.dot)
    })

    it("doesn't drop on a wall a breath has opened", () => {
        const { state } = due()
        const opens: TileEffect = { name: "test.open", opensWall: true }
        state.tiles.push({ pos: vec2(5, 2), effect: opens, left: 1 })
        dropDot(state, 0)
        expect(state.cells[2][5]).toBe(Cell.none)
    })

    it("doesn't drop while held or harmless", () => {
        for (const status of [
            { name: "test.hold", holds: true },
            { name: "test.harmless", harmless: true },
        ] satisfies EnemyStatus[]) {
            const { state, main } = due()
            addStatus(main, status, 1)
            dropDot(state, 0)
            expect(state.cells[2][5], status.name).toBe(Cell.none)
            main.statuses = []
            dropDot(state, 0)
            expect(state.cells[2][5], status.name).toBe(Cell.dot)
        }
    })

    it("doesn't drop out of play, nor count down", () => {
        const { state, main } = due()
        main.respawnIn = 3
        dropDot(state, 0)
        expect(state.cells[2][5]).toBe(Cell.none)
        main.part!.dropIn = 1
        tick(state)
        expect(main.part!.dropIn).toBe(1)
    })

    it("lets each half drop, starting afresh after a split and when whole again", () => {
        const { state, main, spare } = setup({ at: vec2(14, 2) })
        main.part!.dropIn = 0
        splitSplitter(state, 0)
        expect(main.part!.dropIn).toBe(SPLITTER_DROP_SECONDS)
        expect(spare.part!.dropIn).toBe(SPLITTER_DROP_SECONDS)
        for (const [i, half] of [main, spare].entries()) {
            half.part!.dropIn = 0
            half.lastPos = vec2(10 + i, 2)
            dropDot(state, i)
            expect(state.cells[2][10 + i]).toBe(Cell.dot)
        }
        main.part!.dropIn = 0
        main.respawnIn = 1
        halfDefeated(state, 0)
        halfDefeated(state, 1)
        expect(main.part!.dropIn).toBe(SPLITTER_DROP_SECONDS)
    })

    describe("with regrowing dots", () => {
        it("drops a dot that doesn't regrow once eaten", () => {
            const { state } = due()
            state.regrow = createRegrow({ seconds: 1 }, state.cells)
            dropDot(state, 0)
            state.players[0].character.pos = vec2(6, 2)
            state.players[0].character.lastPos = vec2(6, 2)
            state.players[0].character.moveProgress = 1
            tick(state, { held: [vec2(-1, 0)], pressed: vec2(0, 0) })
            expect(state.players[0].character.pos).toEqual(vec2(5, 2))
            expect(state.regrow!.pending).toEqual([])
        })

        it("brings a map dot waiting to regrow back early, which regrows once eaten", () => {
            const { state } = due()
            state.cells[2][5] = Cell.dot
            state.regrow = createRegrow({ seconds: 10 }, state.cells)
            state.cells[2][5] = Cell.none
            state.regrow!.pending.push({ at: vec2(5, 2), left: 9 })
            dropDot(state, 0)
            expect(state.cells[2][5]).toBe(Cell.dot)
            expect(state.regrow!.pending).toEqual([])
            state.players[0].character.pos = vec2(6, 2)
            state.players[0].character.lastPos = vec2(6, 2)
            state.players[0].character.moveProgress = 1
            tick(state, { held: [vec2(-1, 0)], pressed: vec2(0, 0) })
            expect(state.regrow!.pending).toEqual([
                { at: vec2(5, 2), left: 10 },
            ])
        })
    })
})

describe("createGameState with rules.splitterDrops", () => {
    const lair = {
        name: "lair",
        parTime: 60,
        map: ["#######", "#P....#", "#..B .#", "#.....#", "#E....#", "#######"],
        enemies: [{ ai: "splitter" as const }],
    }

    it("turns drops on", () => {
        const level = parseLevel({ ...lair, rules: { splitterDrops: true } })
        expect(createGameState(level).splitterDrops).toBe(true)
        expect(createGameState(parseLevel(lair)).splitterDrops).toBe(false)
    })
})
