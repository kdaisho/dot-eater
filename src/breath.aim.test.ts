import { describe, expect, it } from "vite-plus/test"
import {
    aimCells,
    aimPreviews,
    breathe,
    type BreathDef,
    type Breather,
} from "./breath"
import { BREATHS } from "./breaths"
import { takeOut, type GameState } from "./game"
import { ANIMAL_IDS, type AnimalId } from "./roster"
import { makeBoss, makeState, textMap } from "./test/helpers"
import { vec2, type Vec2 } from "./vec2"
import { stun } from "./versus"

// The aim preview (KDA-247): where a breath would land, from the same shape
// logic breathe uses.

const east = vec2(1, 0)
const west = vec2(-1, 0)

// Cells as [x, y] pairs, sorted, for shapes whose order isn't the point.
const sorted = (cells: readonly Vec2[]) =>
    cells.map((c) => [c.x, c.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
const xy = (cells: readonly Vec2[]) => cells.map((c) => [c.x, c.y])

// Row 1 wraps round (open at both edges); row 3 has an inner wall at x 4.
const { map } = textMap([
    "#########",
    "         ",
    "#.#.#.#.#",
    "#...#...#",
    "#.......#",
    "#########",
])

// A full meter.
function charge(b: Breather) {
    b.energy = b.breath.maxEnergy
}

// A one-player game with `animal`'s breath at `at`, facing `facing`.
function aimer(
    animal: AnimalId,
    at: { x: number; y: number },
    facing: Vec2 = east
): GameState {
    const state = makeState(map, at, [], { breath: BREATHS[animal] })
    state.players[0].breather.facing = facing
    return state
}

describe("aimCells", () => {
    it("follows the Dragon's line up to the wall, not into it", () => {
        expect(xy(aimCells(aimer("dragon", { x: 1, y: 3 })))).toEqual([
            [2, 3],
            [3, 3],
        ])
    })

    it("is empty for a line facing straight into a wall", () => {
        expect(aimCells(aimer("dragon", { x: 3, y: 3 }))).toEqual([])
    })

    it("follows the Owl's line its whole range", () => {
        expect(xy(aimCells(aimer("owl", { x: 1, y: 4 })))).toEqual([
            [2, 4],
            [3, 4],
            [4, 4],
            [5, 4],
            [6, 4],
        ])
    })

    it("widens the Penguin's cone, with walls casting shadows", () => {
        expect(sorted(aimCells(aimer("penguin", { x: 1, y: 3 })))).toEqual([
            [2, 3],
            [3, 2],
            [3, 3],
            [3, 4],
            [4, 1],
            [4, 4],
        ])
    })

    it("covers the Skunk's 3x3 through open cells, its own cell included", () => {
        expect(sorted(aimCells(aimer("skunk", { x: 1, y: 4 })))).toEqual([
            [1, 3],
            [1, 4],
            [2, 3],
            [2, 4],
        ])
    })

    it("marks the wall the Boar would break", () => {
        expect(xy(aimCells(aimer("boar", { x: 3, y: 3 })))).toEqual([[4, 3]])
    })

    it("marks no outer wall, which the Boar can't break", () => {
        expect(aimCells(aimer("boar", { x: 1, y: 3 }, west))).toEqual([])
    })

    it("marks nothing for the Boar facing open floor, with no wall to break", () => {
        expect(aimCells(aimer("boar", { x: 1, y: 4 }))).toEqual([])
    })

    it("goes through a wrap tunnel", () => {
        expect(xy(aimCells(aimer("dragon", { x: 1, y: 1 }, west)))).toEqual([
            [0, 1],
            [8, 1],
            [7, 1],
            [6, 1],
            [5, 1],
        ])
    })

    it("aims right before the player has moved, as the breath does", () => {
        const state = makeState(map, { x: 1, y: 4 })
        expect(xy(aimCells(state))).toEqual([
            [2, 4],
            [3, 4],
            [4, 4],
            [5, 4],
            [6, 4],
        ])
    })

    describe("with a boss", () => {
        const { map: arena } = textMap([
            "#########",
            "#.......#",
            "#.......#",
            "#.......#",
            "#########",
        ])

        it("ends a line at the live boss's body, its cells there included", () => {
            const state = makeState(arena, { x: 1, y: 2 }, [], {
                boss: makeBoss(4, 1),
            })
            expect(xy(aimCells(state))).toEqual([
                [2, 2],
                [3, 2],
                [4, 2],
            ])
        })

        it("goes past a defeated boss", () => {
            const boss = makeBoss(4, 1)
            boss.defeated = true
            const state = makeState(arena, { x: 1, y: 2 }, [], { boss })
            expect(aimCells(state)).toHaveLength(5)
        })
    })

    it("aims from player 2's own cell, facing and breath", () => {
        const state = makeState(
            map,
            [
                { x: 1, y: 4 },
                { x: 7, y: 4 },
            ],
            [],
            { breath: [BREATHS.dragon, BREATHS.owl] }
        )
        state.players[1].breather.facing = west
        expect(xy(aimCells(state, 1))).toEqual([
            [6, 4],
            [5, 4],
            [4, 4],
            [3, 4],
            [2, 4],
        ])
    })

    // The preview must show what a breath does: whenever one fires, the
    // cells it reports covering are the ones aimed at just before.
    describe("matches what breathe covers", () => {
        const cases: [AnimalId, { x: number; y: number }, Vec2][] = [
            ...ANIMAL_IDS.map(
                (a): [AnimalId, { x: number; y: number }, Vec2] => [
                    a,
                    { x: 1, y: 4 },
                    east,
                ]
            ),
            ["boar", { x: 3, y: 3 }, east],
            ["penguin", { x: 1, y: 3 }, east],
            ["dragon", { x: 1, y: 1 }, west],
            ["skunk", { x: 7, y: 2 }, east],
        ]
        it.each(cases)("%s at %o", (animal, at, facing) => {
            const state = aimer(animal, at, facing)
            charge(state.players[0].breather)
            const aimed = aimCells(state)
            const breathed = breathe(state)
            if (animal === "boar" && at.y === 4) {
                // Nothing to break: refused, as nobody is in the way.
                expect(breathed).toBe(false)
                return
            }
            expect(breathed).toBe(true)
            const event = state.events.find((e) => e.type === "breathed")
            expect(event?.type === "breathed" && xy(event.cells)).toEqual(
                xy(aimed)
            )
        })
    })
})

describe("aimPreviews", () => {
    const two = (breath: BreathDef = BREATHS.dragon) =>
        makeState(
            map,
            [
                { x: 1, y: 4 },
                { x: 1, y: 3 },
            ],
            [],
            { breath, mode: "versus" }
        )

    it("shows nothing while uncharged", () => {
        expect(aimPreviews(aimer("dragon", { x: 1, y: 4 }))).toEqual([])
    })

    it("shows a charged player's aim", () => {
        const state = aimer("dragon", { x: 1, y: 4 })
        charge(state.players[0].breather)
        expect(aimPreviews(state)).toEqual([
            { player: 0, cells: aimCells(state) },
        ])
    })

    it("shows nothing while cooling down, as the meter isn't ready", () => {
        const state = aimer("dragon", { x: 1, y: 4 })
        charge(state.players[0].breather)
        state.players[0].breather.cooldown = 0.5
        expect(aimPreviews(state)).toEqual([])
    })

    it("leaves out a breath that would hit nothing", () => {
        const state = aimer("dragon", { x: 3, y: 3 })
        charge(state.players[0].breather)
        expect(aimPreviews(state)).toEqual([])
    })

    it("shows each charged player's aim, player 1 first", () => {
        const state = two()
        for (const p of state.players) charge(p.breather)
        expect(aimPreviews(state).map((a) => a.player)).toEqual([0, 1])
        expect(xy(aimPreviews(state)[1].cells)).toEqual([
            [2, 3],
            [3, 3],
        ])
    })

    it("leaves out a player out of play", () => {
        const state = two()
        for (const p of state.players) charge(p.breather)
        takeOut(state.players[0], 3)
        expect(aimPreviews(state).map((a) => a.player)).toEqual([1])
    })

    it("leaves out a stunned player", () => {
        const state = two()
        for (const p of state.players) charge(p.breather)
        stun(state.players[1])
        expect(aimPreviews(state).map((a) => a.player)).toEqual([0])
    })
})
