import { describe, expect, it } from "vite-plus/test"
import { Direction } from "./constants"
import { canStopAt, FREE, nextStates, slideReach, slideStep } from "./ice"
import { distanceMap } from "./path"
import { cellsFrom, OLD_LEVEL, textMap } from "./test/helpers"
import { allDirections, vec2 } from "./vec2"

const heading = (d: Direction) => allDirections.indexOf(d)

describe("slideStep", () => {
    // Floor at (1, 1), ice from (2, 1) to (4, 1), then a wall; a tunnel row
    // of ice below.
    const { map, ice } = textMap(["######", "# ~~~#", "~~~~ ~", "######"])
    const cells = cellsFrom(map)

    it("keeps the direction of the latest move onto ice", () => {
        expect(slideStep(cells, ice, vec2(2, 1), vec2(1, 1))).toEqual(
            vec2(1, 0)
        )
        expect(slideStep(cells, ice, vec2(3, 1), vec2(4, 1))).toEqual(
            vec2(-1, 0)
        )
    })

    it("is null off ice", () => {
        expect(slideStep(cells, ice, vec2(1, 1), vec2(2, 1))).toBeNull()
    })

    it("is null for a character that hasn't moved", () => {
        expect(slideStep(cells, ice, vec2(3, 1), vec2(3, 1))).toBeNull()
    })

    it("is null with a wall next in that direction", () => {
        expect(slideStep(cells, ice, vec2(4, 1), vec2(3, 1))).toBeNull()
        // Arrived from below, heading up into the wall at (2, 0).
        expect(slideStep(cells, ice, vec2(2, 1), vec2(2, 2))).toBeNull()
    })

    it("carries on through a wrap tunnel, and across one", () => {
        // At the left edge heading west: the next cell is the right edge.
        expect(slideStep(cells, ice, vec2(0, 2), vec2(1, 2))).toEqual(
            vec2(-1, 0)
        )
        // Just came in at the right edge from the left one.
        expect(slideStep(cells, ice, vec2(5, 2), vec2(0, 2))).toEqual(
            vec2(-1, 0)
        )
    })

    it("is null for a jump of more than one cell", () => {
        expect(slideStep(cells, ice, vec2(4, 1), vec2(2, 1))).toBeNull()
    })
})

describe("nextStates", () => {
    const { map, ice } = textMap(["#####", "# ~ #", "#####"])
    const cells = cellsFrom(map)

    it("offers every open way when free, sliding where a move lands on ice", () => {
        expect(
            nextStates(cells, ice, { pos: vec2(1, 1), heading: FREE })
        ).toEqual([{ pos: vec2(2, 1), heading: heading(Direction.right) }])
    })

    it("offers only the slide step while sliding", () => {
        expect(
            nextStates(cells, ice, {
                pos: vec2(2, 1),
                heading: heading(Direction.right),
            })
        ).toEqual([{ pos: vec2(3, 1), heading: FREE }])
    })
})

describe("slideReach", () => {
    it("without ice is plain reachability, with nothing stuck", () => {
        const cells = OLD_LEVEL.cells.map((row) => [...row])
        const spawn = OLD_LEVEL.playerSpawns[0]
        const reach = slideReach(cells, OLD_LEVEL.ice, spawn)
        const dist = distanceMap(cells, spawn)
        expect(reach.visited).toEqual(
            dist.map((row) => row.map((d) => d !== Infinity))
        )
        expect(reach.stuck).toEqual([])
        expect(reach.states.every((s) => s.heading === FREE)).toBe(true)
    })

    it("only stops on ice where a wall ends the slide", () => {
        const { map, ice } = textMap(["#######", "#  ~~~#", "#######"])
        const reach = slideReach(cellsFrom(map), ice, vec2(1, 1))
        expect(reach.visited[1].slice(1, 6)).toEqual([
            true,
            true,
            true,
            true,
            true,
        ])
        expect(canStopAt(reach.states, vec2(3, 1))).toBe(false)
        expect(canStopAt(reach.states, vec2(4, 1))).toBe(false)
        expect(canStopAt(reach.states, vec2(5, 1))).toBe(true)
        expect(reach.stuck).toEqual([])
    })

    it("finds the states the player can't get back to the start from", () => {
        // Down from (2, 1) stops on the ice at (2, 2); after sliding off it
        // sideways, the player only ever slides between the end walls.
        const { map, ice } = textMap(["######", "##.###", "#~~~~#", "######"])
        const reach = slideReach(cellsFrom(map), ice, vec2(2, 1))
        expect(canStopAt(reach.stuck, vec2(1, 2))).toBe(true)
        expect(canStopAt(reach.stuck, vec2(4, 2))).toBe(true)
        // Standing on (2, 2) after coming down isn't stuck: up is open.
        expect(canStopAt(reach.stuck, vec2(2, 2))).toBe(false)
        expect(canStopAt(reach.states, vec2(2, 2))).toBe(true)
    })
})
