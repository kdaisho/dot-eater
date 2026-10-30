import { describe, expect, it } from "vite-plus/test"
import { Cell, Direction } from "./constants"
import {
    canStopAt,
    FREE,
    nextStates,
    slideDistances,
    slideReach,
    slideStep,
} from "./ice"
import type { Level } from "./level"
import { levels } from "./levels"
import { distanceMap } from "./path"
import { cellsFrom, OLD_LEVEL, textMap } from "./test/helpers"
import { allDirections, vec2, type Vec2 } from "./vec2"

const hasIce = (level: Level) => level.ice.some((row) => row.includes(true))

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

// Its checks sweep every stage's maps, which outgrows vitest's 5 s default
// on slow CI machines as stages are added.
describe("slideDistances", { timeout: 30_000 }, () => {
    // Without ice it must be distanceMap exactly, blocked cell included.
    it("without ice equals distanceMap, with or without a blocked cell", () => {
        for (const level of [OLD_LEVEL, ...levels.filter((l) => !hasIce(l))]) {
            const cells = level.cells.map((row) => [...row])
            const noIce = cells.map((row) => row.map(() => false))
            const open: Vec2[] = []
            cells.forEach((row, y) =>
                row.forEach((c, x) => {
                    if (c !== Cell.wall) open.push(vec2(x, y))
                })
            )
            for (const target of open) {
                for (const blocked of [undefined, open[0], open[7]]) {
                    const want = distanceMap(cells, target, blocked)
                    const got = slideDistances(cells, noIce, target, blocked)
                    for (const p of open) {
                        expect(got({ pos: p, heading: FREE })).toBe(
                            want[p.y][p.x]
                        )
                    }
                }
            }
        }
    })

    // (1, 1) floor, ice (2, 1) to (4, 1), floor (5, 1); (3, 1) can only be
    // slid over, and (3, 2) below it hangs off the lane.
    const { map, ice } = textMap(["#######", "# ~~~ #", "###.###", "#######"])
    const cells = cellsFrom(map)
    const free = (x: number, y: number) => ({ pos: vec2(x, y), heading: FREE })

    it("counts a cell first slid over as reached", () => {
        const dist = slideDistances(cells, ice, vec2(3, 1))
        expect(dist(free(1, 1))).toBe(2)
        expect(dist(free(5, 1))).toBe(2)
        expect(
            dist({ pos: vec2(2, 1), heading: heading(Direction.right) })
        ).toBe(1)
    })

    it("counts the slide steps, and is Infinity where a slide always carries past", () => {
        const toEnd = slideDistances(cells, ice, vec2(5, 1))
        expect(toEnd(free(1, 1))).toBe(4)
        // Plain BFS says 3 from (1, 1) via (3, 1), but nothing stops there.
        const offLane = slideDistances(cells, ice, vec2(3, 2))
        expect(offLane(free(1, 1))).toBe(Infinity)
        expect(offLane(free(5, 1))).toBe(Infinity)
        expect(distanceMap(cells, vec2(3, 2))[1][1]).toBe(3)
    })

    it("skips paths through the blocked cell, even mid-slide", () => {
        const dist = slideDistances(cells, ice, vec2(5, 1), vec2(3, 1))
        expect(dist(free(1, 1))).toBe(Infinity)
    })
})
