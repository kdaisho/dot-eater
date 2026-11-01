import { describe, expect, it } from "vite-plus/test"
import {
    clampView,
    easeView,
    FOLLOW_RATE,
    inView,
    VIEW_MARGIN,
    viewFor,
    viewOrigin,
    type View,
} from "./camera"
import { vec2 } from "./vec2"

// A 29x21 maze on a phone in portrait: 358 x 440 CSS px of maze, so at 20 px
// cells the view shows 17.9 x 22 cells: too narrow for the maze, tall
// enough for all of it.
const maze = { cols: 29, rows: 21 }
const phone = { width: 358, height: 440 }
const MIN = 20

describe("viewFor", () => {
    it("shows a maze that fits whole, whole, at the fitting size", () => {
        const view = viewFor(
            { cols: 17, rows: 15 },
            { width: 17 * 24, height: 15 * 24 },
            [vec2(1, 13)],
            MIN
        )
        expect(view).toEqual({ x: 8.5, y: 7.5, cell: 24 })
    })

    it("zooms in to the minimum cell size and centres on one player", () => {
        const view = viewFor(maze, phone, [vec2(14, 9)], MIN)
        expect(view.cell).toBe(MIN)
        expect(view.x).toBe(14.5)
    })

    it("centres an axis the whole maze fits along", () => {
        const view = viewFor(maze, phone, [vec2(14, 2)], MIN)
        expect(view.y).toBe(10.5)
    })

    it("never shows beyond the maze's edges", () => {
        const span = phone.width / MIN
        expect(viewFor(maze, phone, [vec2(1, 19)], MIN).x).toBeCloseTo(span / 2)
        expect(viewFor(maze, phone, [vec2(27, 19)], MIN).x).toBeCloseTo(
            29 - span / 2
        )
        // Mid-glide through a tunnel, poking over the edge.
        expect(viewFor(maze, phone, [vec2(-0.4, 10)], MIN).x).toBeCloseTo(
            span / 2
        )
    })

    it("follows the midpoint of two players close together", () => {
        const view = viewFor(maze, phone, [vec2(10, 5), vec2(14, 9)], MIN)
        expect(view.cell).toBe(MIN)
        expect(view.x).toBe(12.5)
    })

    it("zooms out to keep two players in view, with a margin", () => {
        const a = vec2(5, 10)
        const b = vec2(21, 10)
        const view = viewFor(maze, phone, [a, b], MIN)
        // 16 cells apart plus the margin each side.
        expect(view.cell).toBeCloseTo(phone.width / (16 + 2 * VIEW_MARGIN))
        expect(view.cell).toBeLessThan(MIN)
        expect(view.x).toBe(13.5)
        for (const p of [a, b]) {
            expect(inView(view, phone, p, 0)).toBe(true)
            expect(inView(view, phone, vec2(p.x - 2, p.y), 0)).toBe(true)
            expect(inView(view, phone, vec2(p.x + 2, p.y), 0)).toBe(true)
        }
    })

    it("zooms out no further than the whole maze", () => {
        const view = viewFor(maze, phone, [vec2(1, 1), vec2(27, 19)], MIN)
        expect(view).toEqual({ x: 14.5, y: 10.5, cell: phone.width / 29 })
    })

    it("shows the whole maze with nobody to follow", () => {
        expect(viewFor(maze, phone, [], MIN)).toEqual({
            x: 14.5,
            y: 10.5,
            cell: phone.width / 29,
        })
    })

    it("doesn't zoom out for one player on a tiny screen", () => {
        // Under 6 cells across at 20 px: narrower than the margins.
        const tiny = { width: 100, height: 100 }
        expect(viewFor(maze, tiny, [vec2(14, 9)], MIN).cell).toBe(MIN)
        expect(viewFor(maze, tiny, [vec2(14, 9), vec2(14, 9)], MIN).cell).toBe(
            MIN
        )
    })
})

describe("clampView", () => {
    it("keeps the cell size between the whole maze's and the minimum", () => {
        const fit = phone.width / 29
        expect(
            clampView({ x: 14.5, y: 10.5, cell: 50 }, maze, phone, MIN)
        ).toMatchObject({ cell: MIN })
        expect(
            clampView({ x: 14.5, y: 10.5, cell: 1 }, maze, phone, MIN).cell
        ).toBe(fit)
    })

    it("pulls the centre back inside the maze", () => {
        const view = clampView({ x: -5, y: 50, cell: MIN }, maze, phone, MIN)
        expect(view.x).toBeCloseTo(phone.width / MIN / 2)
        expect(view.y).toBe(10.5)
    })
})

describe("easeView", () => {
    const from: View = { x: 0, y: 0, cell: 20 }
    const to: View = { x: 10, y: -4, cell: 10 }

    it("stays put with no time passed", () => {
        expect(easeView(from, to, 0)).toEqual(from)
    })

    it("closes the gap by the same share per second, however the frames fall", () => {
        const once = easeView(from, to, 0.1)
        const twice = easeView(easeView(from, to, 0.05), to, 0.05)
        expect(twice.x).toBeCloseTo(once.x)
        expect(twice.y).toBeCloseTo(once.y)
        expect(twice.cell).toBeCloseTo(once.cell)
        const k = 1 - Math.exp(-FOLLOW_RATE * 0.1)
        expect(once.x).toBeCloseTo(10 * k)
        expect(once.cell).toBeCloseTo(20 - 10 * k)
    })

    it("moves part of the way, not past the target", () => {
        const step = easeView(from, to, 1 / 60)
        expect(step.x).toBeGreaterThan(0)
        expect(step.x).toBeLessThan(10)
    })

    it("gets there after a long while", () => {
        const late = easeView(from, to, 10)
        expect(late.x).toBeCloseTo(10)
        expect(late.y).toBeCloseTo(-4)
        expect(late.cell).toBeCloseTo(10)
    })
})

describe("viewOrigin", () => {
    it("is the maze point at the viewport's top left", () => {
        expect(viewOrigin({ x: 10, y: 5, cell: 20 }, phone)).toEqual(
            vec2(10 - 358 / 40, 5 - 11)
        )
    })
})

describe("inView", () => {
    const view: View = { x: 10, y: 10, cell: 20 }
    const small = { width: 200, height: 200 }

    it("tells what is inside the view, with some reach", () => {
        // The view shows edges 5..15: cell centres 4.5..14.5.
        expect(inView(view, small, vec2(4.5, 10), 0)).toBe(true)
        expect(inView(view, small, vec2(3, 10), 0)).toBe(false)
        expect(inView(view, small, vec2(3, 10))).toBe(true)
        expect(inView(view, small, vec2(10, 17))).toBe(false)
    })
})
