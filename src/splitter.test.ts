import { describe, expect, it } from "vite-plus/test"
import {
    addStatus,
    defeatEnemy,
    enemyVisible,
    inPlay,
    pushEnemy,
    tickEffects,
} from "./breath"
import {
    AiType,
    CharacterId,
    DEFEAT_POINTS,
    ENEMY_SPEED,
    RESPAWN_BLINK,
    RESPAWN_DELAY,
    SPLITTER_HALF_SPEED,
    TICK_RATE,
} from "./constants"
import type { Character } from "./character"
import { createGameState, step, type GameState } from "./game"
import { parseLevel } from "./level"
import { createSplitter, isSplitterHalf, isWholeSplitter } from "./splitter"
import {
    fixedRandom,
    makeEnemy,
    makeState,
    testBreath,
    textMap,
} from "./test/helpers"
import { vec2 } from "./vec2"

// The Splitter end to end through step() where it matters, with a test
// breath that defeats the first enemy it reaches (the characters' own
// breaths are in src/breaths/).

const TICK = 1 / TICK_RATE

function tick(state: GameState, breath = false) {
    return step(
        state,
        TICK,
        { held: [], pressed: vec2(0, 0), breath },
        fixedRandom(0)
    )
}

function run(state: GameState, n: number) {
    for (let i = 0; i < n; i++) tick(state)
}

const defeating = testBreath({
    shape: { kind: "line", range: 8 },
    fire(hit) {
        if (hit.enemies[0]) hit.defeat(hit.enemies[0])
    },
})

// A closed corridor (x 1 to 9) with a side cell above x 6 and a dot shut
// away in a wall pocket, so clearing it isn't a win.
const corridor = textMap([
    "###########",
    "######.####",
    "#         #",
    "###########",
    "#.#########",
]).map

// The player at the corridor's west end, a whole Splitter at (4, 2) whose
// spawn is (8, 2), and a meter full enough to breathe.
function setup({ lives = 1, at = vec2(4, 2) } = {}) {
    const [main, spare] = createSplitter(
        [CharacterId.enemy1, CharacterId.enemy2],
        at
    )
    const state = makeState(corridor, { x: 1, y: 2 }, [main, spare], {
        breath: defeating,
        lives,
    })
    state.spawns.enemies = [vec2(8, 2), vec2(8, 2)]
    state.breather.energy = 100
    return { state, main, spare }
}

function split() {
    const s = setup()
    tick(s.state, true)
    return s
}

describe("a whole Splitter", () => {
    it("takes two enemy slots, the second out of play", () => {
        const { main, spare } = setup()
        expect(main.ai).toBe(AiType.splitter)
        expect(isWholeSplitter(main)).toBe(true)
        expect(main.speed).toBe(ENEMY_SPEED)
        expect(inPlay(main)).toBe(true)
        expect(inPlay(spare)).toBe(false)
        expect(enemyVisible(spare)).toBe(false)
    })

    it("is built from a level's splitter, the next enemy after both slots", () => {
        const level = parseLevel({
            name: "test",
            parTime: 60,
            map: ["#######", "#PE.E.#", "#.....#", "#######"],
            enemies: [{ ai: "splitter", speed: 1.5 }, { ai: "chase" }],
        })
        const state = createGameState(level)
        expect(state.enemies.map((e) => e.id)).toEqual([
            CharacterId.enemy1,
            CharacterId.enemy2,
            CharacterId.enemy3,
        ])
        expect(state.enemies.map((e) => e.ai)).toEqual([
            AiType.splitter,
            AiType.splitter,
            AiType.chase,
        ])
        expect(state.enemies[0].speed).toBe(1.5)
        expect(state.enemies.map(inPlay)).toEqual([true, false, true])
        expect(state.spawns.enemies).toEqual([
            vec2(2, 1),
            vec2(2, 1),
            vec2(4, 1),
        ])
    })

    it("splits into two halves when a breath defeats it, scoring DEFEAT_POINTS", () => {
        const { state, main, spare } = split()
        expect(state.score).toBe(DEFEAT_POINTS)
        for (const half of [main, spare]) {
            expect(inPlay(half)).toBe(true)
            expect(isSplitterHalf(half)).toBe(true)
            expect(half.speed).toBe(SPLITTER_HALF_SPEED)
            expect(half.ai).toBe(AiType.splitter)
        }
    })

    it("spreads its halves to two different cells, farthest from the player first", () => {
        const { main, spare } = split()
        // Both glide out from the Splitter's cell, (4, 2).
        expect(main.pos).toEqual(vec2(5, 2))
        expect(spare.pos).toEqual(vec2(3, 2))
        expect(main.lastPos).toEqual(vec2(4, 2))
        expect(spare.lastPos).toEqual(vec2(4, 2))
    })

    it("sends its halves up the side way before back towards the player", () => {
        const { state, main, spare } = setup({ at: vec2(6, 2) })
        tick(state, true)
        // (6, 1) and (7, 2) are both 6 from the player; (5, 2) is 4.
        expect([main.pos, spare.pos]).toEqual([vec2(6, 1), vec2(7, 2)])
    })

    it("leaves one half where it was in a dead end", () => {
        // In the side cell, out of the breath's way: split it directly.
        const { state, main, spare } = setup({ at: vec2(6, 1) })
        defeatEnemy(state, main)
        expect(main.pos).toEqual(vec2(6, 2))
        expect(main.lastPos).toEqual(vec2(6, 1))
        expect(spare.pos).toEqual(vec2(6, 1))
        expect(inPlay(spare)).toBe(true)
    })

    it("on the player's cell, starts its halves on their new cells", () => {
        // The Splitter's sprite is still gliding in from (2, 2).
        const { state, main, spare } = setup({ at: vec2(1, 2) })
        main.lastPos = vec2(2, 2)
        main.moveProgress = 0.3
        expect(tick(state, true)).toBeNull()
        expect(state.score).toBe(DEFEAT_POINTS)
        expect(main.pos).toEqual(vec2(2, 2))
        expect(main.lastPos).toEqual(vec2(2, 2))
        expect(inPlay(spare)).toBe(true)
        // A dead end on the player's side: the spare stays as it was.
        expect(spare.pos).toEqual(vec2(1, 2))
    })

    it("isn't split by effects that don't defeat", () => {
        const { state, main, spare } = setup()
        addStatus(main, { name: "test.frozen", holds: true }, 3)
        pushEnemy(state.cells, main, vec2(1, 0), 2)
        run(state, TICK_RATE)
        expect(main.pos).toEqual(vec2(6, 2))
        expect(isWholeSplitter(main)).toBe(true)
        expect(inPlay(spare)).toBe(false)
        expect(state.score).toBe(0)
    })
})

describe("a Splitter's halves", () => {
    it("don't split again: each is defeated for DEFEAT_POINTS", () => {
        const { state, main, spare } = split()
        defeatEnemy(state, spare)
        expect(state.score).toBe(DEFEAT_POINTS * 2)
        expect(inPlay(spare)).toBe(false)
        expect(inPlay(main)).toBe(true)
        expect(isSplitterHalf(main)).toBe(true)
        defeatEnemy(state, main)
        expect(state.score).toBe(DEFEAT_POINTS * 3)
        expect(inPlay(main)).toBe(false)
    })

    it("don't come back by themselves while the other is in play", () => {
        const { state, main, spare } = split()
        defeatEnemy(state, main)
        tickEffects(state, RESPAWN_DELAY * 3)
        expect(inPlay(main)).toBe(false)
        expect(enemyVisible(main)).toBe(false)
        expect(inPlay(spare)).toBe(true)
    })

    it("once both are gone, bring the Splitter back whole at its spawn after RESPAWN_DELAY", () => {
        const { state, main, spare } = split()
        defeatEnemy(state, spare)
        defeatEnemy(state, main)
        expect(main.pos).toEqual(vec2(8, 2))
        run(state, (RESPAWN_DELAY - RESPAWN_BLINK) * TICK_RATE - 1)
        expect(enemyVisible(main)).toBe(false)
        tick(state)
        // Blinking for the last RESPAWN_BLINK seconds.
        expect(enemyVisible(main)).toBe(true)
        run(state, RESPAWN_BLINK * TICK_RATE - 1)
        expect(inPlay(main)).toBe(false)
        tick(state)
        expect(inPlay(main)).toBe(true)
        expect(isWholeSplitter(main)).toBe(true)
        expect(main.speed).toBe(ENEMY_SPEED)
        expect(main.pos).toEqual(vec2(8, 2))
        expect(inPlay(spare)).toBe(false)
        expect(enemyVisible(spare)).toBe(false)
    })

    it("catch the player like any enemy, and a lost life makes the Splitter whole", () => {
        const { state, main, spare } = setup({ lives: 2 })
        tick(state, true)
        // Both halves are drawn near (4, 2), gliding out.
        state.player.pos = vec2(4, 2)
        state.player.lastPos = vec2(4, 2)
        tick(state)
        expect(state.lives).toBe(1)
        expect(isWholeSplitter(main)).toBe(true)
        expect(main.speed).toBe(ENEMY_SPEED)
        expect(inPlay(main)).toBe(true)
        expect(main.pos).toEqual(vec2(8, 2))
        expect(inPlay(spare)).toBe(false)
    })

    it("are reset by a lost life even with one gone, or both and waiting", () => {
        for (const gone of [1, 2]) {
            const catcher = makeEnemy(9, 2, AiType.random)
            const [main, spare] = createSplitter(
                [CharacterId.enemy1, CharacterId.enemy2],
                vec2(4, 2)
            )
            const state = makeState(
                corridor,
                { x: 1, y: 2 },
                [main, spare, catcher],
                { lives: 2 }
            )
            defeatEnemy(state, main)
            const halves: Character[] = [spare, main].slice(0, gone)
            for (const half of halves) defeatEnemy(state, half)
            state.player.pos = vec2(9, 2)
            state.player.lastPos = vec2(9, 2)
            tick(state)
            expect(state.lives).toBe(1)
            expect(inPlay(main)).toBe(true)
            expect(isWholeSplitter(main)).toBe(true)
            expect(main.pos).toEqual(vec2(4, 2))
            expect(inPlay(spare)).toBe(false)
            expect(spare.respawnIn).toBe(Infinity)
        }
    })

    it("take statuses like any enemy", () => {
        const { state, main, spare } = split()
        addStatus(spare, { name: "test.frozen", holds: true }, 1)
        main.moveProgress = 1
        spare.moveProgress = 1
        tick(state)
        expect(spare.pos).toEqual(vec2(3, 2))
        expect(main.pos).not.toEqual(vec2(5, 2))
    })
})
