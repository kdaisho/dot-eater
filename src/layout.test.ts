import { describe, expect, it } from "vite-plus/test"
import {
    computeLayout,
    controlsSpace,
    DPAD_SPACE,
    HUD_ROWS,
    MAX_CELL,
    MIN_CELL_PX,
    MIN_FIT_CELL_PX,
    PADDING,
} from "./layout"

describe("computeLayout", () => {
    it("fits the maze plus the HUD strip into the height", () => {
        // 9 rows + 1 HUD row into 400 - 32 px: 36.8 -> 36 px cells.
        const layout = computeLayout(1000, 400, 9, 9)
        expect(layout.cell).toBe(Math.floor((400 - 2 * PADDING) / 10))
        expect(layout.cell).toBe(36)
        expect(layout.hudHeight).toBe(36 * HUD_ROWS)
        expect(layout.width).toBe(36 * 9)
        expect(layout.height).toBe(36 * 10)
    })

    it("fits a wide maze into the width", () => {
        // 20 columns into 500 - 32 px: 23.4 -> 23 px cells.
        const layout = computeLayout(500, 1000, 20, 5)
        expect(layout.cell).toBe(23)
        expect(layout.width).toBe(460)
        expect(layout.height).toBe(23 * 6)
    })

    it("keeps cells square, whole and within bounds", () => {
        expect(computeLayout(5000, 5000, 9, 9).cell).toBe(MAX_CELL)
        expect(computeLayout(50, 50, 9, 9).cell).toBe(MIN_CELL_PX)
        expect(Number.isInteger(computeLayout(777, 555, 9, 9).cell)).toBe(true)
    })

    describe("today's 17x15 stages on small screens", () => {
        // A 17x15 maze plus the HUD row, whole, with `cell` px cells.
        const whole = (cell: number) => ({
            cell,
            width: cell * 17,
            height: cell * 16,
        })

        it("stay whole on an Android phone in portrait", () => {
            // (360 - 32) / 17: 19.3 -> 19 px cells, as before KDA-266.
            expect(computeLayout(360, 740, 17, 15)).toMatchObject(whole(19))
        })

        it("stay whole on an iPhone SE in landscape with the D-pad", () => {
            const room = controlsSpace(667, 375, true)
            const layout = computeLayout(
                667 - room.width,
                375 - room.height,
                17,
                15
            )
            // (667 - 360 - 32) / 17: 16.2 -> 16 px cells.
            expect(layout).toMatchObject(whole(16))
            expect(layout.cell).toBe(MIN_FIT_CELL_PX)
        })

        it("stay whole in a short desktop window", () => {
            // (340 - 32) / 16 rows: 19.25 -> 19 px cells.
            expect(computeLayout(1200, 340, 17, 15)).toMatchObject(whole(19))
        })

        it("follow at MIN_CELL_PX once they'd need cells under MIN_FIT_CELL_PX", () => {
            // (300 - 32) / 17: 15.8 -> 15 px cells to fit.
            const layout = computeLayout(300, 740, 17, 15)
            expect(layout.cell).toBe(MIN_CELL_PX)
            expect(layout.width).toBe(300 - 2 * PADDING)
            expect(layout.height).toBe(MIN_CELL_PX * 16)
        })
    })

    it("follows a 29x21 maze on a phone at MIN_CELL_PX", () => {
        // (390 - 32) / 29: 12.3 px cells to fit, so 20 px cells, the
        // screen's width and every row.
        expect(computeLayout(390, 844, 29, 21)).toMatchObject({
            cell: MIN_CELL_PX,
            width: 390 - 2 * PADDING,
            height: MIN_CELL_PX * 22,
        })
    })

    it("keeps cells at the minimum and the canvas to the viewport when the maze won't fit", () => {
        // 29 columns on a phone in portrait with the D-pad's band: 12 px
        // cells to fit, so 20 px cells and as wide as the screen allows.
        const layout = computeLayout(390, 844 - DPAD_SPACE, 29, 21)
        expect(layout.cell).toBe(MIN_CELL_PX)
        expect(layout.hudHeight).toBe(MIN_CELL_PX * HUD_ROWS)
        expect(layout.width).toBe(390 - 2 * PADDING)
        // The height still fits all 21 rows.
        expect(layout.height).toBe(MIN_CELL_PX * 22)
        expect(layout.pixelWidth).toBe(layout.width)
    })

    it("cuts the canvas along each axis the maze doesn't fit", () => {
        const layout = computeLayout(1000, 300, 29, 21)
        expect(layout.cell).toBe(MIN_CELL_PX)
        expect(layout.width).toBe(MIN_CELL_PX * 29)
        expect(layout.height).toBe(300 - 2 * PADDING)
    })

    it("keeps a cell of maze below the HUD on a tiny viewport", () => {
        const layout = computeLayout(20, 20, 29, 21)
        expect(layout.width).toBe(MIN_CELL_PX)
        expect(layout.height).toBe(MIN_CELL_PX * (HUD_ROWS + 1))
    })

    it("sizes the backing store in device pixels", () => {
        const layout = computeLayout(1000, 400, 9, 9, 2)
        expect(layout.dpr).toBe(2)
        expect(layout.pixelWidth).toBe(layout.width * 2)
        expect(layout.pixelHeight).toBe(layout.height * 2)
        const odd = computeLayout(1000, 400, 9, 9, 1.5)
        expect(odd.pixelWidth).toBe(Math.round(odd.width * 1.5))
        // The CSS size doesn't depend on the ratio.
        expect(odd.cell).toBe(layout.cell)
    })

    it("treats a missing or zero ratio as 1", () => {
        expect(computeLayout(1000, 400, 9, 9).dpr).toBe(1)
        expect(computeLayout(1000, 400, 9, 9, 0).pixelWidth).toBe(36 * 9)
    })
})

describe("controlsSpace", () => {
    it("keeps no room without the D-pad", () => {
        expect(controlsSpace(390, 844, false)).toEqual({ width: 0, height: 0 })
        expect(controlsSpace(844, 390, false)).toEqual({ width: 0, height: 0 })
    })

    it("keeps a band below the maze in portrait", () => {
        expect(controlsSpace(390, 844, true)).toEqual({
            width: 0,
            height: DPAD_SPACE,
        })
        // A square viewport counts as portrait.
        expect(controlsSpace(500, 500, true).height).toBe(DPAD_SPACE)
    })

    it("keeps a band on each side of the maze in landscape", () => {
        expect(controlsSpace(844, 390, true)).toEqual({
            width: 2 * DPAD_SPACE,
            height: 0,
        })
    })
})
